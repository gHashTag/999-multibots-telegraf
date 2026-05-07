use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Db(#[from] DbError),

    #[error("AI provider error: {0}")]
    Ai(#[from] AiError),

    #[error("Payment error: {0}")]
    Payment(#[from] PaymentError),

    #[error("Secrets error: {0}")]
    Secrets(#[from] SecretsError),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Connection failed: {0}")]
    Connection(String),

    #[error("Query failed: {0}")]
    Query(String),

    #[error("Migration failed: {0}")]
    Migration(String),

    #[error("Entity not found: {entity}")]
    NotFound { entity: String },

    #[error("Constraint violation: {0}")]
    Constraint(String),

    #[error("Pool error: {0}")]
    Pool(String),
}

#[derive(Debug, Error)]
pub enum AiError {
    #[error("Provider {provider} returned error: {message}")]
    Provider { provider: String, message: String },

    #[error("All providers failed for {media_type:?}")]
    AllProvidersFailed { media_type: String },

    #[error("Timeout after {secs}s for {provider}")]
    Timeout { provider: String, secs: u64 },

    #[error("Rate limited by {provider}")]
    RateLimited { provider: String },

    #[error("Invalid response from {provider}: {message}")]
    InvalidResponse { provider: String, message: String },

    #[error("Generation not found: {id}")]
    NotFound { id: String },
}

#[derive(Debug, Error)]
pub enum PaymentError {
    #[error("Payment {id} not found")]
    NotFound { id: String },

    #[error("Insufficient balance: need {required}, have {current}")]
    InsufficientBalance { required: f64, current: f64 },

    #[error("Payment already processed: {id}")]
    AlreadyProcessed { id: String },

    #[error("Provider error: {provider}: {message}")]
    Provider { provider: String, message: String },

    #[error("Signature verification failed")]
    InvalidSignature,

    #[error("Payment expired: {id}")]
    Expired { id: String },

    #[error("Refund failed: {id}: {reason}")]
    RefundFailed { id: String, reason: String },
}

#[derive(Debug, Error)]
pub enum SecretsError {
    #[error("Infisical auth failed: {0}")]
    Auth(String),

    #[error("Secret {key} not found")]
    NotFound { key: String },

    #[error("Infisical API error: {status}: {message}")]
    Api { status: u16, message: String },

    #[error("Cache expired for {key}")]
    CacheExpired { key: String },
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::Internal(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_display() {
        let err = AppError::Config("test config".to_string());
        assert_eq!(format!("{}", err), "Config error: test config");

        let err = AppError::NotFound("user 123".to_string());
        assert_eq!(format!("{}", err), "Not found: user 123");

        let err = AppError::Unauthorized("bad token".to_string());
        assert_eq!(format!("{}", err), "Unauthorized: bad token");

        let err = AppError::Validation("invalid input".to_string());
        assert_eq!(format!("{}", err), "Validation error: invalid input");

        let err = AppError::Internal("something broke".to_string());
        assert_eq!(format!("{}", err), "Internal error: something broke");
    }

    #[test]
    fn db_error_display() {
        let err = DbError::Connection("timeout".to_string());
        assert_eq!(format!("{}", err), "Connection failed: timeout");

        let err = DbError::Query("syntax error".to_string());
        assert_eq!(format!("{}", err), "Query failed: syntax error");

        let err = DbError::NotFound { entity: "User".to_string() };
        assert_eq!(format!("{}", err), "Entity not found: User");

        let err = DbError::Constraint("unique violation".to_string());
        assert_eq!(format!("{}", err), "Constraint violation: unique violation");
    }

    #[test]
    fn ai_error_display() {
        let err = AiError::Provider {
            provider: "replicate".to_string(),
            message: "timeout".to_string(),
        };
        assert!(format!("{}", err).contains("replicate"));

        let err = AiError::AllProvidersFailed {
            media_type: "image".to_string(),
        };
        assert!(format!("{}", err).contains("image"));

        let err = AiError::Timeout {
            provider: "fal".to_string(),
            secs: 300,
        };
        assert!(format!("{}", err).contains("300"));

        let err = AiError::NotFound { id: "gen-123".to_string() };
        assert!(format!("{}", err).contains("gen-123"));
    }

    #[test]
    fn payment_error_display() {
        let err = PaymentError::NotFound { id: "tx-1".to_string() };
        assert!(format!("{}", err).contains("tx-1"));

        let err = PaymentError::InsufficientBalance {
            required: 100.0,
            current: 50.0,
        };
        assert!(format!("{}", err).contains("100"));
        assert!(format!("{}", err).contains("50"));

        let err = PaymentError::InvalidSignature;
        assert!(format!("{}", err).contains("Signature"));
    }

    #[test]
    fn secrets_error_display() {
        let err = SecretsError::NotFound {
            key: "API_KEY".to_string(),
        };
        assert!(format!("{}", err).contains("API_KEY"));

        let err = SecretsError::Api {
            status: 403,
            message: "forbidden".to_string(),
        };
        assert!(format!("{}", err).contains("403"));
    }

    #[test]
    fn app_error_from_db_error() {
        let db_err = DbError::Connection("fail".to_string());
        let app_err: AppError = db_err.into();
        assert!(matches!(app_err, AppError::Db(_)));
    }

    #[test]
    fn app_error_from_serde_json_error() {
        let json_err: serde_json::Error = serde_json::from_str::<i32>("not a number").unwrap_err();
        let app_err: AppError = json_err.into();
        assert!(matches!(app_err, AppError::Internal(_)));
    }
}
