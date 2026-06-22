use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use std::sync::Arc;
use std::time::Duration;
use trios_mb_types::generation::GenerationStatus;
use trios_mb_types::truncate_for_log;
use trios_mb_proto::replicate::WebhookPayload;
use secrecy::ExposeSecret;
use subtle::ConstantTimeEq;
use crate::AppState;

const WEBHOOK_DB_TIMEOUT: Duration = Duration::from_secs(10);

/// Validate a result URL before storing it in the database.
/// Only allows `http://` or `https://` pointing to public hosts.
fn validate_result_url(url_str: &str) -> Result<(), String> {
    const MAX_URL_LEN: usize = 4096;
    if url_str.is_empty() {
        return Err("URL is empty".to_string());
    }
    if url_str.len() > MAX_URL_LEN {
        return Err(format!("URL exceeds maximum length of {} bytes", MAX_URL_LEN));
    }

    let parsed = url::Url::parse(url_str).map_err(|e| format!("Invalid URL: {}", e))?;

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("URL must use http or https scheme".to_string()),
    }

    // Reject embedded credentials
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("URL contains embedded credentials".to_string());
    }

    if let Some(host) = parsed.host_str() {
        let lower = host.to_lowercase();
        if lower == "localhost" {
            return Err("URL points to localhost".to_string());
        }
        if let Ok(ip) = lower.parse::<std::net::IpAddr>() {
            if ip.is_loopback() {
                return Err("URL points to a loopback address".to_string());
            }
            if ip.is_unspecified() {
                return Err("URL points to an unspecified address".to_string());
            }
            match ip {
                std::net::IpAddr::V4(v4) => {
                    if v4.is_private() || v4.is_link_local() {
                        return Err("URL points to a private or link-local address".to_string());
                    }
                }
                std::net::IpAddr::V6(v6) => {
                    // Reject IPv4-mapped IPv6 that bypasses IPv4 filters (e.g. ::ffff:127.0.0.1)
                    if let Some(v4) = v6.to_ipv4_mapped() {
                        if v4.is_loopback() || v4.is_private() || v4.is_link_local() {
                            return Err("URL points to an IPv4-mapped internal address".to_string());
                        }
                    }
                    let segments = v6.segments();
                    // IPv6 ULA fc00::/7
                    if (segments[0] & 0xfe00) == 0xfc00 {
                        return Err("URL points to an IPv6 ULA address".to_string());
                    }
                    // IPv6 link-local fe80::/10
                    if (segments[0] & 0xffc0) == 0xfe80 {
                        return Err("URL points to an IPv6 link-local address".to_string());
                    }
                }
            }
        }
    } else {
        return Err("URL has no host".to_string());
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
            tracing::warn!(input = %truncate_for_log(s, 256), error = %e, "Invalid UUID in webhook payload");
            (StatusCode::BAD_REQUEST, "Invalid UUID".to_string())
        })
}

/// Verify webhook secret from `X-Webhook-Secret` header against a pre-loaded token.
/// Uses constant-time comparison to prevent timing attacks.
/// Accepts `&SecretString` so the raw value is exposed only inside this function body,
/// minimising the window where a core dump or panic message could recover it.
#[tracing::instrument(skip_all)]
fn verify_webhook_secret(headers: &HeaderMap, expected: &secrecy::SecretString) -> Result<(), (StatusCode, String)> {
    let provided = match headers.get("X-Webhook-Secret") {
        Some(h) => match h.to_str() {
            Ok(s) => s,
            Err(_) => return Err((StatusCode::UNAUTHORIZED, "Invalid webhook secret header".to_string())),
        },
        None => return Err((StatusCode::UNAUTHORIZED, "Missing webhook secret header".to_string())),
    };

    // Constant-time comparison via subtle::ConstantTimeEq.
    // Do NOT add an explicit length check before ct_eq — that would leak the secret length
    // via timing (different code path for wrong-length inputs). subtle::ct_eq already
    // returns Choice(0) for different lengths.
    let expected_raw = expected.expose_secret();
    let eq = expected_raw.as_bytes().ct_eq(provided.as_bytes());
    if eq.unwrap_u8() == 0 {
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
    let replicate_secret = match state.webhook_secrets.get("REPLICATE_WEBHOOK_SECRET") {
        Some(s) => s,
        None => {
            tracing::error!("REPLICATE_WEBHOOK_SECRET not loaded at startup; rejecting webhook");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Internal server error"})));
        }
    };
    if let Err((status, msg)) = verify_webhook_secret(&headers, replicate_secret) {
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
    let gen_opt = match tokio::time::timeout(WEBHOOK_DB_TIMEOUT, state.db.get_generation(generation_id)).await {
        Ok(Ok(Some(gen))) if is_terminal_status(gen.status) => {
            tracing::info!(generation_id = %generation_id, status = ?gen.status, "Webhook ignored: generation already in terminal state");
            return (StatusCode::OK, Json(serde_json::json!({"status": "ok"})));
        }
        Ok(Ok(gen)) => gen,
        Ok(Err(e)) => {
            tracing::error!(generation_id = %generation_id, error = %e, "Failed to load generation for terminal-state check");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal error"})));
        }
        Err(_) => {
            tracing::warn!(generation_id = %generation_id, "Generation lookup timed out");
            return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
        }
    };
    let telegram_id = gen_opt.as_ref().map(|g| g.telegram_id);

    if payload.is_completed() {
        let urls = payload.output_urls();
        let url = urls.first().map(|s| s.as_str()).unwrap_or("");
        if !url.is_empty() {
            if let Err(reason) = validate_result_url(url) {
                tracing::warn!(url = %truncate_for_log(url, 256), reason = %reason, "Rejecting Replicate result URL");
            } else if let Some(telegram_id) = telegram_id {
                match tokio::time::timeout(
                    WEBHOOK_DB_TIMEOUT,
                    state.db.update_generation_status_owned(
                        generation_id,
                        telegram_id,
                        GenerationStatus::Completed,
                        Some(url),
                        None,
                    )
                ).await {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => {
                        tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Replicate webhook");
                        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                    }
                    Err(_) => {
                        tracing::warn!(generation_id = %generation_id, "Update generation status timed out");
                        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                    }
                }
            }
        }

        if let Some(weights) = payload.output_weights() {
            let weights_truncated = trios_mb_types::truncate_for_log(&weights, 256);
            tracing::info!(
                id = %payload.id,
                weights = %weights_truncated,
                "Training completed, weights available"
            );
        }
    } else if payload.is_failed() {
        let error = truncate_for_log(payload.error.as_deref().unwrap_or("unknown"), 1024);
        if let Some(telegram_id) = telegram_id {
            match tokio::time::timeout(
                WEBHOOK_DB_TIMEOUT,
                state.db.update_generation_status_owned(
                    generation_id,
                    telegram_id,
                    GenerationStatus::Failed,
                    None,
                    Some(&error),
                )
            ).await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Replicate failure webhook");
                    return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                }
                Err(_) => {
                    tracing::warn!(generation_id = %generation_id, "Update generation status timed out");
                    return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                }
            }
        }
    }

    // Wave 191: record idempotency AFTER successful DB update so provider retries
    // are not permanently lost on transient DB errors.
    match tokio::time::timeout(WEBHOOK_DB_TIMEOUT, state.db.record_webhook_event("replicate", &payload.id)).await {
        Ok(Ok(true)) => {},
        Ok(Ok(false)) => {
            tracing::info!(id = %payload.id, "Replicate webhook: duplicate event after processing");
        }
        Ok(Err(e)) => {
            tracing::error!(error = %e, id = %payload.id, "Failed to record webhook event after successful processing");
        }
        Err(_) => {
            tracing::warn!(id = %payload.id, "Webhook idempotency record timed out after successful processing");
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
    let kie_secret = match state.webhook_secrets.get("KIE_WEBHOOK_SECRET") {
        Some(s) => s,
        None => {
            tracing::error!("KIE_WEBHOOK_SECRET not loaded at startup; rejecting webhook");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "Internal server error"})));
        }
    };
    if let Err((status, msg)) = verify_webhook_secret(&headers, kie_secret) {
        tracing::warn!("Kie.ai webhook rejected: invalid secret");
        return (status, Json(serde_json::json!({"error": msg})));
    }

    tracing::info!(
        task_id = %truncate_for_log(payload.task_id.as_deref().unwrap_or(""), 256),
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
    let gen_opt = match tokio::time::timeout(WEBHOOK_DB_TIMEOUT, state.db.get_generation(generation_id)).await {
        Ok(Ok(Some(gen))) if is_terminal_status(gen.status) => {
            tracing::info!(generation_id = %generation_id, status = ?gen.status, "Webhook ignored: generation already in terminal state");
            return (StatusCode::OK, Json(serde_json::json!({"status": "ok"})));
        }
        Ok(Ok(gen)) => gen,
        Ok(Err(e)) => {
            tracing::error!(generation_id = %generation_id, error = %e, "Failed to load generation for terminal-state check");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({"error": "internal error"})));
        }
        Err(_) => {
            tracing::warn!(generation_id = %generation_id, "Generation lookup timed out");
            return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
        }
    };
    let telegram_id = gen_opt.as_ref().map(|g| g.telegram_id);

    if payload.is_completed() {
        if let Some(url) = payload.first_video_url() {
            if let Err(reason) = validate_result_url(&url) {
                tracing::warn!(url = %truncate_for_log(&url, 256), reason = %reason, "Rejecting Kie.ai result URL");
            } else if let Some(telegram_id) = telegram_id {
                match tokio::time::timeout(
                    WEBHOOK_DB_TIMEOUT,
                    state.db.update_generation_status_owned(
                        generation_id,
                        telegram_id,
                        GenerationStatus::Completed,
                        Some(&url),
                        None,
                    )
                ).await {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => {
                        tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Kie.ai webhook");
                        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                    }
                    Err(_) => {
                        tracing::warn!(generation_id = %generation_id, "Update generation status timed out");
                        return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                    }
                }
            }
        }
    } else if payload.is_failed() {
        let error = truncate_for_log(payload.error_message.as_deref().unwrap_or("unknown"), 1024);
        if let Some(telegram_id) = telegram_id {
            match tokio::time::timeout(
                WEBHOOK_DB_TIMEOUT,
                state.db.update_generation_status_owned(
                    generation_id,
                    telegram_id,
                    GenerationStatus::Failed,
                    None,
                    Some(&error),
                )
            ).await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    tracing::error!(error = %e, generation_id = %generation_id, "Failed to update generation status on Kie.ai failure webhook");
                    return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                }
                Err(_) => {
                    tracing::warn!(generation_id = %generation_id, "Update generation status timed out");
                    return (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"error": "DB timeout, retry later"})));
                }
            }
        }
    }

    // Wave 191: record idempotency AFTER successful DB update.
    let event_id = payload.task_id.as_deref().unwrap_or("missing");
    match tokio::time::timeout(WEBHOOK_DB_TIMEOUT, state.db.record_webhook_event("kie", event_id)).await {
        Ok(Ok(true)) => {},
        Ok(Ok(false)) => {
            tracing::info!(task_id = %event_id, "Kie.ai webhook: duplicate event after processing");
        }
        Ok(Err(e)) => {
            tracing::error!(error = %e, task_id = %event_id, "Failed to record webhook event after successful processing");
        }
        Err(_) => {
            tracing::warn!(task_id = %event_id, "Webhook idempotency record timed out after successful processing");
        }
    }

    (StatusCode::OK, Json(serde_json::json!({"status": "ok"})))
}
