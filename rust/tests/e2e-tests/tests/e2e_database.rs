use std::sync::Arc;
use trios_mb_test_utils::MockDatabase;
use trios_mb_traits::Database;
use trios_mb_types::user::Language;
use trios_mb_types::generation::*;
use trios_mb_types::payment::*;

#[tokio::test]
async fn db_create_user_and_find() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(111, Some("alice"), Language::En).await.unwrap();
    let user = db.get_user_by_telegram_id(111).await.unwrap().unwrap();
    assert_eq!(user.telegram_id, 111);
    assert_eq!(user.username.as_deref(), Some("alice"));
    assert_eq!(user.language, Language::En);
}

#[tokio::test]
async fn db_user_not_found() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    let result = db.get_user_by_telegram_id(999).await.unwrap();
    assert!(result.is_none());
}

#[tokio::test]
async fn db_balance_deduct_and_add() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(222, None, Language::Ru).await.unwrap();
    db.add_balance(222, 100.0).await.unwrap();

    assert_eq!(db.get_balance(222).await.unwrap(), 100.0);

    let deducted = db.deduct_balance(222, 30.0).await.unwrap();
    assert!(deducted);
    assert_eq!(db.get_balance(222).await.unwrap(), 70.0);

    db.add_balance(222, 50.0).await.unwrap();
    assert_eq!(db.get_balance(222).await.unwrap(), 120.0);
}

#[tokio::test]
async fn db_balance_deduct_insufficient() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(333, None, Language::En).await.unwrap();
    db.add_balance(333, 10.0).await.unwrap();

    let deducted = db.deduct_balance(333, 50.0).await.unwrap();
    assert!(!deducted);
    assert_eq!(db.get_balance(333).await.unwrap(), 10.0);
}

#[tokio::test]
async fn db_language_update() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(444, None, Language::En).await.unwrap();

    db.update_user_language(444, Language::Ru).await.unwrap();
    let user = db.get_user_by_telegram_id(444).await.unwrap().unwrap();
    assert_eq!(user.language, Language::Ru);
}

#[tokio::test]
async fn db_generation_lifecycle() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());

    let request = GenerationRequest {
        telegram_id: 555,
        media_type: MediaType::Image,
        prompt: Some("test".to_string()),
        image_url: None,
        model: None,
        params: serde_json::json!({}),
    };

    let gen = db.create_generation(&request).await.unwrap();
    assert_eq!(gen.status, GenerationStatus::Queued);
    assert!(gen.result_url.is_none());

    db.update_generation_status(
        gen.id,
        GenerationStatus::Processing,
        None,
        None,
    ).await.unwrap();

    db.update_generation_status(
        gen.id,
        GenerationStatus::Completed,
        Some("https://result.example/image.png"),
        None,
    ).await.unwrap();

    let updated = db.get_generation(gen.id).await.unwrap().unwrap();
    assert_eq!(updated.status, GenerationStatus::Completed);
    assert_eq!(updated.result_url.as_deref(), Some("https://result.example/image.png"));
}

#[tokio::test]
async fn db_generation_failed() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());

    let request = GenerationRequest {
        telegram_id: 666,
        media_type: MediaType::Video,
        prompt: Some("test".to_string()),
        image_url: None,
        model: None,
        params: serde_json::json!({}),
    };

    let gen = db.create_generation(&request).await.unwrap();

    db.update_generation_status(
        gen.id,
        GenerationStatus::Failed,
        None,
        Some("API error: timeout"),
    ).await.unwrap();

    let updated = db.get_generation(gen.id).await.unwrap().unwrap();
    assert_eq!(updated.status, GenerationStatus::Failed);
    assert_eq!(updated.error.as_deref(), Some("API error: timeout"));
}

#[tokio::test]
async fn db_transaction_lifecycle() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    let tx_id = uuid::Uuid::new_v4();

    let tx = Transaction {
        id: tx_id,
        telegram_id: 777,
        amount: 100.0,
        currency: "RUB".to_string(),
        method: PaymentMethod::Robokassa,
        status: PaymentStatus::Pending,
        external_id: Some("ext-123".to_string()),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    db.create_transaction(&tx).await.unwrap();
    let found = db.get_transaction(tx_id).await.unwrap().unwrap();
    assert_eq!(found.status, PaymentStatus::Pending);

    db.update_transaction_status(tx_id, PaymentStatus::Completed).await.unwrap();
    let updated = db.get_transaction(tx_id).await.unwrap().unwrap();
    assert_eq!(updated.status, PaymentStatus::Completed);
}

#[tokio::test]
async fn db_prompt_save_and_load() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());

    db.save_prompt(888, "beautiful sunset", Some("https://result.png")).await.unwrap();
    let prompt = db.get_prompt(888).await.unwrap();
    assert_eq!(prompt, Some("beautiful sunset".to_string()));
}

#[tokio::test]
async fn db_subscription_check() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(999, None, Language::En).await.unwrap();

    let sub = db.check_subscription(999).await.unwrap();
    assert!(sub.is_none());

    db.renew_subscription(999, trios_mb_types::user::SubscriptionType::NeuroPhoto).await.unwrap();
    let sub = db.check_subscription(999).await.unwrap();
    assert_eq!(sub, Some(trios_mb_types::user::SubscriptionType::NeuroPhoto));
}

#[tokio::test]
async fn db_health_check() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    assert!(db.health_check().await.unwrap());
}

#[tokio::test]
async fn db_get_referral_count() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    let count = db.get_referral_count(123).await.unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn db_generated_images_count() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    let count = db.get_generated_images_count(123).await.unwrap();
    assert_eq!(count, 0);

    db.increment_generated_images(123).await.unwrap();
    db.increment_generated_images(123).await.unwrap();
    let count = db.get_generated_images_count(123).await.unwrap();
    assert_eq!(count, 2);
}
