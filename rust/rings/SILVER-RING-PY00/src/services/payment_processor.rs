use std::sync::Arc;
use trios_mb_traits::{Database, PaymentGateway, PaymentInit};
use trios_mb_types::payment::*;
use trios_mb_types::errors::PaymentError;
use trios_mb_types::AppError;
use trios_mb_types::user::SubscriptionType;

pub struct PaymentProcessor {
    db: Arc<dyn Database>,
    gateways: Vec<Arc<dyn PaymentGateway>>,
}

impl PaymentProcessor {
    pub fn new(db: Arc<dyn Database>, gateways: Vec<Arc<dyn PaymentGateway>>) -> Self {
        Self { db, gateways }
    }

    pub fn gateway_for_method(&self, method: PaymentMethod) -> Option<&Arc<dyn PaymentGateway>> {
        self.gateways.iter().find(|g| g.method() == method)
    }

    pub async fn create_payment(
        &self,
        telegram_id: i64,
        amount: f64,
        method: PaymentMethod,
        description: &str,
    ) -> Result<PaymentInit, AppError> {
        let gateway = self.gateway_for_method(method)
            .ok_or_else(|| AppError::Payment(PaymentError::Provider {
                provider: format!("{:?}", method),
                message: "no gateway registered".into(),
            }))?;

        let _user = self.db.get_user_by_telegram_id(telegram_id).await?
            .ok_or_else(|| AppError::NotFound(format!("user {}", telegram_id)))?;

        let payment_init = gateway.create_payment(telegram_id, amount, description).await?;

        let tx = Transaction {
            id: payment_init.id,
            telegram_id,
            method,
            status: PaymentStatus::Pending,
            amount,
            currency: method.currency().to_string(),
            external_id: payment_init.external_id.clone(),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        self.db.create_transaction(&tx).await?;
        Ok(payment_init)
    }

    pub async fn verify_and_complete(
        &self,
        method: PaymentMethod,
        callback_params: &serde_json::Value,
    ) -> Result<Transaction, AppError> {
        let gateway = self.gateway_for_method(method)
            .ok_or_else(|| AppError::Payment(PaymentError::Provider {
                provider: format!("{:?}", method),
                message: "no gateway registered".into(),
            }))?;

        let verification = gateway.verify_callback(callback_params).await?;

        let tx = self.db.get_transaction(
            uuid::Uuid::parse_str(&verification.transaction_id)
                .map_err(|e| AppError::Internal(e.to_string()))?
        ).await?
            .ok_or_else(|| AppError::NotFound(format!("transaction {}", verification.transaction_id)))?;

        self.db.update_transaction_status(tx.id, PaymentStatus::Completed).await?;
        self.db.add_balance(tx.telegram_id, tx.amount).await?;

        Ok(tx)
    }

    pub async fn direct_debit(
        &self,
        telegram_id: i64,
        amount: f64,
        _description: &str,
        _service_type: Option<&str>,
        subscription_type: Option<SubscriptionType>,
    ) -> Result<Transaction, AppError> {
        let balance = self.db.get_balance(telegram_id).await?;
        if balance < amount {
            return Err(AppError::Payment(PaymentError::InsufficientBalance {
                required: amount,
                current: balance,
            }));
        }

        let deducted = self.db.deduct_balance(telegram_id, amount).await?;
        if !deducted {
            return Err(AppError::Payment(PaymentError::InsufficientBalance {
                required: amount,
                current: balance,
            }));
        }

        let id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let tx = Transaction {
            id,
            telegram_id,
            method: PaymentMethod::TelegramStars,
            status: PaymentStatus::Completed,
            amount,
            currency: "XTR".to_string(),
            external_id: None,
            created_at: now,
            updated_at: now,
        };

        self.db.create_transaction(&tx).await?;

        if let Some(_sub_type) = subscription_type {
            let _ = self.db.renew_subscription(telegram_id, _sub_type).await;
        }

        Ok(tx)
    }

    pub async fn refund(
        &self,
        transaction_id: uuid::Uuid,
        method: PaymentMethod,
    ) -> Result<(), AppError> {
        let tx = self.db.get_transaction(transaction_id).await?
            .ok_or_else(|| AppError::NotFound(format!("transaction {}", transaction_id)))?;

        if tx.status != PaymentStatus::Completed {
            return Err(AppError::Payment(PaymentError::AlreadyProcessed {
                id: transaction_id.to_string(),
            }));
        }

        let gateway = self.gateway_for_method(method);
        if let Some(gw) = gateway {
            if let Some(ext_id) = &tx.external_id {
                gw.refund(ext_id).await?;
            }
        }

        self.db.update_transaction_status(transaction_id, PaymentStatus::Refunded).await?;
        self.db.add_balance(tx.telegram_id, tx.amount).await?;
        Ok(())
    }

    pub async fn get_payment_status(&self, transaction_id: uuid::Uuid) -> Result<PaymentStatus, AppError> {
        let tx = self.db.get_transaction(transaction_id).await?
            .ok_or_else(|| AppError::NotFound(format!("transaction {}", transaction_id)))?;
        Ok(tx.status)
    }
}
