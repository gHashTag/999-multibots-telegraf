use async_trait::async_trait;
use trios_mb_types::{user::*, payment::*, generation::*, AppError};

#[async_trait]
pub trait Database: Send + Sync {
    async fn get_user_by_telegram_id(&self, telegram_id: i64) -> Result<Option<User>, AppError>;
    async fn create_user(&self, telegram_id: i64, username: Option<&str>, language: Language) -> Result<User, AppError>;
    async fn update_user_language(&self, telegram_id: i64, language: Language) -> Result<(), AppError>;
    async fn update_user_gender(&self, telegram_id: i64, gender: Gender) -> Result<(), AppError>;
    async fn update_user_level(&self, telegram_id: i64, level: i32) -> Result<(), AppError>;
    async fn update_user_voice(&self, telegram_id: i64, voice: &str) -> Result<(), AppError>;
    async fn update_user_model(&self, telegram_id: i64, model: &str) -> Result<(), AppError>;

    async fn get_balance(&self, telegram_id: i64) -> Result<f64, AppError>;
    async fn deduct_balance(&self, telegram_id: i64, amount: f64) -> Result<bool, AppError>;
    async fn add_balance(&self, telegram_id: i64, amount: f64) -> Result<(), AppError>;

    async fn create_transaction(&self, tx: &Transaction) -> Result<Transaction, AppError>;
    async fn get_transaction(&self, id: uuid::Uuid) -> Result<Option<Transaction>, AppError>;
    async fn get_transaction_by_external_id(&self, external_id: &str) -> Result<Option<Transaction>, AppError>;
    async fn update_transaction_status(&self, id: uuid::Uuid, status: PaymentStatus) -> Result<(), AppError>;
    async fn get_transactions_by_telegram_id(&self, telegram_id: i64, limit: i64) -> Result<Vec<Transaction>, AppError>;

    async fn check_subscription(&self, telegram_id: i64) -> Result<Option<SubscriptionType>, AppError>;
    async fn renew_subscription(&self, telegram_id: i64, sub_type: SubscriptionType) -> Result<(), AppError>;

    async fn save_prompt(&self, telegram_id: i64, prompt: &str, result_url: Option<&str>) -> Result<(), AppError>;
    async fn get_prompt(&self, telegram_id: i64) -> Result<Option<String>, AppError>;

    async fn increment_generated_images(&self, telegram_id: i64) -> Result<(), AppError>;
    async fn get_generated_images_count(&self, telegram_id: i64) -> Result<i64, AppError>;

    async fn create_generation(&self, req: &GenerationRequest) -> Result<GenerationResult, AppError>;
    async fn update_generation_status(&self, id: uuid::Uuid, status: GenerationStatus, result_url: Option<&str>, error: Option<&str>) -> Result<(), AppError>;
    async fn get_generation(&self, id: uuid::Uuid) -> Result<Option<GenerationResult>, AppError>;

    async fn get_referral_count(&self, telegram_id: i64) -> Result<i64, AppError>;
    async fn health_check(&self) -> Result<bool, AppError>;

    /// Atomically mark a transaction as completed and credit the user's balance.
    /// Returns `true` if the credit was applied, `false` if the transaction was already completed.
    async fn complete_robokassa_payment(&self, tx_id: uuid::Uuid, telegram_id: i64, amount: f64) -> Result<bool, AppError>;

    /// Fetch a generation only if it belongs to the given telegram_id.
    async fn get_generation_owned(&self, id: uuid::Uuid, telegram_id: i64) -> Result<Option<GenerationResult>, AppError>;

    /// Update a generation's status only if it belongs to the given telegram_id.
    async fn update_generation_status_owned(&self, id: uuid::Uuid, telegram_id: i64, status: GenerationStatus, result_url: Option<&str>, error: Option<&str>) -> Result<(), AppError>;
}
