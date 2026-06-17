use std::sync::Arc;
use axum::Router;
use axum::routing::{get, post};
use tower_http::cors::{Any, CorsLayer};
use trios_mb_traits::{Database, PaymentGateway};

pub struct AppState {
    pub db: Arc<dyn Database>,
    pub payment_gateway: Option<Arc<dyn PaymentGateway>>,
}

pub fn create_router(db: Arc<dyn Database>) -> Router {
    let state = Arc::new(AppState {
        db: db.clone(),
        payment_gateway: None,
    });

    // Wave 151: CORS hardened — read FRONTEND_URL env var for allowed origins
    let allowed_origins: Vec<String> = std::env::var("FRONTEND_URL")
        .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
        .unwrap_or_default();
    let cors = if allowed_origins.is_empty() {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([http::Method::GET, http::Method::POST])
            .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
    } else {
        let origins: Vec<http::HeaderValue> = allowed_origins
            .into_iter()
            .map(|o| http::HeaderValue::from_str(&o).unwrap_or(http::HeaderValue::from_static("*")))
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([http::Method::GET, http::Method::POST])
            .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
    };

    // Wave 151: limit request body size to 10MB for webhooks
    Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .layer(cors)
        .layer(axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024))
        .with_state(state)
}

pub fn create_router_with_payments(
    db: Arc<dyn Database>,
    payment_gateway: Arc<dyn PaymentGateway>,
) -> Router {
    let state = Arc::new(AppState {
        db: db.clone(),
        payment_gateway: Some(payment_gateway),
    });

    // Wave 151: CORS hardened — read FRONTEND_URL env var for allowed origins
    let allowed_origins: Vec<String> = std::env::var("FRONTEND_URL")
        .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
        .unwrap_or_default();
    let cors = if allowed_origins.is_empty() {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([http::Method::GET, http::Method::POST])
            .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
    } else {
        let origins: Vec<http::HeaderValue> = allowed_origins
            .into_iter()
            .map(|o| http::HeaderValue::from_str(&o).unwrap_or(http::HeaderValue::from_static("*")))
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods([http::Method::GET, http::Method::POST])
            .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
    };

    // Wave 151: limit request body size to 10MB for webhooks/payments
    Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .route("/api/payment-success", post(crate::payment_webhooks::robokassa_callback))
        .layer(cors)
        .layer(axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024))
        .with_state(state)
}
