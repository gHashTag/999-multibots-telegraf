use axum::extract::State;
use axum::response::IntoResponse;
use axum::Form;
use serde::Deserialize;
use std::sync::Arc;
use trios_mb_types::payment::PaymentStatus;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct RobokassaCallbackForm {
    pub out_sum: String,
    pub inv_id: String,
    pub signature_value: String,
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
                // Idempotency guard: load transaction by external_id and skip if already completed
                let tx = match state.db.get_transaction_by_external_id(external_id).await {
                    Ok(Some(tx)) => tx,
                    Ok(None) => {
                        tracing::warn!(external_id = %external_id, "Robokassa callback: transaction not found");
                        return "ERROR: transaction not found".to_string();
                    }
                    Err(e) => {
                        tracing::error!(error = %e, external_id = %external_id, "Failed to load transaction for idempotency check");
                        return "ERROR: internal error".to_string();
                    }
                };

                if tx.status == PaymentStatus::Completed {
                    tracing::info!(tx_id = %tx.id, "Robokassa callback: transaction already completed; skipping");
                    return "OK".to_string();
                }

                if let Err(e) = state.db.update_transaction_status(tx.id, PaymentStatus::Completed).await {
                    tracing::error!(error = %e, tx_id = %tx.id, "Failed to update transaction status after Robokassa verification");
                    return "ERROR: internal error".to_string();
                }
                if let Some(tid) = verification.telegram_id {
                    if let Err(e) = state.db.add_balance(tid, verification.amount).await {
                        tracing::error!(telegram_id = tid, error = %e, "Failed to add balance after Robokassa payment");
                        return "ERROR: internal error".to_string();
                    }
                }
                "OK".to_string()
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
