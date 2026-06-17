use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub infisical_client_id: String,
    pub infisical_client_secret: String,
    pub infisical_project_id: String,
    pub infisical_environment: String,
    pub database_url: String,
    pub is_production: bool,
    pub http_port: u16,
    pub admin_telegram_ids: Vec<i64>,
    pub staff_telegram_ids: Vec<i64>,
}

impl std::fmt::Debug for AppConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppConfig")
            .field("infisical_client_id", &"[REDACTED]")
            .field("infisical_client_secret", &"[REDACTED]")
            .field("infisical_project_id", &self.infisical_project_id)
            .field("infisical_environment", &self.infisical_environment)
            .field("database_url", &"[REDACTED]")
            .field("is_production", &self.is_production)
            .field("http_port", &self.http_port)
            .field("admin_telegram_ids", &"[REDACTED]")
            .field("staff_telegram_ids", &"[REDACTED]")
            .finish()
    }
}

impl AppConfig {
    pub fn from_env() -> Result<Self, crate::AppError> {
        Ok(Self {
            infisical_client_id: std::env::var("INFISICAL_CLIENT_ID")
                .map_err(|_| crate::AppError::Config("INFISICAL_CLIENT_ID not set".into()))?,
            infisical_client_secret: std::env::var("INFISICAL_CLIENT_SECRET")
                .map_err(|_| crate::AppError::Config("INFISICAL_CLIENT_SECRET not set".into()))?,
            infisical_project_id: std::env::var("INFISICAL_PROJECT_ID")
                .map_err(|_| crate::AppError::Config("INFISICAL_PROJECT_ID not set".into()))?,
            infisical_environment: std::env::var("INFISICAL_ENVIRONMENT")
                .unwrap_or_else(|_| "dev".into()),
            database_url: std::env::var("DATABASE_URL")
                .map_err(|_| crate::AppError::Config("DATABASE_URL not set".into()))?,
            is_production: std::env::var("NODE_ENV")
                .map(|v| v == "production")
                .unwrap_or(false),
            http_port: std::env::var("PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000),
            admin_telegram_ids: std::env::var("ADMIN_IDS")
                .ok()
                .map(|s| s.split(',').filter_map(|id| id.trim().parse().ok()).collect())
                .unwrap_or_default(),
            staff_telegram_ids: std::env::var("STAFF_IDS")
                .ok()
                .map(|s| s.split(',').filter_map(|id| id.trim().parse().ok()).collect())
                .unwrap_or_default(),
        })
    }
}
