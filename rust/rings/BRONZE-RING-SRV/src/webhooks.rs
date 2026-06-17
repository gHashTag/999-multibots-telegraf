use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use std::sync::Arc;
use trios_mb_types::generation::GenerationStatus;
use trios_mb_proto::replicate::WebhookPayload;
use crate::AppState;

fn parse_uuid(s: &str) -> Result<uuid::Uuid, (StatusCode, String)> {
    uuid::Uuid::parse_str(s)
        .map_err(|e| {
            tracing::warn!(input = %s, error = %e, "Invalid UUID in webhook payload");
            (StatusCode::BAD_REQUEST, format!("Invalid UUID: {}", e))
        })
}

#[tracing::instrument(skip(state, payload), fields(webhook_type = "replicate", id = %payload.id))]
pub async fn replicate_webhook(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<WebhookPayload>,
) -> impl IntoResponse {
    tracing::info!(
        id = %payload.id,
        status = %payload.status,
        "Replicate webhook received"
    );

    let generation_id = match parse_uuid(&payload.id) {
        Ok(id) => id,
        Err((status, msg)) => return (status, Json(serde_json::json!({"error": msg}))),
    };

    if payload.is_completed() {
        let urls = payload.output_urls();
        let url = urls.first().map(|s| s.as_str()).unwrap_or("");
        if !url.is_empty() {
            if let Err(e) = state.db.update_generation_status(
                generation_id,
                GenerationStatus::Completed,
                Some(url),
                None,
            ).await {
                tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Replicate webhook");
            }
        }

        if let Some(weights) = payload.output_weights() {
            tracing::info!(
                id = %payload.id,
                weights = %weights,
                "Training completed, weights available"
            );
        }
    } else if payload.is_failed() {
        let error = payload.error.as_deref().unwrap_or("unknown");
        if let Err(e) = state.db.update_generation_status(
            generation_id,
            GenerationStatus::Failed,
            None,
            Some(error),
        ).await {
            tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Replicate failure webhook");
        }
    }

    (StatusCode::OK, Json(serde_json::json!({"status": "ok"})))
}

#[tracing::instrument(skip(state, payload), fields(webhook_type = "kie_ai", task_id = ?payload.task_id))]
pub async fn kie_ai_webhook(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<trios_mb_proto::kie::WebhookPayload>,
) -> impl IntoResponse {
    tracing::info!(
        task_id = ?payload.task_id,
        success_flag = ?payload.success_flag_val(),
        "Kie.ai webhook received"
    );

    let task_id = match payload.task_id.as_deref() {
        Some(t) => t,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "missing task_id"})),
            );
        }
    };
    let generation_id = match parse_uuid(task_id) {
        Ok(id) => id,
        Err((status, msg)) => return (status, Json(serde_json::json!({"error": msg}))),
    };

    if payload.is_completed() {
        if let Some(url) = payload.first_video_url() {
            if let Err(e) = state.db.update_generation_status(
                generation_id,
                GenerationStatus::Completed,
                Some(&url),
                None,
            ).await {
                tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Kie.ai webhook");
            }
        }
    } else if payload.is_failed() {
        let error = payload.error_message.as_deref().unwrap_or("unknown");
        if let Err(e) = state.db.update_generation_status(
            generation_id,
            GenerationStatus::Failed,
            None,
            Some(error),
        ).await {
            tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Kie.ai failure webhook");
        }
    }

    (StatusCode::OK, Json(serde_json::json!({"status": "ok"})))
}
