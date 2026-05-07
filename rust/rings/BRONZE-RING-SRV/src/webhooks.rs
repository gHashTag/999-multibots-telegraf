use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use std::sync::Arc;
use trios_mb_types::generation::GenerationStatus;
use trios_mb_proto::replicate::WebhookPayload;
use crate::AppState;

pub async fn replicate_webhook(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<WebhookPayload>,
) -> impl IntoResponse {
    tracing::info!(
        id = %payload.id,
        status = %payload.status,
        "Replicate webhook received"
    );

    if payload.is_completed() {
        let urls = payload.output_urls();
        let url = urls.first().map(|s| s.as_str()).unwrap_or("");
        if !url.is_empty() {
            let _ = state.db.update_generation_status(
                uuid::Uuid::parse_str(&payload.id).unwrap_or_default(),
                GenerationStatus::Completed,
                Some(url),
                None,
            ).await;
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
        let _ = state.db.update_generation_status(
            uuid::Uuid::parse_str(&payload.id).unwrap_or_default(),
            GenerationStatus::Failed,
            None,
            Some(error),
        ).await;
    }

    (StatusCode::OK, Json(serde_json::json!({"status": "ok"})))
}

pub async fn kie_ai_webhook(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<trios_mb_proto::kie::WebhookPayload>,
) -> impl IntoResponse {
    tracing::info!(
        task_id = ?payload.task_id,
        success_flag = ?payload.success_flag_val(),
        "Kie.ai webhook received"
    );

    if payload.is_completed() {
        if let Some(url) = payload.first_video_url() {
            let task_id = payload.task_id.as_deref().unwrap_or_default();
            let _ = state.db.update_generation_status(
                uuid::Uuid::parse_str(task_id).unwrap_or_default(),
                GenerationStatus::Completed,
                Some(&url),
                None,
            ).await;
        }
    } else if payload.is_failed() {
        let task_id = payload.task_id.as_deref().unwrap_or_default();
        let error = payload.error_message.as_deref().unwrap_or("unknown");
        let _ = state.db.update_generation_status(
            uuid::Uuid::parse_str(task_id).unwrap_or_default(),
            GenerationStatus::Failed,
            None,
            Some(error),
        ).await;
    }

    (StatusCode::OK, Json(serde_json::json!({"status": "ok"})))
}
