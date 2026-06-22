use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use std::sync::Arc;
use tower::ServiceExt;
use trios_mb_server::create_router;
use trios_mb_test_utils::MockDatabase;
use trios_mb_traits::Database;
use serde_json::Value;

async fn make_db() -> Arc<dyn Database> {
    Arc::new(MockDatabase::new())
}

#[tokio::test]
async fn health_check_returns_200_with_ok() {
    let db = make_db().await;
    let app = create_router(db).expect("create_router should succeed in tests");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body();
    let bytes = body.collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["status"], "ok");
    assert_eq!(json["db"], "connected");
}

#[tokio::test]
async fn health_simple_returns_ok() {
    let db = make_db().await;
    let app = create_router(db).expect("create_router should succeed in tests");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health/simple")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = response.into_body();
    let bytes = body.collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(json["status"], "ok");
    assert!(json.get("version").is_some());
    assert!(json.get("timestamp").is_some());
}

#[tokio::test]
async fn health_check_includes_version() {
    let db = make_db().await;
    let app = create_router(db).expect("create_router should succeed in tests");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    let body = response.into_body();
    let bytes = body.collect().await.unwrap().to_bytes();
    let json: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(json.get("version").is_some());
}
