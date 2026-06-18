use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use trios_mb_traits::Database;
use trios_mb_types::user::*;
use trios_mb_types::payment::*;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;

#[derive(Debug, Default)]
struct Inner {
    users: HashMap<i64, User>,
    transactions: HashMap<uuid::Uuid, Transaction>,
    prompts: HashMap<i64, String>,
    image_counts: HashMap<i64, i64>,
    generations: HashMap<uuid::Uuid, GenerationResult>,
    referral_counts: HashMap<i64, i64>,
    webhook_events: HashMap<(String, String), chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone)]
pub struct MockDatabase {
    inner: Arc<Mutex<Inner>>,
}

impl MockDatabase {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner::default())),
        }
    }
}

impl Default for MockDatabase {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Database for MockDatabase {
    async fn get_user_by_telegram_id(&self, telegram_id: i64) -> Result<Option<User>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.users.get(&telegram_id).cloned())
    }

    async fn create_user(&self, telegram_id: i64, username: Option<&str>, language: Language) -> Result<User, AppError> {
        let mut inner = self.inner.lock().await;
        let now = chrono::Utc::now();
        let user = User {
            id: uuid::Uuid::new_v4(),
            telegram_id,
            username: username.map(String::from),
            language,
            gender: None,
            level: 0,
            balance: 0.0,
            voice: None,
            model: None,
            subscription: None,
            created_at: now,
            updated_at: now,
        };
        inner.users.insert(telegram_id, user.clone());
        Ok(user)
    }

    async fn update_user_language(&self, telegram_id: i64, language: Language) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            user.language = language;
            user.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn update_user_gender(&self, telegram_id: i64, gender: Gender) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            user.gender = Some(gender);
            user.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn update_user_level(&self, telegram_id: i64, level: i32) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            user.level = level;
            user.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn update_user_voice(&self, telegram_id: i64, voice: &str) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            user.voice = Some(voice.to_string());
            user.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn update_user_model(&self, telegram_id: i64, model: &str) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            user.model = Some(model.to_string());
            user.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn get_balance(&self, telegram_id: i64) -> Result<f64, AppError> {
        let inner = self.inner.lock().await;
        inner
            .users
            .get(&telegram_id)
            .map(|u| u.balance)
            .ok_or_else(|| AppError::NotFound(format!("user {}", telegram_id)))
    }

    async fn deduct_balance(&self, telegram_id: i64, amount: f64) -> Result<bool, AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            if user.balance >= amount {
                user.balance -= amount;
                user.updated_at = chrono::Utc::now();
                Ok(true)
            } else {
                Ok(false)
            }
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn add_balance(&self, telegram_id: i64, amount: f64) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            user.balance += amount;
            user.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn create_transaction(&self, tx: &Transaction) -> Result<Transaction, AppError> {
        let mut inner = self.inner.lock().await;
        let stored = tx.clone();
        inner.transactions.insert(tx.id, stored.clone());
        Ok(stored)
    }

    async fn get_transaction(&self, id: uuid::Uuid) -> Result<Option<Transaction>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.transactions.get(&id).cloned())
    }

    async fn get_transaction_by_external_id(&self,
        external_id: &str,
    ) -> Result<Option<Transaction>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.transactions.values().find(|t| {
            t.external_id.as_deref() == Some(external_id)
        }).cloned())
    }

    async fn update_transaction_status(&self, id: uuid::Uuid, status: PaymentStatus) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(tx) = inner.transactions.get_mut(&id) {
            tx.status = status;
            tx.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("transaction {}", id)))
        }
    }

    async fn get_transactions_by_telegram_id(&self, telegram_id: i64, cursor: Option<uuid::Uuid>, limit: i64) -> Result<Vec<Transaction>, AppError> {
        let _ = cursor; // cursor pagination not implemented in mock
        let inner = self.inner.lock().await;
        let mut txs: Vec<_> = inner
            .transactions
            .values()
            .filter(|t| t.telegram_id == telegram_id)
            .cloned()
            .collect();
        txs.sort_by_key(|b| std::cmp::Reverse(b.created_at));
        txs.truncate(limit as usize);
        Ok(txs)
    }

    async fn check_subscription(&self, telegram_id: i64) -> Result<Option<SubscriptionType>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.users.get(&telegram_id).and_then(|u| u.subscription))
    }

    async fn renew_subscription(&self, telegram_id: i64, sub_type: SubscriptionType) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(user) = inner.users.get_mut(&telegram_id) {
            user.subscription = Some(sub_type);
            user.updated_at = chrono::Utc::now();
            Ok(())
        } else {
            Err(AppError::NotFound(format!("user {}", telegram_id)))
        }
    }

    async fn save_prompt(&self, telegram_id: i64, prompt: &str, _result_url: Option<&str>) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        inner.prompts.insert(telegram_id, prompt.to_string());
        Ok(())
    }

    async fn get_prompt(&self, telegram_id: i64) -> Result<Option<String>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.prompts.get(&telegram_id).cloned())
    }

    async fn increment_generated_images(&self, telegram_id: i64) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        let count = inner.image_counts.entry(telegram_id).or_insert(0);
        *count += 1;
        Ok(())
    }

    async fn get_generated_images_count(&self, telegram_id: i64) -> Result<i64, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.image_counts.get(&telegram_id).copied().unwrap_or(0))
    }

    async fn create_generation(&self, req: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let mut inner = self.inner.lock().await;
        let result = GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: req.telegram_id,
            media_type: req.media_type,
            status: GenerationStatus::Queued,
            result_url: None,
            provider: None,
            error: None,
            created_at: chrono::Utc::now(),
        };
        inner.generations.insert(result.id, result.clone());
        Ok(result)
    }

    async fn update_generation_status(
        &self,
        id: uuid::Uuid,
        status: GenerationStatus,
        result_url: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(gen) = inner.generations.get_mut(&id) {
            gen.status = status;
            if let Some(url) = result_url {
                gen.result_url = Some(url.to_string());
            }
            if let Some(e) = error {
                gen.error = Some(e.to_string());
            }
            Ok(())
        } else {
            Err(AppError::NotFound(format!("generation {}", id)))
        }
    }

    async fn get_generation(&self, id: uuid::Uuid) -> Result<Option<GenerationResult>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.generations.get(&id).cloned())
    }

    async fn get_referral_count(&self, telegram_id: i64) -> Result<i64, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.referral_counts.get(&telegram_id).copied().unwrap_or(0))
    }

    async fn health_check(&self) -> Result<bool, AppError> {
        Ok(true)
    }

    async fn complete_robokassa_payment(
        &self,
        tx_id: uuid::Uuid,
        telegram_id: i64,
        amount: f64,
    ) -> Result<bool, AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(tx) = inner.transactions.get_mut(&tx_id) {
            if tx.status == PaymentStatus::Completed {
                return Ok(false);
            }
            tx.status = PaymentStatus::Completed;
            tx.updated_at = chrono::Utc::now();
            if let Some(user) = inner.users.get_mut(&telegram_id) {
                user.balance += amount;
                user.updated_at = chrono::Utc::now();
            }
            Ok(true)
        } else {
            Err(AppError::NotFound(format!("transaction {}", tx_id)))
        }
    }

    async fn get_generation_owned(
        &self,
        id: uuid::Uuid,
        telegram_id: i64,
    ) -> Result<Option<GenerationResult>, AppError> {
        let inner = self.inner.lock().await;
        Ok(inner.generations.get(&id).filter(|g| g.telegram_id == telegram_id).cloned())
    }

    async fn update_generation_status_owned(
        &self,
        id: uuid::Uuid,
        telegram_id: i64,
        status: GenerationStatus,
        result_url: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), AppError> {
        let mut inner = self.inner.lock().await;
        if let Some(gen) = inner.generations.get_mut(&id) {
            if gen.telegram_id != telegram_id {
                return Err(AppError::NotFound(format!("generation {} owned by another user", id)));
            }
            gen.status = status;
            if let Some(url) = result_url {
                gen.result_url = Some(url.to_string());
            }
            if let Some(e) = error {
                gen.error = Some(e.to_string());
            }
            Ok(())
        } else {
            Err(AppError::NotFound(format!("generation {}", id)))
        }
    }

    async fn record_webhook_event(
        &self,
        provider: &str,
        event_id: &str,
    ) -> Result<bool, AppError> {
        let mut inner = self.inner.lock().await;
        let key = (provider.to_string(), event_id.to_string());
        if inner.webhook_events.contains_key(&key) {
            Ok(false)
        } else {
            inner.webhook_events.insert(key, chrono::Utc::now());
            Ok(true)
        }
    }

    async fn has_webhook_event(
        &self,
        provider: &str,
        event_id: &str,
    ) -> Result<bool, AppError> {
        let inner = self.inner.lock().await;
        let key = (provider.to_string(), event_id.to_string());
        Ok(inner.webhook_events.contains_key(&key))
    }
}
