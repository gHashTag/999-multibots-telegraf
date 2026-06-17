use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use std::sync::Arc;
use trios_mb_types::generation::GenerationStatus;
use trios_mb_proto::replicate::WebhookPayload;
use crate::AppState;

/// Validate a result URL before storing it in the database.
/// Only allows `http://` or `https://` pointing to public hosts.
fn validate_result_url(url: &str) -> Result<(), String> {
    const MAX_URL_LEN: usize = 4096;
    if url.is_empty() {
        return Err("URL is empty".to_string());
    }
    if url.len() > MAX_URL_LEN {
        return Err(format!("URL exceeds maximum length of {} bytes", MAX_URL_LEN));
    }
    // Reject URLs with embedded credentials or percent-encoded bypasses
    if url.contains('@') || url.contains('%') {
        return Err("URL contains disallowed characters (@ or %)".to_string());
    }
    // Basic scheme validation
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must use http or https scheme".to_string());
    }
    // Reject common SSRF / internal indicators in the raw string
    let lower = url.to_lowercase();
    if lower.contains("127.")
        || lower.contains("10.")
        || lower.contains("192.168.")
        || lower.contains("0.0.0.0")
        || lower.contains("::1")
        || lower.contains("localhost")
        || lower.contains("169.254.")
        || lower.contains("172.16.")
        || lower.contains("172.17.")
        || lower.contains("172.18.")
        || lower.contains("172.19.")
        || lower.contains("172.20.")
        || lower.contains("172.21.")
        || lower.contains("172.22.")
        || lower.contains("172.23.")
        || lower.contains("172.24.")
        || lower.contains("172.25.")
        || lower.contains("172.26.")
        || lower.contains("172.27.")
        || lower.contains("172.28.")
        || lower.contains("172.29.")
        || lower.contains("172.30.")
        || lower.contains("172.31.")
        || lower.contains("file://")
        || lower.contains("ftp://")
        || lower.contains("ssh://")
        || lower.contains("telnet://")
        || lower.contains("gopher://")
    {
        return Err("URL points to a private or unsupported address".to_string());
    }
    Ok(())
}

/// Returns true if the status is terminal (no further transitions allowed).
fn is_terminal_status(status: GenerationStatus) -> bool {
    matches!(status, GenerationStatus::Completed | GenerationStatus::Failed | GenerationStatus::Cancelled)
}

fn parse_uuid(s: &str) -> Result<uuid::Uuid, (StatusCode, String)> {
    uuid::Uuid::parse_str(s)
        .map_err(|e| {
            tracing::warn!(input = %s, error = %e, "Invalid UUID in webhook payload");
            (StatusCode::BAD_REQUEST, "Invalid UUID".to_string())
        })
}

/// Verify webhook secret from `X-Webhook-Secret` header against an env-var token.
/// Uses constant-time comparison to prevent timing attacks.
fn verify_webhook_secret(headers: &HeaderMap, env_var: &str) -> Result<(), (StatusCode, String)> {
    let expected = match std::env::var(env_var) {
        Ok(v) if !v.is_empty() => v,
        _ => {
            tracing::error!(env_var = %env_var, "Webhook secret not configured");
            return Err((StatusCode::INTERNAL_SERVER_ERROR, "Webhook secret not configured".to_string()));
        }
    };

    let provided = match headers.get("X-Webhook-Secret") {
        Some(h) => match h.to_str() {
            Ok(s) => s,
            Err(_) => return Err((StatusCode::UNAUTHORIZED, "Invalid webhook secret header".to_string())),
        },
        None => return Err((StatusCode::UNAUTHORIZED, "Missing webhook secret header".to_string())),
    };

    if expected.len() != provided.len() {
        return Err((StatusCode::UNAUTHORIZED, "Invalid webhook secret".to_string()));
    }
    let mut diff = 0u8;
    for (a, b) in expected.bytes().zip(provided.bytes()) {
        diff |= a ^ b;
    }
    if diff != 0 {
        return Err((StatusCode::UNAUTHORIZED, "Invalid webhook secret".to_string()));
    }
    Ok(())
}

#[tracing::instrument(skip(state, headers, payload), fields(webhook_type = "replicate", id = %payload.id))]
pub async fn replicate_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<WebhookPayload>,
) -> impl IntoResponse {
    if let Err((status, msg)) = verify_webhook_secret(&headers, "REPLICATE_WEBHOOK_SECRET") {
        tracing::warn!("Replicate webhook rejected: invalid secret");
        return (status, Json(serde_json::json!({"error": msg})));
    }

    tracing::info!(
        id = %payload.id,
        status = %payload.status,
        "Replicate webhook received"
    );

    let generation_id = match parse_uuid(&payload.id) {
        Ok(id) => id,
        Err((status, msg)) => return (status, Json(serde_json::json!({"error": msg}))),
    };

    // Wave 160: reject updates to terminal generations to prevent replay overwrites
    match state.db.get_generation(generation_id).await {
        Ok(Some(gen)) if is_terminal_status(gen.status) => {
            tracing::info!(generation_id = %generation_id, status = ?gen.status, "Webhook ignored: generation already in terminal state");
            return (StatusCode::OK, Json(serde_json::json!({"status": "ok"})));
        }
        Ok(_) => {}
        Err(e) => {
            tracing::error!(generation_id = %generation_id, error = %e, "Failed to load generation for terminal-state check");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal error"})));
        }
    }

    if payload.is_completed() {
        let urls = payload.output_urls();
        let url = urls.first().map(|s| s.as_str()).unwrap_or("");
        if !url.is_empty() {
            if let Err(reason) = validate_result_url(url) {
                tracing::warn!(url = %url, reason = %reason, "Rejecting Replicate result URL");
            } else if let Err(e) = state.db.update_generation_status(
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

#[tracing::instrument(skip(state, headers, payload), fields(webhook_type = "kie_ai", task_id = ?payload.task_id))]
pub async fn kie_ai_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<trios_mb_proto::kie::WebhookPayload>,
) -> impl IntoResponse {
    if let Err((status, msg)) = verify_webhook_secret(&headers, "KIE_WEBHOOK_SECRET") {
        tracing::warn!("Kie.ai webhook rejected: invalid secret");
        return (status, Json(serde_json::json!({"error": msg})));
    }

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

    // Wave 160: reject updates to terminal generations to prevent replay overwrites
    match state.db.get_generation(generation_id).await {
        Ok(Some(gen)) if is_terminal_status(gen.status) => {
            tracing::info!(generation_id = %generation_id, status = ?gen.status, "Webhook ignored: generation already in terminal state");
            return (StatusCode::OK, Json(serde_json::json!({"status": "ok"})));
        }
        Ok(_) => {}
        Err(e) => {
            tracing::error!(generation_id = %generation_id, error = %e, "Failed to load generation for terminal-state check");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal error"})));
        }
    }

    if payload.is_completed() {
        if let Some(url) = payload.first_video_url() {
            if let Err(reason) = validate_result_url(&url) {
                tracing::warn!(url = %url, reason = %reason, "Rejecting Kie.ai result URL");
            } else if let Err(e) = state.db.update_generation_status(
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
