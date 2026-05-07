use async_trait::async_trait;
use trios_mb_traits::payment_gateway::{PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::*;
use trios_mb_types::AppError;

#[derive(Debug, Clone)]
pub struct MockPaymentGateway {
    pub method: PaymentMethod,
}

impl MockPaymentGateway {
    pub fn new(method: PaymentMethod) -> Self {
        Self { method }
    }

    pub fn robokassa() -> Self {
        Self::new(PaymentMethod::Robokassa)
    }

    pub fn stars() -> Self {
        Self::new(PaymentMethod::TelegramStars)
    }
}

#[async_trait]
impl PaymentGateway for MockPaymentGateway {
    fn method(&self) -> PaymentMethod {
        self.method
    }

    async fn create_payment(
        &self,
        telegram_id: i64,
        amount: f64,
        _description: &str,
    ) -> Result<PaymentInit, AppError> {
        Ok(PaymentInit {
            id: uuid::Uuid::new_v4(),
            telegram_id,
            amount,
            currency: self.method.currency().to_string(),
            external_id: Some(format!("ext_{}", uuid::Uuid::new_v4())),
            payment_url: Some(format!("https://pay.mock/{}", uuid::Uuid::new_v4())),
        })
    }

    async fn verify_callback(&self, _params: &serde_json::Value) -> Result<PaymentVerification, AppError> {
        Ok(PaymentVerification {
            transaction_id: uuid::Uuid::new_v4().to_string(),
            amount: 100.0,
            currency: "RUB".to_string(),
            status: PaymentStatus::Completed,
            telegram_id: Some(12345),
        })
    }

    async fn refund(&self, _transaction_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn get_payment_url(&self, payment: &PaymentInit) -> Result<String, AppError> {
        payment
            .payment_url
            .clone()
            .ok_or_else(|| AppError::Payment(trios_mb_types::errors::PaymentError::NotFound {
                id: payment.id.to_string(),
            }))
    }
}
