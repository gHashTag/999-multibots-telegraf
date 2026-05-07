use trios_mb_traits::Database;
use trios_mb_types::generation::*;
use trios_mb_types::payment::*;
use trios_mb_types::user::*;
use trios_mb_test_utils::MockDatabase;

#[tokio::test]
async fn create_and_get_user() {
    let db = MockDatabase::new();

    let created = db.create_user(123, Some("testuser"), Language::En).await.unwrap();
    assert_eq!(created.telegram_id, 123);
    assert_eq!(created.username.as_deref(), Some("testuser"));
    assert_eq!(created.language, Language::En);

    let fetched = db.get_user_by_telegram_id(123).await.unwrap().unwrap();
    assert_eq!(fetched.telegram_id, created.telegram_id);
    assert_eq!(fetched.id, created.id);
}

#[tokio::test]
async fn get_nonexistent_user_returns_none() {
    let db = MockDatabase::new();

    let result = db.get_user_by_telegram_id(999).await.unwrap();
    assert!(result.is_none());
}

#[tokio::test]
async fn update_language() {
    let db = MockDatabase::new();

    db.create_user(100, None, Language::Ru).await.unwrap();
    db.update_user_language(100, Language::En).await.unwrap();

    let user = db.get_user_by_telegram_id(100).await.unwrap().unwrap();
    assert_eq!(user.language, Language::En);
}

#[tokio::test]
async fn update_language_nonexistent_user_fails() {
    let db = MockDatabase::new();

    let result = db.update_user_language(999, Language::En).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn deduct_balance_success() {
    let db = MockDatabase::new();

    db.create_user(200, None, Language::Ru).await.unwrap();
    db.add_balance(200, 100.0).await.unwrap();

    let deducted = db.deduct_balance(200, 30.0).await.unwrap();
    assert!(deducted);

    let balance = db.get_balance(200).await.unwrap();
    assert_eq!(balance, 70.0);
}

#[tokio::test]
async fn deduct_balance_insufficient_funds() {
    let db = MockDatabase::new();

    db.create_user(201, None, Language::Ru).await.unwrap();
    db.add_balance(201, 10.0).await.unwrap();

    let deducted = db.deduct_balance(201, 50.0).await.unwrap();
    assert!(!deducted);

    let balance = db.get_balance(201).await.unwrap();
    assert_eq!(balance, 10.0);
}

#[tokio::test]
async fn add_balance_accumulates() {
    let db = MockDatabase::new();

    db.create_user(202, None, Language::Ru).await.unwrap();
    db.add_balance(202, 50.0).await.unwrap();
    db.add_balance(202, 30.0).await.unwrap();

    let balance = db.get_balance(202).await.unwrap();
    assert_eq!(balance, 80.0);
}

#[tokio::test]
async fn create_and_get_transaction() {
    let db = MockDatabase::new();
    let now = chrono::Utc::now();
    let tx_id = uuid::Uuid::new_v4();

    let tx = Transaction {
        id: tx_id,
        telegram_id: 300,
        method: PaymentMethod::Robokassa,
        status: PaymentStatus::Pending,
        amount: 500.0,
        currency: "RUB".to_string(),
        external_id: Some("ext_123".to_string()),
        created_at: now,
        updated_at: now,
    };

    db.create_transaction(&tx).await.unwrap();

    let fetched = db.get_transaction(tx_id).await.unwrap().unwrap();
    assert_eq!(fetched.id, tx_id);
    assert_eq!(fetched.telegram_id, 300);
    assert_eq!(fetched.amount, 500.0);
    assert_eq!(fetched.status, PaymentStatus::Pending);
}

#[tokio::test]
async fn update_transaction_status() {
    let db = MockDatabase::new();
    let now = chrono::Utc::now();
    let tx_id = uuid::Uuid::new_v4();

    let tx = Transaction {
        id: tx_id,
        telegram_id: 301,
        method: PaymentMethod::TelegramStars,
        status: PaymentStatus::Pending,
        amount: 100.0,
        currency: "XTR".to_string(),
        external_id: None,
        created_at: now,
        updated_at: now,
    };

    db.create_transaction(&tx).await.unwrap();
    db.update_transaction_status(tx_id, PaymentStatus::Completed).await.unwrap();

    let fetched = db.get_transaction(tx_id).await.unwrap().unwrap();
    assert_eq!(fetched.status, PaymentStatus::Completed);
}

#[tokio::test]
async fn get_transactions_by_telegram_id_limits() {
    let db = MockDatabase::new();
    let now = chrono::Utc::now();

    for i in 0..5 {
        let tx = Transaction {
            id: uuid::Uuid::new_v4(),
            telegram_id: 400,
            method: PaymentMethod::Robokassa,
            status: PaymentStatus::Pending,
            amount: i as f64 * 10.0,
            currency: "RUB".to_string(),
            external_id: None,
            created_at: now,
            updated_at: now,
        };
        db.create_transaction(&tx).await.unwrap();
    }

    let txs = db.get_transactions_by_telegram_id(400, 3).await.unwrap();
    assert_eq!(txs.len(), 3);
}

#[tokio::test]
async fn create_generation() {
    let db = MockDatabase::new();

    let req = GenerationRequest {
        telegram_id: 500,
        media_type: MediaType::Image,
        prompt: Some("a beautiful sunset".to_string()),
        image_url: None,
        model: None,
        params: serde_json::json!({}),
    };

    let result = db.create_generation(&req).await.unwrap();
    assert_eq!(result.telegram_id, 500);
    assert_eq!(result.media_type, MediaType::Image);
    assert_eq!(result.status, GenerationStatus::Queued);

    let fetched = db.get_generation(result.id).await.unwrap().unwrap();
    assert_eq!(fetched.id, result.id);
}

#[tokio::test]
async fn update_generation_status() {
    let db = MockDatabase::new();

    let req = GenerationRequest {
        telegram_id: 501,
        media_type: MediaType::Video,
        prompt: None,
        image_url: None,
        model: None,
        params: serde_json::json!({}),
    };

    let gen = db.create_generation(&req).await.unwrap();
    db.update_generation_status(
        gen.id,
        GenerationStatus::Completed,
        Some("https://result.url/video.mp4"),
        None,
    )
    .await
    .unwrap();

    let fetched = db.get_generation(gen.id).await.unwrap().unwrap();
    assert_eq!(fetched.status, GenerationStatus::Completed);
    assert_eq!(fetched.result_url.as_deref(), Some("https://result.url/video.mp4"));
}

#[tokio::test]
async fn health_check() {
    let db = MockDatabase::new();
    let healthy = db.health_check().await.unwrap();
    assert!(healthy);
}
