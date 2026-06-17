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

fn build_cors() -> CorsLayer {
    let allowed_origins: Vec<String> = std::env::var("FRONTEND_URL")
        .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
        .unwrap_or_default();
    if allowed_origins.is_empty() {
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
    }
}

pub fn create_router(db: Arc<dyn Database>) -> Router {
    let state = Arc::new(AppState {
        db: db.clone(),
        payment_gateway: None,
    });

    let cors = build_cors();

    let health = Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .layer(rate_limit_layer(10, 20));

    let webhooks = Router::new()
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .layer(rate_limit_layer(2, 30));

    Router::new()
        .merge(health)
        .merge(webhooks)
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

    let cors = build_cors();

    let health = Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .layer(rate_limit_layer(10, 20));

    let webhooks = Router::new()
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .layer(rate_limit_layer(2, 30));

    let payments = Router::new()
        .route("/api/payment-success", post(crate::payment_webhooks::robokassa_callback))
        .layer(rate_limit_layer(1, 10));

    Router::new()
        .merge(health)
        .merge(webhooks)
        .merge(payments)
        .layer(cors)
        .layer(axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024))
        .with_state(state)
}
