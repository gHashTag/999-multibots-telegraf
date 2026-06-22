use std::sync::Arc;
use std::collections::HashMap;
use std::time::Duration;
use axum::Router;
use axum::routing::{get, post};
use axum::response::Response;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::timeout::TimeoutLayer;
use trios_mb_traits::{Database, PaymentGateway};
use secrecy::SecretString;

const ROUTER_TIMEOUT: Duration = Duration::from_secs(30);

// HSTS max-age values (seconds)
const HSTS_MAX_AGE_MAIN: u64 = 63072000; // 2 years
const HSTS_MAX_AGE_SANITIZED: u64 = 31536000; // 1 year

// Body limit values (bytes)
const WEBHOOK_BODY_LIMIT_BYTES: usize = 256 * 1024;
const GLOBAL_BODY_LIMIT_BYTES: usize = 2 * 1024 * 1024;

// Rate limit values
const HEALTH_RATE_PER_SECOND: u64 = 10;
const HEALTH_RATE_BURST: u32 = 20;
const WEBHOOK_RATE_PER_SECOND: u64 = 2;
const WEBHOOK_RATE_BURST: u32 = 30;
const PAYMENT_RATE_PER_SECOND: u64 = 1;
const PAYMENT_RATE_BURST: u32 = 10;

/// Build a per-IP rate-limit layer.
/// Returns `None` if the configuration is invalid (e.g., zero rates).
fn rate_limit_layer(per_second: u64, burst_size: u32) -> Option<GovernorLayer<tower_governor::key_extractor::PeerIpKeyExtractor, governor::middleware::NoOpMiddleware>> {
    let config = GovernorConfigBuilder::default()
        .per_second(per_second)
        .burst_size(burst_size)
        .finish()?;
    Some(GovernorLayer { config: Arc::new(config) })
}

pub struct AppState {
    pub db: Arc<dyn Database>,
    pub payment_gateway: Option<Arc<dyn PaymentGateway>>,
    /// Webhook secrets loaded at startup. Keys are env-var names; values are the secrets.
    /// Stored as SecretString so buffers are zeroised on drop and redacted in Debug.
    pub webhook_secrets: HashMap<String, SecretString>,
}

/// Load a webhook secret from an environment variable.
/// Returns SecretString so the buffer is zeroised on drop and redacted in Debug.
fn load_webhook_secret(env_var: &str) -> Option<SecretString> {
    match std::env::var(env_var) {
        Ok(v) if !v.is_empty() => Some(SecretString::new(v.into_boxed_str())),
        Ok(_) => {
            tracing::warn!(env_var, "Webhook secret is empty");
            None
        }
        Err(_) => {
            tracing::warn!(env_var, "Webhook secret env var not set");
            None
        }
    }
}

fn build_cors() -> CorsLayer {
    let allowed_origins: Vec<String> = match std::env::var("FRONTEND_URL") {
        Ok(s) => s.split(',').map(|o| o.trim().to_string()).collect(),
        Err(e) => {
            tracing::warn!(error = %e, "FRONTEND_URL not set; CORS requests denied");
            Vec::new()
        }
    };
    if allowed_origins.is_empty() {
        tracing::warn!("FRONTEND_URL yielded empty origin list; CORS requests denied");
        CorsLayer::new()
            .allow_origin(AllowOrigin::list(Vec::new()))
            .allow_methods([http::Method::GET, http::Method::POST])
            .allow_headers([http::header::CONTENT_TYPE, http::header::AUTHORIZATION])
    } else {
        let mut origins: Vec<http::HeaderValue> = Vec::new();
        for o in allowed_origins {
            if o.contains('*') {
                tracing::warn!(origin = %o, "CORS origin contains wildcard; skipping");
                continue;
            }
            if !(o.starts_with("http://") || o.starts_with("https://")) {
                tracing::warn!(origin = %o, "CORS origin missing scheme; skipping");
                continue;
            }
            match http::HeaderValue::from_str(&o) {
                Ok(hv) => origins.push(hv),
                Err(e) => tracing::warn!(origin = %o, error = %e, "Invalid CORS origin; skipping"),
            }
        }
        if origins.is_empty() {
            tracing::warn!("No valid CORS origins configured; CORS requests denied");
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(Vec::new()))
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

fn apply_rate_limit<S: Clone + Send + Sync + 'static>(router: Router<S>, per_second: u64, burst_size: u32) -> Result<Router<S>, String> {
    match rate_limit_layer(per_second, burst_size) {
        Some(layer) => Ok(router.layer(layer)),
        None => {
            let msg = format!(
                "Failed to build rate-limit layer (per_second={}, burst_size={}). \
                 Misconfigured rate limiting is a security risk.",
                per_second, burst_size
            );
            tracing::error!("{}", msg);
            Err(msg)
        }
    }
}

/// Middleware that injects security headers and replaces client-error bodies with
/// a generic message to prevent information disclosure (e.g., leaked field names
/// from JSON deserialization failures).
#[tracing::instrument(skip_all)]
async fn edge_hardening(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let mut response = next.run(req).await;
    let code = response.status();

    // Inject security headers
    let headers = response.headers_mut();
    headers.insert("X-Content-Type-Options", http::HeaderValue::from_static("nosniff"));
    headers.insert("X-Frame-Options", http::HeaderValue::from_static("DENY"));
    let hsts_value = format!("max-age={}; includeSubDomains", HSTS_MAX_AGE_MAIN);
    headers.insert("Strict-Transport-Security", http::HeaderValue::from_str(&hsts_value).unwrap_or_else(|_| http::HeaderValue::from_static("max-age=63072000; includeSubDomains")));
    headers.insert("Content-Security-Policy", http::HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'; base-uri 'none'"));
    headers.insert("Referrer-Policy", http::HeaderValue::from_static("strict-origin-when-cross-origin"));

    // Sanitize client-error and server-error bodies to prevent info disclosure
    if (code.is_client_error() || code.is_server_error()) && code != axum::http::StatusCode::TOO_MANY_REQUESTS {
        return build_sanitized_response(code);
    }

    response
}

/// Build a generic sanitized response without panicking.
fn build_sanitized_response(code: axum::http::StatusCode) -> Response {
    Response::builder()
        .status(code)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("X-Content-Type-Options", "nosniff")
        .header("X-Frame-Options", "DENY")
        .header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        .header("Referrer-Policy", "strict-origin-when-cross-origin")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Strict-Transport-Security", format!("max-age={}; includeSubDomains", HSTS_MAX_AGE_SANITIZED))
        .body(axum::body::Body::from("Bad Request"))
        .unwrap_or_else(|_| {
            // Fallback: builder should never fail with static headers, but
            // if it does, construct a minimal response manually.
            let mut resp = Response::new(axum::body::Body::from("Bad Request"));
            *resp.status_mut() = code;
            resp
        })
}

pub fn create_router(db: Arc<dyn Database>) -> Result<Router, String> {
    let mut secrets = HashMap::new();
    if let Some(s) = load_webhook_secret("REPLICATE_WEBHOOK_SECRET") {
        secrets.insert("REPLICATE_WEBHOOK_SECRET".to_string(), s);
    }
    if let Some(s) = load_webhook_secret("KIE_WEBHOOK_SECRET") {
        secrets.insert("KIE_WEBHOOK_SECRET".to_string(), s);
    }
    let state = Arc::new(AppState {
        db: db.clone(),
        payment_gateway: None,
        webhook_secrets: secrets,
    });

    let cors = build_cors();

    let health = apply_rate_limit(
        Router::new()
            .route("/health", get(crate::health::health_check_with_db))
            .route("/health/simple", get(crate::health::health_check))
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
        HEALTH_RATE_PER_SECOND, HEALTH_RATE_BURST,
    )?;

    let webhooks = apply_rate_limit(
        Router::new()
            .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
            .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook)),
        WEBHOOK_RATE_PER_SECOND, WEBHOOK_RATE_BURST,
    )?
    .layer(axum::extract::DefaultBodyLimit::max(WEBHOOK_BODY_LIMIT_BYTES));

    Ok(Router::new()
        .merge(health)
        .merge(webhooks)
        .layer(cors)
        .layer(axum::middleware::from_fn(edge_hardening))
        .layer(TimeoutLayer::new(ROUTER_TIMEOUT))
        .layer(axum::extract::DefaultBodyLimit::max(GLOBAL_BODY_LIMIT_BYTES))
        .with_state(state))
}

pub fn create_router_with_payments(
    db: Arc<dyn Database>,
    payment_gateway: Arc<dyn PaymentGateway>,
) -> Result<Router, String> {
    let mut secrets = HashMap::new();
    if let Some(s) = load_webhook_secret("REPLICATE_WEBHOOK_SECRET") {
        secrets.insert("REPLICATE_WEBHOOK_SECRET".to_string(), s);
    }
    if let Some(s) = load_webhook_secret("KIE_WEBHOOK_SECRET") {
        secrets.insert("KIE_WEBHOOK_SECRET".to_string(), s);
    }
    let state = Arc::new(AppState {
        db: db.clone(),
        payment_gateway: Some(payment_gateway),
        webhook_secrets: secrets,
    });

    let cors = build_cors();

    let health = apply_rate_limit(
        Router::new()
            .route("/health", get(crate::health::health_check_with_db))
            .route("/health/simple", get(crate::health::health_check))
            .layer(axum::extract::DefaultBodyLimit::max(4096)),
        HEALTH_RATE_PER_SECOND, HEALTH_RATE_BURST,
    )?;

    let webhooks = apply_rate_limit(
        Router::new()
            .route("/api/webhooks/replicate", post(crate::webhooks::replicate_webhook))
            .route("/api/webhooks/kie-ai", post(crate::webhooks::kie_ai_webhook)),
        WEBHOOK_RATE_PER_SECOND, WEBHOOK_RATE_BURST,
    )?
    .layer(axum::extract::DefaultBodyLimit::max(WEBHOOK_BODY_LIMIT_BYTES));

    let payments = apply_rate_limit(
        Router::new()
            .route("/api/payment-success", post(crate::payment_webhooks::robokassa_callback)),
        PAYMENT_RATE_PER_SECOND, PAYMENT_RATE_BURST,
    )?;

    Ok(Router::new()
        .merge(health)
        .merge(webhooks)
        .merge(payments)
        .layer(cors)
        .layer(axum::middleware::from_fn(edge_hardening))
        .layer(TimeoutLayer::new(ROUTER_TIMEOUT))
        .layer(axum::extract::DefaultBodyLimit::max(GLOBAL_BODY_LIMIT_BYTES))
        .with_state(state))
}
