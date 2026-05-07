use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde_json::json;
use std::sync::Arc;
use crate::AppState;

pub async fn health_check() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

pub async fn health_check_with_db(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> impl IntoResponse {
    match state.db.health_check().await {
        Ok(true) => (
            StatusCode::OK,
            Json(json!({
                "status": "ok",
                "db": "connected",
                "version": env!("CARGO_PKG_VERSION"),
            })),
        ),
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "status": "degraded",
                "db": "disconnected",
            })),
        ),
    }
}
