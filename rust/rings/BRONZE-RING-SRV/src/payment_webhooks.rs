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

pub async fn robokassa_callback(
    State(state): State<Arc<AppState>>,
    Form(form): Form<RobokassaCallbackForm>,
) -> impl IntoResponse {
    tracing::info!(
        inv_id = %form.inv_id,
        amount = %form.out_sum,
        "Robokassa callback received"
    );

    if let Some(gateway) = &state.payment_gateway {
        let params = serde_json::json!({
            "OutSum": form.out_sum,
            "InvId": form.inv_id,
            "SignatureValue": form.signature_value,
        });

        match gateway.verify_callback(&params).await {
            Ok(verification) => {
                if let Ok(tx_id) = uuid::Uuid::parse_str(&verification.transaction_id) {
                    let _ = state.db.update_transaction_status(tx_id, PaymentStatus::Completed).await;
                    if let Some(tid) = verification.telegram_id {
                        let _ = state.db.add_balance(tid, verification.amount).await;
                    }
                }
                "OK".to_string()
            }
            Err(e) => {
                tracing::error!(error = %e, "Robokassa verification failed");
                format!("ERROR: {}", e)
            }
        }
    } else {
        "ERROR: no payment gateway".to_string()
    }
}
