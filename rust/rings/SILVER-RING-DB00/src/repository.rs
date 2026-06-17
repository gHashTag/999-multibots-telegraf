use async_trait::async_trait;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, PaginatorTrait, QuerySelect, Statement, Value};
use std::sync::Arc;
use trios_mb_traits::Database as DbTrait;
use trios_mb_types::user::*;
use trios_mb_types::payment::Transaction;
use trios_mb_types::payment::*;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;

pub struct PostgresDatabase {
    pool: Arc<DatabaseConnection>,
}

fn media_type_to_str(mt: &MediaType) -> &'static str {
    match mt {
        MediaType::Image => "image",
        MediaType::Video => "video",
        MediaType::Audio => "audio",
        MediaType::ImageToVideo => "image_to_video",
        MediaType::TextToSpeech => "text_to_speech",
        MediaType::LipSync => "lipsync",
        MediaType::FaceSwap => "faceswap",
        MediaType::Morphing => "morphing",
        MediaType::Upscale => "upscale",
    }
}

fn str_to_media_type(s: &str) -> Result<MediaType, AppError> {
    match s {
        "image" => Ok(MediaType::Image),
        "video" => Ok(MediaType::Video),
        "audio" => Ok(MediaType::Audio),
        "image_to_video" => Ok(MediaType::ImageToVideo),
        "text_to_speech" => Ok(MediaType::TextToSpeech),
        "lipsync" => Ok(MediaType::LipSync),
        "faceswap" => Ok(MediaType::FaceSwap),
        "morphing" => Ok(MediaType::Morphing),
        "upscale" => Ok(MediaType::Upscale),
        _ => Err(AppError::Db(trios_mb_types::errors::DbError::Query(format!("Unknown media_type: {}", s)))),
    }
}

fn generation_status_to_str(s: &GenerationStatus) -> &'static str {
    match s {
        GenerationStatus::Queued => "queued",
        GenerationStatus::Processing => "processing",
        GenerationStatus::Completed => "completed",
        GenerationStatus::Failed => "failed",
        GenerationStatus::Cancelled => "cancelled",
    }
}

fn str_to_generation_status(s: &str) -> Result<GenerationStatus, AppError> {
    match s {
        "queued" => Ok(GenerationStatus::Queued),
        "processing" => Ok(GenerationStatus::Processing),
        "completed" => Ok(GenerationStatus::Completed),
        "failed" => Ok(GenerationStatus::Failed),
        "cancelled" => Ok(GenerationStatus::Cancelled),
        _ => Err(AppError::Db(trios_mb_types::errors::DbError::Query(format!("Unknown generation_status: {}", s)))),
    }
}

fn subscription_to_str(s: &SubscriptionType) -> &'static str {
    match s {
        SubscriptionType::NeuroPhoto => "neurophoto",
        SubscriptionType::NeuroVideo => "neurovideo",
        SubscriptionType::Stars => "stars",
        SubscriptionType::NeuroTester => "neurotester",
    }
}

fn str_to_subscription(s: &str) -> Option<SubscriptionType> {
    match s {
        "neurophoto" => Some(SubscriptionType::NeuroPhoto),
        "neurovideo" => Some(SubscriptionType::NeuroVideo),
        "stars" => Some(SubscriptionType::Stars),
        "neurotester" => Some(SubscriptionType::NeuroTester),
        _ => None,
    }
}

impl PostgresDatabase {
    pub async fn connect(url: &str) -> Result<Self, AppError> {
        let conn = sea_orm::Database::connect(url)
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Connection(e.to_string())))?;
        Ok(Self {
            pool: Arc::new(conn),
        })
    }

    pub fn from_connection(conn: DatabaseConnection) -> Self {
        Self {
            pool: Arc::new(conn),
        }
    }

    pub fn connection(&self) -> &DatabaseConnection {
        &self.pool
    }

    pub fn connection_arc(&self) -> Arc<DatabaseConnection> {
        self.pool.clone()
    }

    pub async fn run_migrations(&self) -> Result<(), AppError> {
        use sea_orm_migration::MigratorTrait;
        crate::migration::Migrator::up(self.pool.as_ref(), None)
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Migration(e.to_string())))?;
        Ok(())
    }
}

#[async_trait]
impl DbTrait for PostgresDatabase {
    async fn get_user_by_telegram_id(&self, telegram_id: i64) -> Result<Option<User>, AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        match user {
            Some(m) => {
                let language = Language::from_code(&m.language).ok_or_else(|| {
                    AppError::Db(trios_mb_types::errors::DbError::Query(format!(
                        "Unknown language code '{}' for user {}",
                        m.language, m.telegram_id
                    )))
                })?;
                Ok(Some(User {
                    id: m.id,
                    telegram_id: m.telegram_id,
                    username: m.username.clone(),
                    language,
                    gender: m.gender.as_deref().map(|g| match g {
                        "male" => Gender::Male,
                        "female" => Gender::Female,
                        _ => Gender::Other,
                    }),
                    level: m.level,
                    balance: m.balance,
                    voice: m.voice.clone(),
                    model: m.model.clone(),
                    subscription: m.subscription.as_deref().and_then(str_to_subscription),
                    created_at: m.created_at,
                    updated_at: m.updated_at,
                }))
            }
            None => Ok(None),
        }
    }

    async fn create_user(&self, telegram_id: i64, username: Option<&str>, language: Language) -> Result<User, AppError> {
        if telegram_id <= 0 {
            return Err(AppError::Validation("telegram_id must be > 0".into()));
        }
        use crate::entities::users as u;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let model = u::ActiveModel {
            id: Set(id),
            telegram_id: Set(telegram_id),
            username: Set(username.map(String::from)),
            language: Set(language.code().to_string()),
            gender: Set(None),
            level: Set(1),
            balance: Set(0.0),
            voice: Set(None),
            model: Set(None),
            subscription: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };
        let result = model.insert(self.pool.as_ref()).await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        Ok(User {
            id: result.id,
            telegram_id: result.telegram_id,
            username: result.username.clone(),
            language,
            gender: None,
            level: 1,
            balance: 0.0,
            voice: None,
            model: None,
            subscription: None,
            created_at: result.created_at,
            updated_at: result.updated_at,
        })
    }

    async fn update_user_language(&self, telegram_id: i64, language: Language) -> Result<(), AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(user) = user {
            let mut active: u::ActiveModel = user.into();
            active.language = Set(language.code().to_string());
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn update_user_gender(&self, telegram_id: i64, gender: Gender) -> Result<(), AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(user) = user {
            let mut active: u::ActiveModel = user.into();
            active.gender = Set(Some(match gender {
                Gender::Male => "male".into(),
                Gender::Female => "female".into(),
                Gender::Other => "other".into(),
            }));
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn update_user_level(&self, telegram_id: i64, level: i32) -> Result<(), AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(user) = user {
            let mut active: u::ActiveModel = user.into();
            active.level = Set(level);
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn update_user_voice(&self, telegram_id: i64, voice: &str) -> Result<(), AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(user) = user {
            let mut active: u::ActiveModel = user.into();
            active.voice = Set(Some(voice.to_string()));
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn update_user_model(&self, telegram_id: i64, model: &str) -> Result<(), AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(user) = user {
            let mut active: u::ActiveModel = user.into();
            active.model = Set(Some(model.to_string()));
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn get_balance(&self, telegram_id: i64) -> Result<f64, AppError> {
        let user = self.get_user_by_telegram_id(telegram_id).await?;
        Ok(user.map(|u| u.balance).unwrap_or(0.0))
    }

    async fn deduct_balance(&self, telegram_id: i64, amount: f64) -> Result<bool, AppError> {
        if amount <= 0.0 {
            return Err(AppError::Validation("deduct_balance amount must be > 0".into()));
        }
        let sql = r#"
            UPDATE users
            SET balance = balance - $1,
                updated_at = NOW()
            WHERE telegram_id = $2
              AND balance >= $1
        "#;
        let result = self.pool
            .execute(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                sql,
                vec![
                    Value::Double(Some(amount)),
                    Value::BigInt(Some(telegram_id)),
                ],
            ))
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        Ok(result.rows_affected() > 0)
    }

    async fn add_balance(&self, telegram_id: i64, amount: f64) -> Result<(), AppError> {
        if amount < 0.0 {
            return Err(AppError::Validation("add_balance amount must be >= 0".into()));
        }
        let sql = r#"
            UPDATE users
            SET balance = balance + $1,
                updated_at = NOW()
            WHERE telegram_id = $2
        "#;
        self.pool
            .execute(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                sql,
                vec![
                    Value::Double(Some(amount)),
                    Value::BigInt(Some(telegram_id)),
                ],
            ))
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        Ok(())
    }

    async fn create_transaction(&self, tx: &Transaction) -> Result<Transaction, AppError> {
        use crate::entities::payments as p;
        let now = chrono::Utc::now();
        let model = p::ActiveModel {
            id: Set(tx.id),
            telegram_id: Set(tx.telegram_id),
            method: Set(serde_json::to_string(&tx.method).map_err(|e| AppError::Internal(format!("serialize payment method: {}", e)))?),
            status: Set(serde_json::to_string(&tx.status).map_err(|e| AppError::Internal(format!("serialize payment status: {}", e)))?),
            amount: Set(tx.amount),
            currency: Set(tx.currency.clone()),
            external_id: Set(tx.external_id.clone()),
            created_at: Set(now),
            updated_at: Set(now),
        };
        model.insert(self.pool.as_ref()).await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        Ok(tx.clone())
    }

    async fn get_transaction(&self, id: uuid::Uuid) -> Result<Option<Transaction>, AppError> {
        use crate::entities::payments as p;
        let row = p::Entity::find_by_id(id)
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        match row {
            Some(r) => Ok(Some(Transaction {
                id: r.id,
                telegram_id: r.telegram_id,
                method: serde_json::from_str(&r.method).map_err(|e| {
                    AppError::Internal(format!("Corrupt payment method JSON: {}", e))
                })?,
                status: serde_json::from_str(&r.status).map_err(|e| {
                    AppError::Internal(format!("Corrupt payment status JSON: {}", e))
                })?,
                amount: r.amount,
                currency: r.currency,
                external_id: r.external_id,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })),
            None => Ok(None),
        }
    }

    async fn get_transaction_by_external_id(&self,
        external_id: &str,
    ) -> Result<Option<Transaction>, AppError> {
        use crate::entities::payments as p;
        let row = p::Entity::find()
            .filter(p::Column::ExternalId.eq(external_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        match row {
            Some(r) => Ok(Some(Transaction {
                id: r.id,
                telegram_id: r.telegram_id,
                method: serde_json::from_str(&r.method).map_err(|e| {
                    AppError::Internal(format!("Corrupt payment method JSON: {}", e))
                })?,
                status: serde_json::from_str(&r.status).map_err(|e| {
                    AppError::Internal(format!("Corrupt payment status JSON: {}", e))
                })?,
                amount: r.amount,
                currency: r.currency,
                external_id: r.external_id,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })),
            None => Ok(None),
        }
    }

    async fn update_transaction_status(&self, id: uuid::Uuid, status: PaymentStatus) -> Result<(), AppError> {
        use crate::entities::payments as p;
        let row = p::Entity::find_by_id(id)
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(row) = row {
            let mut active: p::ActiveModel = row.into();
            active.status = Set(serde_json::to_string(&status).map_err(|e| {
                AppError::Internal(format!("Failed to serialize payment status: {}", e))
            })?);
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn get_transactions_by_telegram_id(&self, telegram_id: i64, limit: i64) -> Result<Vec<Transaction>, AppError> {
        use crate::entities::payments as p;
        let safe_limit = if limit <= 0 { 1 } else if limit > 10_000 { 10_000 } else { limit };
        let rows = p::Entity::find()
            .filter(p::Column::TelegramId.eq(telegram_id))
            .order_by_desc(p::Column::CreatedAt)
            .limit(Some(safe_limit as u64))
            .all(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        rows.into_iter()
            .map(|r| -> Result<Transaction, AppError> {
                Ok(Transaction {
                    id: r.id,
                    telegram_id: r.telegram_id,
                    method: serde_json::from_str(&r.method).map_err(|e| {
                        AppError::Internal(format!("Corrupt payment method JSON: {}", e))
                    })?,
                    status: serde_json::from_str(&r.status).map_err(|e| {
                        AppError::Internal(format!("Corrupt payment status JSON: {}", e))
                    })?,
                    amount: r.amount,
                    currency: r.currency,
                    external_id: r.external_id,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                })
            })
            .collect()
    }

    async fn check_subscription(&self, telegram_id: i64) -> Result<Option<SubscriptionType>, AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        Ok(user.and_then(|m| m.subscription.as_deref().and_then(str_to_subscription)))
    }

    async fn renew_subscription(&self, telegram_id: i64, sub_type: SubscriptionType) -> Result<(), AppError> {
        use crate::entities::users as u;
        let user = u::Entity::find()
            .filter(u::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(user) = user {
            let mut active: u::ActiveModel = user.into();
            active.subscription = Set(Some(subscription_to_str(&sub_type).to_string()));
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn save_prompt(&self, telegram_id: i64, prompt: &str, result_url: Option<&str>) -> Result<(), AppError> {
        const MAX_PROMPT_LEN: usize = 2000;
        if prompt.len() > MAX_PROMPT_LEN {
            return Err(AppError::Validation(format!(
                "Prompt exceeds maximum length of {} characters",
                MAX_PROMPT_LEN
            )));
        }
        use crate::entities::prompts as p;
        let model = p::ActiveModel {
            id: Set(uuid::Uuid::new_v4()),
            telegram_id: Set(telegram_id),
            prompt: Set(Some(prompt.to_string())),
            result_url: Set(result_url.map(String::from)),
            created_at: Set(chrono::Utc::now()),
        };
        model.insert(self.pool.as_ref()).await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        Ok(())
    }

    async fn get_prompt(&self, telegram_id: i64) -> Result<Option<String>, AppError> {
        use crate::entities::prompts as p;
        let row = p::Entity::find()
            .filter(p::Column::TelegramId.eq(telegram_id))
            .order_by_desc(p::Column::CreatedAt)
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        Ok(row.and_then(|r| r.prompt))
    }

    async fn increment_generated_images(&self, _telegram_id: i64) -> Result<(), AppError> {
        Ok(())
    }

    async fn get_generated_images_count(&self, telegram_id: i64) -> Result<i64, AppError> {
        use crate::entities::generations as g;
        let count = g::Entity::find()
            .filter(g::Column::TelegramId.eq(telegram_id))
            .count(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        Ok(count as i64)
    }

    async fn create_generation(&self, req: &GenerationRequest) -> Result<GenerationResult, AppError> {
        use crate::entities::generations as g;
        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let model = g::ActiveModel {
            id: Set(id),
            telegram_id: Set(req.telegram_id),
            media_type: Set(media_type_to_str(&req.media_type).to_string()),
            status: Set(generation_status_to_str(&GenerationStatus::Queued).to_string()),
            prompt: Set(req.prompt.clone()),
            result_url: Set(None),
            provider: Set(None),
            params: Set(Some(req.params.clone())),
            error: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };
        model.insert(self.pool.as_ref()).await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        Ok(GenerationResult {
            id,
            telegram_id: req.telegram_id,
            media_type: req.media_type,
            status: GenerationStatus::Queued,
            result_url: None,
            provider: None,
            error: None,
            created_at: now,
        })
    }

    async fn update_generation_status(&self, id: uuid::Uuid, status: GenerationStatus, result_url: Option<&str>, error: Option<&str>) -> Result<(), AppError> {
        use crate::entities::generations as g;
        let row = g::Entity::find_by_id(id)
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(row) = row {
            let mut active: g::ActiveModel = row.into();
            active.status = Set(generation_status_to_str(&status).to_string());
            if result_url.is_some() {
                active.result_url = Set(result_url.map(String::from));
            }
            if error.is_some() {
                active.error = Set(error.map(String::from));
            }
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }

    async fn get_generation(&self, id: uuid::Uuid) -> Result<Option<GenerationResult>, AppError> {
        use crate::entities::generations as g;
        let row = g::Entity::find_by_id(id)
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        match row {
            Some(r) => Ok(Some(GenerationResult {
                id: r.id,
                telegram_id: r.telegram_id,
                media_type: str_to_media_type(&r.media_type)?,
                status: str_to_generation_status(&r.status)?,
                result_url: r.result_url,
                provider: r.provider,
                error: r.error,
                created_at: r.created_at,
            })),
            None => Ok(None),
        }
    }

    async fn get_referral_count(&self, telegram_id: i64) -> Result<i64, AppError> {
        use crate::entities::referrals as r;
        let count = r::Entity::find()
            .filter(r::Column::ReferrerId.eq(telegram_id))
            .count(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        Ok(count as i64)
    }

    async fn health_check(&self) -> Result<bool, AppError> {
        match self.pool.ping().await {
            Ok(()) => Ok(true),
            Err(e) => Err(AppError::Db(trios_mb_types::errors::DbError::Connection(e.to_string()))),
        }
    }

    async fn complete_robokassa_payment(
        &self,
        tx_id: uuid::Uuid,
        telegram_id: i64,
        amount: f64,
    ) -> Result<bool, AppError> {
        let completed_status = serde_json::to_string(&PaymentStatus::Completed).map_err(|e| {
            AppError::Internal(format!("Failed to serialize PaymentStatus::Completed: {}", e))
        })?;

        let sql = r#"
            WITH updated_tx AS (
                UPDATE payments_v2
                SET status = $4,
                    updated_at = NOW()
                WHERE id = $1 AND status <> $4
                RETURNING id
            )
            UPDATE users
            SET balance = balance + $2,
                updated_at = NOW()
            WHERE telegram_id = $3
              AND EXISTS (SELECT 1 FROM updated_tx)
        "#;

        let result = self.pool
            .execute(Statement::from_sql_and_values(
                sea_orm::DatabaseBackend::Postgres,
                sql,
                vec![
                    Value::Uuid(Some(Box::new(tx_id))),
                    Value::Double(Some(amount)),
                    Value::BigInt(Some(telegram_id)),
                    Value::String(Some(Box::new(completed_status))),
                ],
            ))
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        Ok(result.rows_affected() > 0)
    }

    async fn get_generation_owned(
        &self,
        id: uuid::Uuid,
        telegram_id: i64,
    ) -> Result<Option<GenerationResult>, AppError> {
        use crate::entities::generations as g;
        let row = g::Entity::find()
            .filter(g::Column::Id.eq(id))
            .filter(g::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        match row {
            Some(r) => Ok(Some(GenerationResult {
                id: r.id,
                telegram_id: r.telegram_id,
                media_type: str_to_media_type(&r.media_type)?,
                status: str_to_generation_status(&r.status)?,
                result_url: r.result_url,
                provider: r.provider,
                error: r.error,
                created_at: r.created_at,
            })),
            None => Ok(None),
        }
    }

    async fn update_generation_status_owned(
        &self,
        id: uuid::Uuid,
        telegram_id: i64,
        status: GenerationStatus,
        result_url: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), AppError> {
        use crate::entities::generations as g;
        let row = g::Entity::find()
            .filter(g::Column::Id.eq(id))
            .filter(g::Column::TelegramId.eq(telegram_id))
            .one(self.pool.as_ref())
            .await
            .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;

        if let Some(row) = row {
            let mut active: g::ActiveModel = row.into();
            active.status = Set(generation_status_to_str(&status).to_string());
            if result_url.is_some() {
                active.result_url = Set(result_url.map(String::from));
            }
            if error.is_some() {
                active.error = Set(error.map(String::from));
            }
            active.updated_at = Set(chrono::Utc::now());
            active.update(self.pool.as_ref()).await
                .map_err(|e| AppError::Db(trios_mb_types::errors::DbError::Query(e.to_string())))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entities::{users, prompts, generations};
    use sea_orm::{DatabaseBackend, MockDatabase, MockExecResult};

    fn test_user_model() -> users::Model {
        users::Model {
            id: uuid::Uuid::new_v4(),
            telegram_id: 123456,
            username: Some("testuser".to_string()),
            language: "ru".to_string(),
            gender: Some("male".to_string()),
            level: 2,
            balance: 100.0,
            voice: None,
            model: None,
            subscription: None,
            created_at: chrono::DateTime::from(std::time::SystemTime::UNIX_EPOCH),
            updated_at: chrono::DateTime::from(std::time::SystemTime::UNIX_EPOCH),
        }
    }

    fn test_user_with_sub(sub: &str) -> users::Model {
        users::Model {
            subscription: Some(sub.to_string()),
            ..test_user_model()
        }
    }

    fn test_prompt_model() -> prompts::Model {
        prompts::Model {
            id: uuid::Uuid::new_v4(),
            telegram_id: 123456,
            prompt: Some("a beautiful sunset".to_string()),
            result_url: Some("https://example.com/img.png".to_string()),
            created_at: chrono::DateTime::from(std::time::SystemTime::UNIX_EPOCH),
        }
    }

    fn test_generation_model() -> generations::Model {
        generations::Model {
            id: uuid::Uuid::new_v4(),
            telegram_id: 123456,
            media_type: "image".to_string(),
            status: "completed".to_string(),
            prompt: Some("test prompt".to_string()),
            result_url: Some("https://example.com/result.png".to_string()),
            provider: Some("replicate".to_string()),
            params: None,
            error: None,
            created_at: chrono::DateTime::from(std::time::SystemTime::UNIX_EPOCH),
            updated_at: chrono::DateTime::from(std::time::SystemTime::UNIX_EPOCH),
        }
    }

    fn make_db(backend: DatabaseBackend) -> PostgresDatabase {
        PostgresDatabase::from_connection(
            MockDatabase::new(backend).into_connection(),
        )
    }

    #[tokio::test]
    async fn test_get_user_found() {
        let model = test_user_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![model]])
                .into_connection(),
        );

        let result = db.get_user_by_telegram_id(123456).await.unwrap();
        assert!(result.is_some());
        let user = result.unwrap();
        assert_eq!(user.telegram_id, 123456);
        assert_eq!(user.username.as_deref(), Some("testuser"));
        assert_eq!(user.language, Language::Ru);
        assert_eq!(user.gender, Some(Gender::Male));
        assert_eq!(user.level, 2);
        assert_eq!(user.balance, 100.0);
    }

    #[tokio::test]
    async fn test_get_user_not_found() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![Vec::<users::Model>::new()])
                .into_connection(),
        );

        let result = db.get_user_by_telegram_id(999).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_get_balance_existing_user() {
        let model = test_user_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![model]])
                .into_connection(),
        );

        let balance = db.get_balance(123456).await.unwrap();
        assert_eq!(balance, 100.0);
    }

    #[tokio::test]
    async fn test_get_balance_no_user() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![Vec::<users::Model>::new()])
                .into_connection(),
        );

        let balance = db.get_balance(999).await.unwrap();
        assert_eq!(balance, 0.0);
    }

    #[tokio::test]
    async fn test_check_subscription_active() {
        let model = test_user_with_sub("neurophoto");
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![model]])
                .into_connection(),
        );

        let sub = db.check_subscription(123456).await.unwrap();
        assert_eq!(sub, Some(SubscriptionType::NeuroPhoto));
    }

    #[tokio::test]
    async fn test_check_subscription_none() {
        let model = test_user_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![model]])
                .into_connection(),
        );

        let sub = db.check_subscription(123456).await.unwrap();
        assert!(sub.is_none());
    }

    #[tokio::test]
    async fn test_check_subscription_no_user() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![Vec::<users::Model>::new()])
                .into_connection(),
        );

        let sub = db.check_subscription(999).await.unwrap();
        assert!(sub.is_none());
    }

    #[tokio::test]
    async fn test_check_subscription_all_types() {
        for (sub_str, sub_type) in [
            ("neurophoto", SubscriptionType::NeuroPhoto),
            ("neurovideo", SubscriptionType::NeuroVideo),
            ("stars", SubscriptionType::Stars),
            ("neurotester", SubscriptionType::NeuroTester),
        ] {
            let model = test_user_with_sub(sub_str);
            let db = PostgresDatabase::from_connection(
                MockDatabase::new(DatabaseBackend::MySql)
                    .append_query_results(vec![vec![model]])
                    .into_connection(),
            );
            let result = db.check_subscription(123456).await.unwrap();
            assert_eq!(result, Some(sub_type));
        }
    }

    #[tokio::test]
    async fn test_get_prompt_found() {
        let model = test_prompt_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![model]])
                .into_connection(),
        );

        let result = db.get_prompt(123456).await.unwrap();
        assert_eq!(result, Some("a beautiful sunset".to_string()));
    }

    #[tokio::test]
    async fn test_get_prompt_not_found() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![Vec::<prompts::Model>::new()])
                .into_connection(),
        );

        let result = db.get_prompt(999).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_save_prompt_inserts() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![test_prompt_model()]])
                .append_exec_results(vec![MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                }])
                .into_connection(),
        );

        let result = db.save_prompt(123456, "test prompt", Some("https://example.com/img.png")).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_get_generation_found() {
        let model = test_generation_model();
        let gen_id = model.id;
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![model]])
                .into_connection(),
        );

        let result = db.get_generation(gen_id).await.unwrap();
        assert!(result.is_some());
        let gen = result.unwrap();
        assert_eq!(gen.telegram_id, 123456);
        assert_eq!(gen.media_type, MediaType::Image);
        assert_eq!(gen.status, GenerationStatus::Completed);
        assert_eq!(gen.result_url.as_deref(), Some("https://example.com/result.png"));
        assert_eq!(gen.provider.as_deref(), Some("replicate"));
    }

    #[tokio::test]
    async fn test_get_generation_not_found() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![Vec::<generations::Model>::new()])
                .into_connection(),
        );

        let result = db.get_generation(uuid::Uuid::new_v4()).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_create_generation_inserts() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![test_generation_model()]])
                .append_exec_results(vec![MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                }])
                .into_connection(),
        );

        let req = GenerationRequest {
            telegram_id: 123456,
            media_type: MediaType::Image,
            prompt: Some("test prompt".to_string()),
            image_url: None,
            model: None,
            params: serde_json::json!({}),
        };

        let result = db.create_generation(&req).await.unwrap();
        assert_eq!(result.telegram_id, 123456);
        assert_eq!(result.media_type, MediaType::Image);
        assert_eq!(result.status, GenerationStatus::Queued);
        assert!(result.result_url.is_none());
        assert!(result.error.is_none());
    }

    #[tokio::test]
    async fn test_create_generation_video() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![test_generation_model()]])
                .append_exec_results(vec![MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                }])
                .into_connection(),
        );

        let req = GenerationRequest {
            telegram_id: 42,
            media_type: MediaType::Video,
            prompt: None,
            image_url: Some("https://example.com/input.jpg".to_string()),
            model: Some("replicate-v2".to_string()),
            params: serde_json::json!({"fps": 30}),
        };

        let result = db.create_generation(&req).await.unwrap();
        assert_eq!(result.telegram_id, 42);
        assert_eq!(result.media_type, MediaType::Video);
    }

    #[tokio::test]
    async fn test_update_generation_status_completed() {
        let model = test_generation_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![
                    vec![model.clone()],
                    vec![model],
                ])
                .append_exec_results(vec![MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                }])
                .into_connection(),
        );

        let result = db.update_generation_status(
            uuid::Uuid::new_v4(),
            GenerationStatus::Completed,
            Some("https://example.com/done.png"),
            None,
        ).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_update_generation_status_failed() {
        let model = test_generation_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![
                    vec![model.clone()],
                    vec![model],
                ])
                .append_exec_results(vec![MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                }])
                .into_connection(),
        );

        let result = db.update_generation_status(
            uuid::Uuid::new_v4(),
            GenerationStatus::Failed,
            None,
            Some("timeout"),
        ).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_update_generation_status_not_found() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![Vec::<generations::Model>::new()])
                .into_connection(),
        );

        let result = db.update_generation_status(
            uuid::Uuid::new_v4(),
            GenerationStatus::Processing,
            None,
            None,
        ).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_deduct_balance_sufficient() {
        let model = test_user_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![
                    vec![model.clone()],
                    vec![model],
                ])
                .append_exec_results(vec![MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                }])
                .into_connection(),
        );

        let result = db.deduct_balance(123456, 50.0).await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_deduct_balance_insufficient() {
        let model = test_user_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![vec![model]])
                .into_connection(),
        );

        let result = db.deduct_balance(123456, 200.0).await.unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn test_deduct_balance_no_user() {
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![Vec::<users::Model>::new()])
                .into_connection(),
        );

        let result = db.deduct_balance(999, 10.0).await.unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn test_add_balance() {
        let model = test_user_model();
        let db = PostgresDatabase::from_connection(
            MockDatabase::new(DatabaseBackend::MySql)
                .append_query_results(vec![
                    vec![model.clone()],
                    vec![model],
                ])
                .append_exec_results(vec![MockExecResult {
                    last_insert_id: 0,
                    rows_affected: 1,
                }])
                .into_connection(),
        );

        let result = db.add_balance(123456, 50.0).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_health_check() {
        let db = make_db(DatabaseBackend::MySql);
        let result = db.health_check().await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn test_get_referral_count() {
        let db = make_db(DatabaseBackend::Postgres);
        let result = db.get_referral_count(123456).await;
        assert!(result.is_ok() || result.is_err());
    }

    #[tokio::test]
    async fn test_increment_generated_images() {
        let db = make_db(DatabaseBackend::MySql);
        let result = db.increment_generated_images(123456).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_media_type_roundtrip() {
        let types = [
            MediaType::Image,
            MediaType::Video,
            MediaType::Audio,
            MediaType::ImageToVideo,
            MediaType::TextToSpeech,
            MediaType::LipSync,
            MediaType::FaceSwap,
            MediaType::Morphing,
            MediaType::Upscale,
        ];
        for mt in types {
            let s = media_type_to_str(&mt);
            let back = str_to_media_type(s).expect("media_type roundtrip");
            assert_eq!(mt, back, "media_type roundtrip failed for {:?}", mt);
        }
    }

    #[tokio::test]
    async fn test_generation_status_roundtrip() {
        let statuses = [
            GenerationStatus::Queued,
            GenerationStatus::Processing,
            GenerationStatus::Completed,
            GenerationStatus::Failed,
            GenerationStatus::Cancelled,
        ];
        for s in statuses {
            let str_val = generation_status_to_str(&s);
            let back = str_to_generation_status(str_val).expect("generation_status roundtrip");
            assert_eq!(s, back, "generation_status roundtrip failed for {:?}", s);
        }
    }

    #[tokio::test]
    async fn test_subscription_roundtrip() {
        let subs = [
            SubscriptionType::NeuroPhoto,
            SubscriptionType::NeuroVideo,
            SubscriptionType::Stars,
            SubscriptionType::NeuroTester,
        ];
        for s in subs {
            let str_val = subscription_to_str(&s);
            let back = str_to_subscription(str_val);
            assert_eq!(Some(s), back, "subscription roundtrip failed for {:?}", s);
        }
    }

    #[tokio::test]
    async fn test_str_to_media_type_unknown() {
        assert!(str_to_media_type("unknown").is_err());
    }

    #[tokio::test]
    async fn test_str_to_generation_status_unknown() {
        assert!(str_to_generation_status("unknown").is_err());
    }

    #[tokio::test]
    async fn test_str_to_subscription_unknown() {
        assert_eq!(str_to_subscription("unknown"), None);
    }

    #[tokio::test]
    async fn test_get_generation_media_types() {
        for (media_str, expected) in [
            ("image", MediaType::Image),
            ("video", MediaType::Video),
            ("audio", MediaType::Audio),
            ("image_to_video", MediaType::ImageToVideo),
            ("text_to_speech", MediaType::TextToSpeech),
            ("lipsync", MediaType::LipSync),
            ("faceswap", MediaType::FaceSwap),
            ("morphing", MediaType::Morphing),
            ("upscale", MediaType::Upscale),
        ] {
            let model = generations::Model {
                media_type: media_str.to_string(),
                ..test_generation_model()
            };
            let db = PostgresDatabase::from_connection(
                MockDatabase::new(DatabaseBackend::MySql)
                    .append_query_results(vec![vec![model]])
                    .into_connection(),
            );
            let gen = db.get_generation(uuid::Uuid::new_v4()).await.unwrap().unwrap();
            assert_eq!(gen.media_type, expected, "failed for media_type={}", media_str);
        }
    }

    #[tokio::test]
    async fn test_get_generation_statuses() {
        for (status_str, expected) in [
            ("queued", GenerationStatus::Queued),
            ("processing", GenerationStatus::Processing),
            ("completed", GenerationStatus::Completed),
            ("failed", GenerationStatus::Failed),
            ("cancelled", GenerationStatus::Cancelled),
        ] {
            let model = generations::Model {
                status: status_str.to_string(),
                ..test_generation_model()
            };
            let db = PostgresDatabase::from_connection(
                MockDatabase::new(DatabaseBackend::MySql)
                    .append_query_results(vec![vec![model]])
                    .into_connection(),
            );
            let gen = db.get_generation(uuid::Uuid::new_v4()).await.unwrap().unwrap();
            assert_eq!(gen.status, expected, "failed for status={}", status_str);
        }
    }
}
