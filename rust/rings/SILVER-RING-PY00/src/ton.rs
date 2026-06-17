use async_trait::async_trait;
use trios_mb_traits::{PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::*;
use trios_mb_types::AppError;

pub struct TonGateway {
    wallet_address: String,
    is_jetton: bool,
}

impl TonGateway {
    pub fn new_ton(wallet_address: &str) -> Self {
        Self {
            wallet_address: wallet_address.to_string(),
            is_jetton: false,
        }
    }

    pub fn new_usdt(wallet_address: &str) -> Self {
        Self {
            wallet_address: wallet_address.to_string(),
            is_jetton: true,
        }
    }

    pub fn is_jetton(&self) -> bool {
        self.is_jetton
    }

    pub fn payment_link(&self, amount_nano: u64, comment: &str) -> String {
        format!(
            "https://app.tonkeeper.com/transfer/{}?amount={}&text={}",
            self.wallet_address,
            amount_nano,
            urlencoding::encode(comment)
        )
    }
}

#[async_trait]
impl PaymentGateway for TonGateway {
    fn method(&self) -> PaymentMethod {
        if self.is_jetton {
            PaymentMethod::TonUsdt
        } else {
            PaymentMethod::TonNative
        }
    }

    async fn create_payment(
        &self,
        telegram_id: i64,
        amount: f64,
        _description: &str,
    ) -> Result<PaymentInit, AppError> {
        let id = uuid::Uuid::new_v4();
        let external_id = format!("ton_{}", id);

        let amount_nano = if self.is_jetton {
            (amount * 1_000_000.0) as u64
        } else {
            (amount * 1_000_000_000.0) as u64
        };

        let currency = if self.is_jetton { "USDT" } else { "TON" };
        let payment_url = self.payment_link(amount_nano, &external_id);

        Ok(PaymentInit {
            id,
            telegram_id,
            amount,
            currency: currency.to_string(),
            external_id: Some(external_id),
            payment_url: Some(payment_url),
        })
    }

    async fn verify_callback(
        &self,
        params: &serde_json::Value,
    ) -> Result<PaymentVerification, AppError> {
        let hash = params["hash"].as_str()
            .ok_or_else(|| AppError::Validation("Missing hash in TON callback".into()))?;
        let amount_nano = params["amount"]
            .as_str()
            .and_then(|v| v.parse::<u64>().ok())
            .ok_or_else(|| AppError::Validation("Invalid or missing amount in TON callback".into()))?;

        let amount = if self.is_jetton {
            amount_nano as f64 / 1_000_000.0
        } else {
            amount_nano as f64 / 1_000_000_000.0
        };

        let currency = if self.is_jetton { "USDT" } else { "TON" };

        Ok(PaymentVerification {
            transaction_id: hash.to_string(),
            amount,
            currency: currency.to_string(),
            status: PaymentStatus::Completed,
            telegram_id: None,
        })
    }

    async fn refund(&self, _transaction_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn get_payment_url(&self, payment: &PaymentInit) -> Result<String, AppError> {
        payment.payment_url.clone()
            .ok_or_else(|| AppError::Validation("Missing payment_url in TON payment".into()))
    }
}
