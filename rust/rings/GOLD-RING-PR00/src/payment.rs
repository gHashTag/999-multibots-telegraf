use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobokassaPaymentUrl {
    pub merchant_login: String,
    pub out_sum: f64,
    pub inv_id: i64,
    pub description: String,
    pub signature_value: String,
    pub result_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RobokassaCallback {
    pub out_sum: f64,
    pub inv_id: i64,
    pub signature_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramStarsPayment {
    pub telegram_id: i64,
    pub amount: i32,
    pub description: String,
    pub payload: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramPreCheckoutQuery {
    pub id: String,
    pub from: TelegramUserInfo,
    pub total_amount: i32,
    pub currency: String,
    pub invoice_payload: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramUserInfo {
    pub id: i64,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TelegramSuccessfulPayment {
    pub currency: String,
    pub total_amount: i32,
    pub invoice_payload: String,
    pub telegram_payment_charge_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X402PaymentRequest {
    pub inv_id: String,
    pub telegram_id: String,
    pub amount_usd: f64,
    pub stars: i32,
    pub description: String,
    pub bot_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct X402PaymentResponse {
    pub success: bool,
    pub transaction_hash: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TonTransaction {
    pub hash: String,
    pub lt: String,
    pub timestamp: i64,
    pub from: String,
    pub to: String,
    pub amount: String,
    pub comment: String,
    pub is_incoming: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TonPaymentLink {
    pub address: String,
    pub amount_nano: String,
    pub comment: String,
    pub jetton: Option<String>,
    pub jetton_amount: Option<String>,
}

impl TonPaymentLink {
    pub fn to_ton_uri(&self) -> String {
        let mut url = format!("ton://transfer/{}?amount={}", self.address, self.amount_nano);
        if !self.comment.is_empty() {
            url.push_str(&format!("&text={}", urlencoding::encode(&self.comment)));
        }
        url
    }

    pub fn to_tonkeeper_url(&self) -> String {
        let mut url = format!(
            "https://app.tonkeeper.com/transfer/{}?amount={}",
            self.address, self.amount_nano
        );
        if !self.comment.is_empty() {
            url.push_str(&format!("&text={}", urlencoding::encode(&self.comment)));
        }
        url
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectPaymentRequest {
    pub telegram_id: String,
    pub amount: f64,
    pub payment_type: String,
    pub description: String,
    pub bot_name: String,
    pub service_type: String,
    pub inv_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectPaymentResult {
    pub success: bool,
    pub payment_id: Option<i64>,
    pub operation_id: String,
    pub balance_change: Option<BalanceChange>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceChange {
    pub before: f64,
    pub after: f64,
    pub difference: f64,
}
