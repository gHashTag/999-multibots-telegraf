use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PaymentMethod {
    TelegramStars,
    Robokassa,
    X402,
    TonUsdt,
    TonNative,
    TelegramPayments,
}

impl PaymentMethod {
    pub fn currency(&self) -> &'static str {
        match self {
            Self::TelegramStars => "XTR",
            Self::Robokassa => "RUB",
            Self::X402 => "USDC",
            Self::TonUsdt => "USDT",
            Self::TonNative => "TON",
            Self::TelegramPayments => "XTR",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PaymentStatus {
    Pending,
    Completed,
    Failed,
    Cancelled,
    Refunded,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: uuid::Uuid,
    pub telegram_id: i64,
    pub method: PaymentMethod,
    pub status: PaymentStatus,
    pub amount: f64,
    pub currency: String,
    pub external_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}
