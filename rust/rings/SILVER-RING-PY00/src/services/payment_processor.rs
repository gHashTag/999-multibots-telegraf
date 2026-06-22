use std::sync::Arc;
use trios_mb_traits::{Database, PaymentGateway, PaymentInit};
use trios_mb_types::payment::*;
use trios_mb_types::errors::PaymentError;
use trios_mb_types::AppError;
use trios_mb_types::user::SubscriptionType;
use trios_mb_types::Money;

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

    #[tracing::instrument(skip(self), fields(telegram_id = telegram_id, method = ?method))]
    pub async fn create_payment(
        &self,
        telegram_id: i64,
        amount: f64,
        method: PaymentMethod,
        description: &str,
    ) -> Result<PaymentInit, AppError> {
        if !amount.is_finite() || amount <= 0.0 {
            return Err(AppError::Validation(format!(
                "payment amount must be finite and > 0: {}",
                amount
            )));
        }
        let _amount_money = Money::from_f64(amount)
            .ok_or_else(|| AppError::Validation(format!("payment amount overflows Money: {}", amount)))?;

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

    #[tracing::instrument(skip(self, callback_params), fields(method = ?method))]
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
        if !verification.amount.is_finite() || verification.amount < 0.0 {
            return Err(AppError::Validation(format!(
                "callback amount must be finite and >= 0: {}",
                verification.amount
            )));
        }
        let _amount_money = Money::from_f64(verification.amount)
            .ok_or_else(|| AppError::Validation(format!("callback amount overflows Money: {}", verification.amount)))?;

        let tx = self.db.get_transaction_by_external_id(&verification.transaction_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("transaction {}", verification.transaction_id)))?;

        // Idempotency guard: skip if already completed
        if tx.status == PaymentStatus::Completed {
            tracing::info!(tx_id = %tx.id, "verify_and_complete: transaction already completed; returning early");
            return Ok(tx);
        }

        self.db.update_transaction_status(tx.id, PaymentStatus::Completed).await?;
        self.db.add_balance(tx.telegram_id, tx.amount).await?;

        Ok(tx)
    }

    #[tracing::instrument(skip(self), fields(telegram_id = telegram_id))]
    pub async fn direct_debit(
        &self,
        telegram_id: i64,
        amount: f64,
        _description: &str,
        _service_type: Option<&str>,
        subscription_type: Option<SubscriptionType>,
    ) -> Result<Transaction, AppError> {
        if !amount.is_finite() || amount <= 0.0 {
            return Err(AppError::Validation(format!(
                "direct_debit amount must be finite and > 0: {}",
                amount
            )));
        }
        let amount_money = Money::from_f64(amount)
            .ok_or_else(|| AppError::Validation(format!("direct_debit amount overflows Money: {}", amount)))?;

        let balance = self.db.get_balance(telegram_id).await?;
        let balance_money = Money::from_f64(balance)
            .ok_or_else(|| AppError::Internal(format!("user balance overflows Money: {}", balance)))?;
        if balance_money.checked_sub(amount_money).is_none() {
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
            if let Err(e) = self.db.renew_subscription(telegram_id, _sub_type).await {
                tracing::error!(telegram_id = telegram_id, error = %e, "Failed to renew subscription after payment");
            }
        }

        Ok(tx)
    }

    #[tracing::instrument(skip(self), fields(transaction_id = %transaction_id, method = ?method))]
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
        if !tx.amount.is_finite() || tx.amount <= 0.0 {
            return Err(AppError::Validation(format!(
                "refund amount must be finite and > 0: {}",
                tx.amount
            )));
        }
        let _amount_money = Money::from_f64(tx.amount)
            .ok_or_else(|| AppError::Validation(format!("refund amount overflows Money: {}", tx.amount)))?;

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

    #[tracing::instrument(skip(self), fields(transaction_id = %transaction_id))]
    pub async fn get_payment_status(&self, transaction_id: uuid::Uuid) -> Result<PaymentStatus, AppError> {
        let tx = self.db.get_transaction(transaction_id).await?
            .ok_or_else(|| AppError::NotFound(format!("transaction {}", transaction_id)))?;
        Ok(tx.status)
    }
}
