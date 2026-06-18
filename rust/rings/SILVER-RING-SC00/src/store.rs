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
const MAX_BODY_BYTES: usize = 1_048_576; // 1 MiB
const BODY_READ_TIMEOUT_SECS: u64 = 10;

/// Read an HTTP response body with a hard byte cap and timeout to prevent
/// OOM from malicious or misbehaving servers.
async fn read_body_limited(resp: reqwest::Response, max_bytes: usize) -> Result<String, AppError> {
    let bytes = match tokio::time::timeout(Duration::from_secs(BODY_READ_TIMEOUT_SECS), resp.bytes()).await {
        Ok(Ok(b)) => b,
        Ok(Err(e)) => return Err(AppError::Secrets(SecretsError::Api {
            status: 0,
            message: format!("failed to read response body: {}", e),
        })),
        Err(_) => return Err(AppError::Secrets(SecretsError::Api {
            status: 0,
            message: "response body read timed out".into(),
        })),
    };
    if bytes.len() > max_bytes {
        return Err(AppError::Secrets(SecretsError::Api {
            status: 0,
            message: format!("response body too large: {} bytes (max {})", bytes.len(), max_bytes),
        }));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Read an HTTP response body with a hard byte cap and timeout, then parse JSON.
async fn read_json_limited<T: serde::de::DeserializeOwned>(resp: reqwest::Response, max_bytes: usize) -> Result<T, AppError> {
    let bytes = match tokio::time::timeout(Duration::from_secs(BODY_READ_TIMEOUT_SECS), resp.bytes()).await {
        Ok(Ok(b)) => b,
        Ok(Err(e)) => return Err(AppError::Secrets(SecretsError::Api {
            status: 0,
            message: format!("failed to read response body: {}", e),
        })),
        Err(_) => return Err(AppError::Secrets(SecretsError::Api {
            status: 0,
            message: "response body read timed out".into(),
        })),
    };
    if bytes.len() > max_bytes {
        return Err(AppError::Secrets(SecretsError::Api {
            status: 0,
            message: format!("response body too large: {} bytes (max {})", bytes.len(), max_bytes),
        }));
    }
    serde_json::from_slice(&bytes).map_err(|e| AppError::Secrets(SecretsError::Api {
        status: 0,
        message: format!("json parse error: {}", e),
    }))
}

struct SecretCache {
    access_token: Option<String>,
    token_expires_at: Option<chrono::DateTime<chrono::Utc>>,
    secrets: HashMap<String, (String, Instant)>,
}

impl std::fmt::Debug for SecretCache {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SecretCache")
            .field("access_token", &"[REDACTED]")
            .field("token_expires_at", &self.token_expires_at)
            .field("secrets", &format!("[{} entries]", self.secrets.len()))
            .finish()
    }
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

impl std::fmt::Debug for InfisicalStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("InfisicalStore")
            .field("client_id", &"[REDACTED]")
            .field("client_secret", &"[REDACTED]")
            .field("project_id", &"[REDACTED]")
            .field("environment", &self.environment)
            .field("http", &self.http)
            .field("cache", &self.cache)
            .finish()
    }
}

impl InfisicalStore {
    pub fn new(client_id: &str, client_secret: &str, project_id: &str, environment: &str) -> Result<Self, AppError> {
        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(10)
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

    #[tracing::instrument(skip_all)]
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
            let body = read_body_limited(resp, MAX_BODY_BYTES).await?;
            let truncated = trios_mb_types::truncate_for_log(&body, 4096);
            return Err(AppError::Secrets(SecretsError::Auth(format!("{}: {}", status, truncated))));
        }

        let body: serde_json::Value = read_json_limited(resp, MAX_BODY_BYTES).await?;

        let token = body["accessToken"].as_str()
            .ok_or_else(|| AppError::Secrets(SecretsError::Auth("No accessToken in response".into())))?
            .to_string();

        let expires_at = chrono::Utc::now() + chrono::Duration::minutes(55);
        cache.access_token = Some(token.clone());
        cache.token_expires_at = Some(expires_at);

        Ok(token)
    }

    #[tracing::instrument(skip_all)]
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
            let body = read_body_limited(resp, MAX_BODY_BYTES).await?;
            let truncated = trios_mb_types::truncate_for_log(&body, 4096);
            return Err(AppError::Secrets(SecretsError::Api { status, message: truncated.to_string() }));
        }

        let body: serde_json::Value = read_json_limited(resp, MAX_BODY_BYTES).await?;

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
    #[tracing::instrument(skip_all)]
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

    #[tracing::instrument(skip_all)]
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

    #[tracing::instrument(skip_all)]
    async fn reload(&self) -> Result<(), AppError> {
        {
            let mut cache = self.cache.write().await;
            cache.secrets.clear();
        }
        self.load_secrets().await
    }

    #[tracing::instrument(skip_all)]
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
