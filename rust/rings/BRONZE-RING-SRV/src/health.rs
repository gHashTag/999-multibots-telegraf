use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde_json::json;
use std::sync::Arc;
use crate::AppState;

#[tracing::instrument]
pub async fn health_check() -> impl IntoResponse {
    (
        [(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static("no-cache, no-store, must-revalidate"),
        )],
        Json(json!({
            "status": "ok",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    )
}

#[tracing::instrument(skip(state))]
pub async fn health_check_with_db(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> impl IntoResponse {
    let (status, body) = match state.db.health_check().await {
        Ok(true) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "db": "connected",
            })),
        ),
        Ok(false) => {
            tracing::warn!("DB health check returned false; service degraded");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "degraded",
                    "db": "unhealthy",
                })),
            )
        }
        Err(e) => {
            tracing::error!(error = %e, "DB health check failed");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "status": "degraded",
                    "db": "disconnected",
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
