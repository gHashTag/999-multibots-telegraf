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

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .layer(cors)
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

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(crate::health::health_check_with_db))
        .route("/health/simple", get(crate::health::health_check))
        .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
        .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook))
        .route("/api/payment-success", post(crate::payment_webhooks::robokassa_callback))
        .layer(cors)
        .with_state(state)
}
