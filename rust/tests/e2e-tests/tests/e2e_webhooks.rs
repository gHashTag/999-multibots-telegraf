use axum::body::Body;
use axum::http::{Request, StatusCode, Method};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;
use trios_mb_server::create_router_with_payments;
use trios_mb_test_utils::MockDatabase;
use trios_mb_traits::{Database, PaymentGateway, PaymentInit, PaymentVerification};
use trios_mb_types::payment::PaymentMethod;
use trios_mb_types::AppError;
use serde_json::Value;

#[derive(Debug)]
struct MockPaymentGateway {
    should_verify: bool,
}

impl MockPaymentGateway {
    fn new(should_verify: bool) -> Self {
        Self { should_verify }
    }
}

#[async_trait::async_trait]
impl PaymentGateway for MockPaymentGateway {
    fn method(&self) -> PaymentMethod {
        PaymentMethod::Robokassa
    }

    async fn create_payment(
        &self,
        _telegram_id: i64,
        _amount: f64,
        _description: &str,
    ) -> Result<PaymentInit, AppError> {
        Ok(PaymentInit {
            id: uuid::Uuid::new_v4(),
            telegram_id: _telegram_id,
            amount: _amount,
            currency: "RUB".to_string(),
            external_id: Some("ext-123".to_string()),
            payment_url: Some("https://pay.example.com".to_string()),
        })
    }

    async fn verify_callback(
        &self,
        _params: &serde_json::Value,
    ) -> Result<PaymentVerification, AppError> {
        if self.should_verify {
            Ok(PaymentVerification {
                transaction_id: "00000000-0000-0000-0000-000000000001".to_string(),
                amount: 100.0,
                currency: "RUB".to_string(),
                status: trios_mb_types::payment::PaymentStatus::Completed,
                telegram_id: Some(12345),
            })
        } else {
            Err(AppError::Payment(trios_mb_types::errors::PaymentError::InvalidSignature))
        }
    }

    async fn refund(&self, _transaction_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    async fn get_payment_url(&self, _payment: &PaymentInit) -> Result<String, AppError> {
        Ok("https://pay.example.com".to_string())
    }
}

fn make_app(with_payment: bool) -> axum::Router {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    if with_payment {
        let gw: Arc<dyn PaymentGateway> = Arc::new(MockPaymentGateway::new(true));
        create_router_with_payments(db, gw).expect("router with payments")
    } else {
        create_router_with_payments(db, Arc::new(MockPaymentGateway::new(false)))
            .expect("router with payments")
    }
}

#[tokio::test]
async fn replicate_webhook_completed_returns_200() {
    let app = make_app(false);
    let payload = serde_json::json!({
        "id": "00000000-0000-0000-0000-000000000099",
        "status": "succeeded",
        "output": ["https://replicate.delivery/result.png"],
    });

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/webhooks/replicate")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body();
    let bytes = body.collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["status"], "ok");
}

#[tokio::test]
async fn replicate_webhook_failed_returns_200() {
    let app = make_app(false);
    let payload = serde_json::json!({
        "id": "00000000-0000-0000-0000-000000000099",
        "status": "failed",
        "error": "OOM",
    });

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/webhooks/replicate")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn replicate_webhook_invalid_json_returns_400() {
    let app = make_app(false);
    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/webhooks/replicate")
                .header("content-type", "application/json")
                .body(Body::from("not json"))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn kie_ai_webhook_completed_returns_200() {
    let app = make_app(false);
    let payload = serde_json::json!({
        "task_id": "00000000-0000-0000-0000-000000000088",
        "success_flag": 1,
        "video_url": "https://kie.ai/result.mp4",
    });

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/webhooks/kie-ai")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body();
    let bytes = body.collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["status"], "ok");
}

#[tokio::test]
async fn kie_ai_webhook_failed_returns_200() {
    let app = make_app(false);
    let payload = serde_json::json!({
        "task_id": "00000000-0000-0000-0000-000000000088",
        "success_flag": 2,
        "error_message": "timeout",
    });

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/webhooks/kie-ai")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn payment_callback_valid_returns_ok() {
    let app = make_app(true);
    let form = "out_sum=100.00&inv_id=12345&signature_value=ABC123";

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/payment-success")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(form))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body();
    let bytes = body.collect().await.unwrap().to_bytes();
    let text = String::from_utf8(bytes.to_vec()).unwrap();
    assert_eq!(text, "OK");
}

#[tokio::test]
async fn payment_callback_no_gateway_returns_error() {
    let app = make_app(false);
    let form = "out_sum=100.00&inv_id=12345&signature_value=ABC123";

    let response = app
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/payment-success")
                .header("content-type", "application/x-www-form-urlencoded")
                .body(Body::from(form))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body();
    let bytes = body.collect().await.unwrap().to_bytes();
    let text = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(text.contains("ERROR"));
}
