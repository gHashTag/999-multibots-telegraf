use async_trait::async_trait;
use std::time::Duration;
use trios_mb_traits::{PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::*;
use trios_mb_types::AppError;

const REQWEST_TIMEOUT: Duration = Duration::from_secs(30);
const REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_TRANSACTION_ID_LEN: usize = 256;

pub struct X402Gateway {
    wallet_address: String,
    facilitator_url: String,
    http: reqwest::Client,
}

impl X402Gateway {
    pub fn new(wallet_address: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(REQWEST_TIMEOUT)
            .connect_timeout(REQWEST_CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(REQWEST_POOL_IDLE_TIMEOUT)
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build x402 reqwest client: {}", e)))?;
        Ok(Self {
            wallet_address: wallet_address.to_string(),
            facilitator_url: "https://x402.org/facilitator".to_string(),
            http,
        })
    }

    pub fn with_facilitator(mut self, url: &str) -> Self {
        self.facilitator_url = url.to_string();
        self
    }
}

#[async_trait]
impl PaymentGateway for X402Gateway {
    fn method(&self) -> PaymentMethod {
        PaymentMethod::X402
    }

    #[tracing::instrument(skip_all)]
    async fn create_payment(
        &self,
        telegram_id: i64,
        amount: f64,
        _description: &str,
    ) -> Result<PaymentInit, AppError> {
        if !amount.is_finite() || amount <= 0.0 {
            return Err(AppError::Validation(format!("x402 amount must be finite and > 0: {}", amount)));
        }
        let id = uuid::Uuid::new_v4();
        let external_id = format!("x402_{}", id);

        const MAX_X402_AMOUNT: f64 = 1_000_000_000.0;
        if amount > MAX_X402_AMOUNT {
            return Err(AppError::Validation(format!(
                "x402 amount exceeds maximum of {}: {}",
                MAX_X402_AMOUNT, amount
            )));
        }
        let scaled = (amount * 1_000_000.0) as u64;
        let payment_url = format!(
            "https://app.tonkeeper.com/transfer/{}?amount={}&text={}",
            self.wallet_address,
            scaled,
            urlencoding::encode(&external_id)
        );

        Ok(PaymentInit {
            id,
            telegram_id,
            amount,
            currency: "USDC".into(),
            external_id: Some(external_id),
            payment_url: Some(payment_url),
        })
    }

    #[tracing::instrument(skip_all)]
    async fn verify_callback(
        &self,
        params: &serde_json::Value,
    ) -> Result<PaymentVerification, AppError> {
        let tx_hash = params["transaction_hash"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing transaction_hash in x402 callback".into()))?;
        if tx_hash.len() > MAX_TRANSACTION_ID_LEN {
            return Err(AppError::Validation(format!(
                "x402 transaction_hash exceeds maximum length of {}: got {}",
                MAX_TRANSACTION_ID_LEN, tx_hash.len()
            )));
        }

        let amount = params["amount"]
            .as_f64()
            .ok_or_else(|| AppError::Validation("Missing amount in x402 callback".into()))?
            / 1_000_000.0;
        if !amount.is_finite() || amount < 0.0 {
            return Err(AppError::Validation(format!("x402 callback amount must be finite and >= 0: {}", amount)));
        }

        Ok(PaymentVerification {
            transaction_id: tx_hash.to_string(),
            amount,
            currency: "USDC".into(),
            status: PaymentStatus::Completed,
            telegram_id: None,
        })
    }

    #[tracing::instrument(skip_all)]
    async fn refund(&self, _transaction_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn get_payment_url(&self, payment: &PaymentInit) -> Result<String, AppError> {
        payment.payment_url.clone()
            .ok_or_else(|| AppError::Validation("Missing payment_url in x402 payment".into()))
    }
}
