use async_trait::async_trait;
use trios_mb_types::AppError;

#[async_trait]
pub trait SecretStore: Send + Sync {
    async fn get(&self, key: &str) -> Result<String, AppError>;

    async fn get_all(&self, keys: &[&str]) -> Result<std::collections::HashMap<String, String>, AppError>;

    async fn reload(&self) -> Result<(), AppError>;

    async fn health_check(&self) -> Result<bool, AppError>;
}
