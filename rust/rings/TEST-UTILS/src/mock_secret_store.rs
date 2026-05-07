use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use trios_mb_traits::SecretStore;
use trios_mb_types::AppError;

#[derive(Debug, Default)]
struct Inner {
    secrets: HashMap<String, String>,
    reload_count: u32,
}

#[derive(Debug, Clone)]
pub struct MockSecretStore {
    inner: Arc<Mutex<Inner>>,
}

impl MockSecretStore {
    pub fn new(secrets: HashMap<String, String>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                secrets,
                reload_count: 0,
            })),
        }
    }

    pub fn empty() -> Self {
        Self::new(HashMap::new())
    }

    pub async fn reload_count(&self) -> u32 {
        self.inner.lock().await.reload_count
    }
}

#[async_trait]
impl SecretStore for MockSecretStore {
    async fn get(&self, key: &str) -> Result<String, AppError> {
        let inner = self.inner.lock().await;
        inner
            .secrets
            .get(key)
            .cloned()
            .ok_or_else(|| AppError::Secrets(trios_mb_types::errors::SecretsError::NotFound {
                key: key.to_string(),
            }))
    }

    async fn get_all(&self, keys: &[&str]) -> Result<HashMap<String, String>, AppError> {
        let inner = self.inner.lock().await;
        let mut result = HashMap::new();
        for key in keys {
            if let Some(val) = inner.secrets.get(*key) {
                result.insert(key.to_string(), val.clone());
            }
        }
        Ok(result)
    }

    async fn reload(&self) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        inner.reload_count += 1;
        Ok(())
    }

    async fn health_check(&self) -> Result<bool, AppError> {
        Ok(true)
    }
}
