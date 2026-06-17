use async_trait::async_trait;
use trios_mb_traits::{PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::*;
use trios_mb_types::AppError;

pub struct RobokassaGateway {
    merchant_login: String,
    password1: String,
    password2: String,
}

impl RobokassaGateway {
    pub fn new(merchant_login: &str, password1: &str, password2: &str) -> Self {
        Self {
            merchant_login: merchant_login.to_string(),
            password1: password1.to_string(),
            password2: password2.to_string(),
        }
    }

    pub fn generate_signature(&self, amount: f64, inv_id: &str) -> Result<String, AppError> {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;
        let data = format!("{}:{}:{}:{}", self.merchant_login, amount, inv_id, self.password1);
        let mut mac = HmacSha256::new_from_slice(data.as_bytes())
            .map_err(|e| AppError::Internal(format!("HMAC key error: {}", e)))?;
        mac.update(data.as_bytes());
        Ok(hex::encode(mac.finalize().into_bytes()))
    }
}

#[async_trait]
impl PaymentGateway for RobokassaGateway {
    fn method(&self) -> PaymentMethod { PaymentMethod::Robokassa }

    async fn create_payment(&self, telegram_id: i64, amount: f64, _description: &str) -> Result<PaymentInit, AppError> {
        let id = uuid::Uuid::new_v4();
        let external_id = format!("{}", chrono::Utc::now().timestamp_millis());
        Ok(PaymentInit {
            id,
            telegram_id,
            amount,
            currency: "RUB".into(),
            external_id: Some(external_id.clone()),
            payment_url: None,
        })
    }

    async fn verify_callback(&self, params: &serde_json::Value) -> Result<PaymentVerification, AppError> {
        let transaction_id = params["InvId"].as_str()
            .ok_or_else(|| AppError::Validation("Missing InvId in Robokassa callback".into()))?;
        let amount = params["OutSum"].as_str()
            .and_then(|v| v.parse().ok())
            .ok_or_else(|| AppError::Validation("Invalid or missing OutSum in Robokassa callback".into()))?;
        Ok(PaymentVerification {
            transaction_id: transaction_id.to_string(),
            amount,
            currency: "RUB".into(),
            status: PaymentStatus::Completed,
            telegram_id: None,
        })
    }

    async fn refund(&self, _transaction_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn get_payment_url(&self, payment: &PaymentInit) -> Result<String, AppError> {
        let inv_id = payment.external_id.as_deref().unwrap_or("0");
        let sig = self.generate_signature(payment.amount, inv_id)?;
        Ok(format!(
            "https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin={}&OutSum={}&InvId={}&SignatureValue={}&Description=Top+up+balance",
            self.merchant_login, payment.amount, inv_id, sig
        ))
    }
}
