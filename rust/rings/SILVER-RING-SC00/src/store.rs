use async_trait::async_trait;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use trios_mb_traits::SecretStore;
use trios_mb_types::errors::SecretsError;
use trios_mb_types::AppError;

const INFISICAL_API_URL: &str = "https://app.infisical.com/api";
const MAX_SECRET_CACHE_ENTRIES: usize = 1000;
const SECRET_CACHE_TTL: Duration = Duration::from_secs(5 * 60); // 5 minutes per key

struct SecretCache {
    access_token: Option<String>,
    token_expires_at: Option<chrono::DateTime<chrono::Utc>>,
    secrets: HashMap<String, (String, Instant)>,
}

impl SecretCache {
    fn new() -> Self {
        Self {
            access_token: None,
            token_expires_at: None,
            secrets: HashMap::new(),
        }
    }

    /// Check if a specific secret entry is still within its TTL.
    fn is_entry_fresh(&self, key: &str) -> bool {
        match self.secrets.get(key) {
            Some((_, loaded)) => loaded.elapsed() < SECRET_CACHE_TTL,
            None => false,
        }
    }

    /// Insert a secret, evicting the oldest entries if over capacity.
    fn insert(&mut self, key: String, value: String) {
        if self.secrets.len() >= MAX_SECRET_CACHE_ENTRIES {
            // Evict the oldest entry by insertion time
            let oldest = self.secrets
                .iter()
                .min_by_key(|(_, (_, loaded))| *loaded)
                .map(|(k, _)| k.clone());
            if let Some(k) = oldest {
                self.secrets.remove(&k);
                tracing::warn!(evicted_key = %k, "Secret cache at capacity; evicted oldest entry");
            }
        }
        self.secrets.insert(key, (value, Instant::now()));
    }
}

pub struct InfisicalStore {
    client_id: String,
    client_secret: String,
    project_id: String,
    environment: String,
    http: Client,
    cache: Arc<RwLock<SecretCache>>,
}

impl InfisicalStore {
    pub fn new(client_id: &str, client_secret: &str, project_id: &str, environment: &str) -> Result<Self, AppError> {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build Infisical reqwest client: {}", e)))?;
        Ok(Self {
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            project_id: project_id.to_string(),
            environment: environment.to_string(),
            http,
            cache: Arc::new(RwLock::new(SecretCache::new())),
        })
    }

    async fn authenticate(&self) -> Result<String, AppError> {
        let mut cache = self.cache.write().await;

        if let (Some(token), Some(expires)) = (&cache.access_token, cache.token_expires_at) {
            if chrono::Utc::now() < expires {
                return Ok(token.clone());
            }
        }

        let resp = self.http
            .post(format!("{}/v2/auth/universal-auth/login", INFISICAL_API_URL))
            .json(&serde_json::json!({
                "clientId": self.client_id,
                "clientSecret": self.client_secret,
            }))
            .send()
            .await
            .map_err(|e| AppError::Secrets(SecretsError::Auth(e.to_string())))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await
                .map_err(|e| AppError::Secrets(SecretsError::Auth(format!("failed to read error body: {}", e))))?;
            return Err(AppError::Secrets(SecretsError::Auth(format!("{}: {}", status, body))));
        }

        let body: serde_json::Value = resp.json().await
            .map_err(|e| AppError::Secrets(SecretsError::Auth(e.to_string())))?;

        let token = body["accessToken"].as_str()
            .ok_or_else(|| AppError::Secrets(SecretsError::Auth("No accessToken in response".into())))?
            .to_string();

        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(55);
        cache.access_token = Some(token.clone());
        cache.token_expires_at = Some(expires_at);

        Ok(token)
    }

    async fn load_secrets(&self) -> Result<(), AppError> {
        let token = self.authenticate().await?;

        let resp = self.http
            .get(format!("{}/v3/secrets/raw", INFISICAL_API_URL))
            .query(&[
                ("workspaceId", self.project_id.as_str()),
                ("environment", self.environment.as_str()),
            ])
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await
            .map_err(|e| AppError::Secrets(SecretsError::Api { status: 0, message: e.to_string() }))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await
                .map_err(|e| AppError::Secrets(SecretsError::Api { status: 0, message: format!("failed to read error body: {}", e) }))?;
            return Err(AppError::Secrets(SecretsError::Api { status, message: body }));
        }

        let body: serde_json::Value = resp.json().await
            .map_err(|e| AppError::Secrets(SecretsError::Api { status: 0, message: e.to_string() }))?;

        let mut cache = self.cache.write().await;

        if let Some(secrets) = body["secrets"].as_array() {
            for secret in secrets {
                if let (Some(key), Some(value)) = (secret["key"].as_str(), secret["value"].as_str()) {
                    cache.insert(key.to_string(), value.to_string());
                }
            }
        }

        Ok(())
    }
}

#[async_trait]
impl SecretStore for InfisicalStore {
    async fn get(&self, key: &str) -> Result<String, AppError> {
        {
            let cache = self.cache.read().await;
            if cache.is_entry_fresh(key) {
                if let Some((value, _)) = cache.secrets.get(key) {
                    return Ok(value.clone());
                }
            }
        }

        self.load_secrets().await?;

        let cache = self.cache.read().await;
        cache.secrets.get(key)
            .map(|(v, _)| v.clone())
            .ok_or_else(|| AppError::Secrets(SecretsError::NotFound { key: key.to_string() }))
    }

    async fn get_all(&self, keys: &[&str]) -> Result<HashMap<String, String>, AppError> {
        let mut result = HashMap::new();
        let mut stale = Vec::new();

        {
            let cache = self.cache.read().await;
            for key in keys {
                if cache.is_entry_fresh(key) {
                    if let Some((value, _)) = cache.secrets.get(*key) {
                        result.insert(key.to_string(), value.clone());
                    }
                } else {
                    stale.push(*key);
                }
            }
        }

        if !stale.is_empty() {
            self.load_secrets().await?;
            let cache = self.cache.read().await;
            for key in stale {
                if let Some((value, _)) = cache.secrets.get(key) {
                    result.insert(key.to_string(), value.clone());
                }
            }
        }

        Ok(result)
    }

    async fn reload(&self) -> Result<(), AppError> {
        {
            let mut cache = self.cache.write().await;
            cache.secrets.clear();
        }
        self.load_secrets().await
    }

    async fn health_check(&self) -> Result<bool, AppError> {
        match self.authenticate().await {
            Ok(_) => Ok(true),
            Err(e) => {
                tracing::error!("Infisical health check failed: {}", e);
                Ok(false)
            }
        }
    }
}
