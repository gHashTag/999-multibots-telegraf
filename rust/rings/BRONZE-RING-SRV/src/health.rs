use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;
use crate::AppState;

const HEALTH_DB_TIMEOUT: Duration = Duration::from_secs(5);

#[tracing::instrument]
pub async fn health_check() -> impl IntoResponse {
    (
        [(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-cache, no-store, must-revalidate"),
        )],
        Json(json!({
            "status": "ok",
        })),
    )
}

#[tracing::instrument(skip(state))]
pub async fn health_check_with_db(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> impl IntoResponse {
    let (status, body) = match timeout(HEALTH_DB_TIMEOUT, state.db.health_check()).await {
        Ok(Ok(true)) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "db": "connected",
            })),
        ),
        Ok(Ok(false)) => {
            tracing::warn!("DB health check returned false; service degraded");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "degraded",
                    "db": "unhealthy",
                })),
            )
        }
        Ok(Err(e)) => {
            tracing::error!(error = %e, "DB health check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "degraded",
                    "db": "disconnected",
                })),
            )
        }
        Err(_) => {
            tracing::warn!("DB health check timed out");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "degraded",
                    "db": "timeout",
                })),
            )
        }
    };
    (
        status,
        [(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-cache, no-store, must-revalidate"),
        )],
        body,
    )
}
