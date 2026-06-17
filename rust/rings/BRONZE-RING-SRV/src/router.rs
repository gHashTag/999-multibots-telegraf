use std::sync::Arc;
use axum::Router;
use axum::routing::{get, post};
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;
use tower_http::cors::CorsLayer;
use trios_mb_traits::{Database, PaymentGateway};

/// Build a per-IP rate-limit layer.
fn rate_limit_layer(per_second: u64, burst_size: u32) -> GovernorLayer<tower_governor::key_extractor::PeerIpKeyExtractor, governor::middleware::NoOpMiddleware> {
    let config = GovernorConfigBuilder::default()
        .per_second(per_second)
        .burst_size(burst_size)
        .finish()
        .expect("rate limit config is valid");
    GovernorLayer { config: Arc::new(config) }
}

pub struct AppState {
    pub db: Arc<dyn Database>,
    pub payment_gateway: Option<Arc<dyn PaymentGateway>>,
}

pub fn create_router(db: Arc<dyn Database>) -> Router {
    let state = Arc::new(AppState {
        db: db.clone(),
        payment_gateway: None,
    });

    // Wave 159: CORS hardened — deny all when FRONTEND_URL is unset or invalid
    let allowed_origins: Vec<String> = std::env::var("FRONTEND_URL")
        .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
        .unwrap_or_default();
    let cors = if allowed_origins.is_empty() {
        tracing::warn!("FRONTEND_URL not set; CORS requests denied");
        CorsLayer::new()
            .allow_methods([http::Method::GET, http::Method::POST])
            .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
    } else {
        let mut origins: Vec<http::HeaderValue> = Vec::new();
        for o in allowed_origins {
            match http::HeaderValue::from_str(&o) {
                Ok(hv) => origins.push(hv),
                Err(e) => tracing::warn!(origin = %o, error = %e, "Invalid CORS origin; skipping"),
            }
        }
        if origins.is_empty() {
            tracing::warn!("No valid CORS origins configured; CORS requests denied");
            CorsLayer::new()
                .allow_methods([http::Method::GET, http::Method::POST])
                .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
        } else {
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods([http::Method::GET, http::Method::POST])
                .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
        }
    };

    // Wave 158: per-IP rate limiting — 60 req/min burst, 30 req/s sustained
    let rate_limit = rate_limit_layer(1, 60);

    // Wave 151: limit request body size to 10MB for webhooks
    Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .layer(cors)
        .layer(rate_limit)
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

    // Wave 159: CORS hardened — deny all when FRONTEND_URL is unset or invalid
    let allowed_origins: Vec<String> = std::env::var("FRONTEND_URL")
        .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
        .unwrap_or_default();
    let cors = if allowed_origins.is_empty() {
        tracing::warn!("FRONTEND_URL not set; CORS requests denied");
        CorsLayer::new()
            .allow_methods([http::Method::GET, http::Method::POST])
            .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
    } else {
        let mut origins: Vec<http::HeaderValue> = Vec::new();
        for o in allowed_origins {
            match http::HeaderValue::from_str(&o) {
                Ok(hv) => origins.push(hv),
                Err(e) => tracing::warn!(origin = %o, error = %e, "Invalid CORS origin; skipping"),
            }
        }
        if origins.is_empty() {
            tracing::warn!("No valid CORS origins configured; CORS requests denied");
            CorsLayer::new()
                .allow_methods([http::Method::GET, http::Method::POST])
                .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
        } else {
            CorsLayer::new()
                .allow_origin(origins)
                .allow_methods([http::Method::GET, http::Method::POST])
                .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
        }
    };

    // Wave 158: per-IP rate limiting — 60 req/min burst, 1 req/s sustained
    let rate_limit = rate_limit_layer(1, 60);

    // Wave 151: limit request body size to 10MB for webhooks/payments
    Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .route("/api/payment-success", post(crate::payment_webhooks::robokassa_callback))
        .layer(cors)
        .layer(rate_limit)
        .layer(axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024))
        .with_state(state)
}
