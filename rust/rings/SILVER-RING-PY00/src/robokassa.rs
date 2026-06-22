use async_trait::async_trait;
use trios_mb_traits::{PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::*;
use trios_mb_types::AppError;
use secrecy::{ExposeSecret, SecretString};
use subtle::ConstantTimeEq;

pub struct RobokassaGateway {
    merchant_login: String,
    password1: SecretString,
    password2: SecretString,
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
            password1: SecretString::new(password1.to_string().into_boxed_str()),
            password2: SecretString::new(password2.to_string().into_boxed_str()),
        }
    }

    pub fn generate_signature(&self, amount: f64, inv_id: &str) -> Result<String, AppError> {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;
        let amount_fmt = format!("{:.2}", amount);
        let data = format!(
            "{}:{}:{}:{}",
            self.merchant_login,
            amount_fmt,
            inv_id,
            self.password1.expose_secret()
        );
        let mut mac = HmacSha256::new_from_slice(data.as_bytes())
            .map_err(|e| AppError::Internal(format!("HMAC key error: {}", e)))?;
        mac.update(data.as_bytes());
        Ok(hex::encode(mac.finalize().into_bytes()))
    }

    fn verify_callback_signature(
        &self,
        amount: &str,
        inv_id: &str,
        signature_value: &str,
    ) -> Result<(), AppError> {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;
        let data = format!("{}:{}:{}", amount, inv_id, self.password2.expose_secret());
        let mut mac = HmacSha256::new_from_slice(data.as_bytes())
            .map_err(|e| AppError::Internal(format!("HMAC key error: {}", e)))?;
        mac.update(data.as_bytes());
        let expected = hex::encode(mac.finalize().into_bytes());
        // Constant-time comparison via subtle::ConstantTimeEq to resist timing attacks.
        // Do NOT add an explicit length check before ct_eq — that leaks the expected
        // signature length via timing (different code path for wrong-length inputs).
        // subtle::ct_eq already returns Choice(0) for different lengths.
        let eq = expected.as_bytes().ct_eq(signature_value.as_bytes());
        if eq.unwrap_u8() == 0 {
            return Err(AppError::Validation("Robokassa callback signature mismatch".into()));
        }
        Ok(())
    }
}

#[async_trait]
impl PaymentGateway for RobokassaGateway {
    fn method(&self) -> PaymentMethod { PaymentMethod::Robokassa }

    #[tracing::instrument(skip_all)]
    async fn create_payment(&self, telegram_id: i64, amount: f64, _description: &str) -> Result<PaymentInit, AppError> {
        if !amount.is_finite() || amount <= 0.0 {
            return Err(AppError::Validation(format!(
                "Robokassa amount must be finite and > 0: {}",
                amount
            )));
        }
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

    #[tracing::instrument(skip_all)]
    async fn verify_callback(&self, params: &serde_json::Value) -> Result<PaymentVerification, AppError> {
        let transaction_id = params["InvId"].as_str()
            .ok_or_else(|| AppError::Validation("Missing InvId in Robokassa callback".into()))?;
        let amount_str = params["OutSum"].as_str()
            .ok_or_else(|| AppError::Validation("Missing OutSum in Robokassa callback".into()))?;
        let amount = amount_str.parse::<f64>()
            .map_err(|_| AppError::Validation("Invalid OutSum format in Robokassa callback".into()))?;
        if !amount.is_finite() || amount < 0.0 {
            return Err(AppError::Validation(format!(
                "Robokassa callback amount must be finite and >= 0: {}",
                amount
            )));
        }
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

    #[tracing::instrument(skip_all)]
    async fn refund(&self, _transaction_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    #[tracing::instrument(skip_all)]
    async fn get_payment_url(&self, payment: &PaymentInit) -> Result<String, AppError> {
        let inv_id = payment.external_id.as_deref().unwrap_or("0");
        let sig = self.generate_signature(payment.amount, inv_id)?;
        let amount_fmt = format!("{:.2}", payment.amount);
        Ok(format!(
            "https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin={}&OutSum={}&InvId={}&SignatureValue={}&Description=Top+up+balance",
            self.merchant_login, amount_fmt, inv_id, sig
        ))
    }
}
