use async_trait::async_trait;
use trios_mb_traits::{PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::*;
use trios_mb_types::AppError;

pub struct TelegramStarsGateway;

impl Default for TelegramStarsGateway {
    fn default() -> Self {
        Self::new()
    }
}

impl TelegramStarsGateway {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl PaymentGateway for TelegramStarsGateway {
    fn method(&self) -> PaymentMethod { PaymentMethod::TelegramStars }

    async fn create_payment(&self, telegram_id: i64, amount: f64, _description: &str) -> Result<PaymentInit, AppError> {
        if !amount.is_finite() || amount <= 0.0 {
            return Err(AppError::Validation(format!(
                "Telegram Stars amount must be finite and > 0: {}",
                amount
            )));
        }
        Ok(PaymentInit {
            id: uuid::Uuid::new_v4(),
            telegram_id,
            amount,
            currency: "XTR".into(),
            external_id: None,
            payment_url: None,
        })
    }

    async fn verify_callback(&self, params: &serde_json::Value) -> Result<PaymentVerification, AppError> {
        let transaction_id = params["telegram_payment_charge_id"].as_str()
            .ok_or_else(|| AppError::Validation("Missing telegram_payment_charge_id in Stars callback".into()))?;
        let amount = params["total_amount"].as_f64()
            .ok_or_else(|| AppError::Validation("Missing total_amount in Stars callback".into()))?;
        if !amount.is_finite() || amount < 0.0 {
            return Err(AppError::Validation(format!(
                "Stars callback amount must be finite and >= 0: {}",
                amount
            )));
        }
        Ok(PaymentVerification {
            transaction_id: transaction_id.to_string(),
            amount,
            currency: "XTR".into(),
            status: PaymentStatus::Completed,
            telegram_id: params["user_id"].as_i64(),
        })
    }

    async fn refund(&self, _transaction_id: &str) -> Result<(), AppError> { Ok(()) }

    async fn get_payment_url(&self, _payment: &PaymentInit) -> Result<String, AppError> {
        Ok(String::new())
    }
}
