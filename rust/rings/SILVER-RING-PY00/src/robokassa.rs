use async_trait::async_trait;
use trios_mb_traits::{PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::*;
use trios_mb_types::AppError;

pub struct RobokassaGateway {
    merchant_login: String,
    password1: String,
    password2: String,
}

impl std::fmt::Debug for RobokassaGateway {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RobokassaGateway")
            .field("merchant_login", &self.merchant_login)
            .field("password1", &"<redacted>")
            .field("password2", &"<redacted>")
            .finish()
    }
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

    fn verify_callback_signature(&self, amount: &str, inv_id: &str, signature_value: &str) -> Result<(), AppError> {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;
        let data = format!("{}:{}:{}", amount, inv_id, self.password2);
        let mut mac = HmacSha256::new_from_slice(data.as_bytes())
            .map_err(|e| AppError::Internal(format!("HMAC key error: {}", e)))?;
        mac.update(data.as_bytes());
        let expected = hex::encode(mac.finalize().into_bytes());
        // Constant-time comparison of hex strings (length then byte-wise)
        if expected.len() != signature_value.len() {
            return Err(AppError::Validation("Robokassa callback signature mismatch".into()));
        }
        let mut diff = 0u8;
        for (a, b) in expected.bytes().zip(signature_value.bytes()) {
            diff |= a ^ b;
        }
        if diff != 0 {
            return Err(AppError::Validation("Robokassa callback signature mismatch".into()));
        }
        Ok(())
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
        let amount_str = params["OutSum"].as_str()
            .ok_or_else(|| AppError::Validation("Missing OutSum in Robokassa callback".into()))?;
        let amount = amount_str.parse::<f64>()
            .map_err(|_| AppError::Validation("Invalid OutSum format in Robokassa callback".into()))?;
        let signature_value = params["SignatureValue"].as_str()
            .ok_or_else(|| AppError::Validation("Missing SignatureValue in Robokassa callback".into()))?;

        self.verify_callback_signature(amount_str, transaction_id, signature_value)?;

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
