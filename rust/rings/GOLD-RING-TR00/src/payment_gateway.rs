use async_trait::async_trait;
use trios_mb_types::{payment::*, AppError};

#[async_trait]
pub trait PaymentGateway: Send + Sync {
    fn method(&self) -> PaymentMethod;

    async fn create_payment(&self, telegram_id: i64, amount: f64, description: &str) -> Result<PaymentInit, AppError>;

    async fn verify_callback(&self, params: &serde_json::Value) -> Result<PaymentVerification, AppError>;

    async fn refund(&self, transaction_id: &str) -> Result<(), AppError>;

    async fn get_payment_url(&self, payment: &PaymentInit) -> Result<String, AppError>;
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PaymentInit {
    pub id: uuid::Uuid,
    pub telegram_id: i64,
    pub amount: f64,
    pub currency: String,
    pub external_id: Option<String>,
    pub payment_url: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PaymentVerification {
    pub transaction_id: String,
    pub amount: f64,
    pub currency: String,
    pub status: PaymentStatus,
    pub telegram_id: Option<i64>,
}
