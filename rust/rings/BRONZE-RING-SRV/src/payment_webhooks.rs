use axum::extract::State;
use axum::response::IntoResponse;
use axum::Form;
use serde::Deserialize;
use std::sync::Arc;
use std::time::Duration;
use trios_mb_types::payment::PaymentStatus;
use crate::AppState;

const WEBHOOK_DB_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Deserialize)]
pub struct RobokassaCallbackForm {
    pub out_sum: String,
    pub inv_id: String,
    pub signature_value: String,
}

impl std::fmt::Debug for RobokassaCallbackForm {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RobokassaCallbackForm")
            .field("out_sum", &self.out_sum)
            .field("inv_id", &self.inv_id)
            .field("signature_value", &"[REDACTED]")
            .finish()
    }
}

#[tracing::instrument(skip(state, form), fields(inv_id = %form.inv_id))]
pub async fn robokassa_callback(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RobokassaCallbackForm>,
) -> impl IntoResponse {
    tracing::info!(
        inv_id = %form.inv_id,
        amount = %form.out_sum,
        "Robokassa callback received"
    );

    let _out_sum_parsed: f64 = match form.out_sum.parse::<f64>() {
        Ok(v) if v.is_finite() && v >= 0.0 => v,
        Ok(v) => {
            tracing::warn!(out_sum = %v, "Robokassa callback rejected: invalid amount");
            return "ERROR: invalid amount".to_string();
        }
        Err(e) => {
            tracing::warn!(out_sum = %form.out_sum, error = %e, "Robokassa callback rejected: amount parse error");
            return "ERROR: invalid amount format".to_string();
        }
    };

    if let Some(gateway) = &state.payment_gateway {
        let params = serde_json::json!({
            "OutSum": form.out_sum,
            "InvId": form.inv_id,
            "SignatureValue": form.signature_value,
        });

        match gateway.verify_callback(&params).await {
            Ok(verification) => {
                let external_id = &verification.transaction_id;

                let tx = match tokio::time::timeout(
                    WEBHOOK_DB_TIMEOUT,
                    state.db.get_transaction_by_external_id(external_id)
                ).await {
                    Ok(Ok(Some(tx))) => tx,
                    Ok(Ok(None)) => {
                        tracing::warn!(external_id = %external_id, "Robokassa callback: transaction not found");
                        return "ERROR: transaction not found".to_string();
                    }
                    Ok(Err(e)) => {
                        tracing::error!(error = %e, external_id = %external_id, "Failed to load transaction");
                        return "ERROR: internal error".to_string();
                    }
                    Err(_) => {
                        tracing::warn!(external_id = %external_id, "Transaction lookup timed out");
                        return "ERROR: DB timeout".to_string();
                    }
                };

                if let Some(tid) = verification.telegram_id {
                    match tokio::time::timeout(
                        WEBHOOK_DB_TIMEOUT,
                        state.db.complete_robokassa_payment(tx.id, tid, verification.amount)
                    ).await {
                        Ok(Ok(true)) => {
                            tracing::info!(tx_id = %tx.id, "Robokassa payment credited atomically");
                            "OK".to_string()
                        }
                        Ok(Ok(false)) => {
                            tracing::info!(tx_id = %tx.id, "Robokassa callback: transaction already completed; skipping");
                            "OK".to_string()
                        }
                        Ok(Err(e)) => {
                            tracing::error!(error = %e, tx_id = %tx.id, "Failed to complete Robokassa payment");
                            "ERROR: internal error".to_string()
                        }
                        Err(_) => {
                            tracing::warn!(tx_id = %tx.id, "Complete payment timed out");
                            "ERROR: DB timeout".to_string()
                        }
                    }
                } else {
                    match tokio::time::timeout(
                        WEBHOOK_DB_TIMEOUT,
                        state.db.update_transaction_status(tx.id, PaymentStatus::Completed)
                    ).await {
                        Ok(Ok(())) => "OK".to_string(),
                        Ok(Err(e)) => {
                            tracing::error!(error = %e, tx_id = %tx.id, "Failed to update transaction status");
                            "ERROR: internal error".to_string()
                        }
                        Err(_) => {
                            tracing::warn!(tx_id = %tx.id, "Update transaction status timed out");
                            "ERROR: DB timeout".to_string()
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!(error = %e, "Robokassa verification failed");
                "ERROR: verification failed".to_string()
            }
        }
    } else {
        tracing::error!("Robokassa callback received but no payment gateway configured");
        "ERROR: no payment gateway".to_string()
    }
}
