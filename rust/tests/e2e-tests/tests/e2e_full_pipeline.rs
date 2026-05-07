use std::sync::Arc;
use trios_mb_test_utils::MockDatabase;
use trios_mb_test_utils::MockJobQueue;
use trios_mb_ai::AiOrchestrator;
use trios_mb_test_utils::MockAiProvider;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_types::generation::*;
use trios_mb_traits::job_queue::EnqueueRequest;

#[tokio::test]
async fn end_to_end_enqueue_and_generate() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(100, Some("user"), trios_mb_types::user::Language::Ru).await.unwrap();
    db.add_balance(100, 500.0).await.unwrap();

    let provider = MockAiProvider::new("mock", 10);
    let orchestrator: Arc<dyn AiProviderOrchestrator> = Arc::new(
        AiOrchestrator::new(vec![Arc::new(provider)])
    );

    let job_queue: Arc<dyn JobQueue> = Arc::new(MockJobQueue::new());

    let request = GenerationRequest {
        telegram_id: 100,
        media_type: MediaType::Image,
        prompt: Some("beautiful landscape".to_string()),
        image_url: None,
        model: None,
        params: serde_json::json!({}),
    };

    let gen = db.create_generation(&request).await.unwrap();
    assert_eq!(gen.status, GenerationStatus::Queued);

    let enqueue_req = EnqueueRequest {
        job_type: "image_rendering".to_string(),
        payload: serde_json::to_value(&request).unwrap(),
        max_attempts: Some(3),
        delay_secs: None,
    };
    let job = job_queue.enqueue(enqueue_req).await.unwrap();
    assert_eq!(job.job_type, "image_rendering");

    let result = orchestrator.dispatch(&request).await.unwrap();
    assert_eq!(result.status, GenerationStatus::Completed);
    assert!(result.result_url.is_some());

    db.update_generation_status(
        gen.id,
        GenerationStatus::Completed,
        result.result_url.as_deref(),
        None,
    ).await.unwrap();

    let updated = db.get_generation(gen.id).await.unwrap().unwrap();
    assert_eq!(updated.status, GenerationStatus::Completed);
    assert!(updated.result_url.is_some());
}

#[tokio::test]
async fn end_to_end_video_generation() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(200, None, trios_mb_types::user::Language::En).await.unwrap();

    let provider = MockAiProvider::new("mock", 10);
    let orchestrator: Arc<dyn AiProviderOrchestrator> = Arc::new(
        AiOrchestrator::new(vec![Arc::new(provider)])
    );

    let request = GenerationRequest {
        telegram_id: 200,
        media_type: MediaType::Video,
        prompt: Some("ocean waves crashing".to_string()),
        image_url: None,
        model: Some("wan-2.5".to_string()),
        params: serde_json::json!({"duration": 10}),
    };

    let gen = db.create_generation(&request).await.unwrap();
    let result = orchestrator.dispatch(&request).await.unwrap();
    assert_eq!(result.media_type, MediaType::Video);

    db.update_generation_status(gen.id, GenerationStatus::Completed, result.result_url.as_deref(), None).await.unwrap();
    assert_eq!(db.get_generation(gen.id).await.unwrap().unwrap().status, GenerationStatus::Completed);
}

#[tokio::test]
async fn end_to_end_lipsync_generation() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(300, None, trios_mb_types::user::Language::Ru).await.unwrap();

    let provider = MockAiProvider::new("mock", 10);
    let orchestrator: Arc<dyn AiProviderOrchestrator> = Arc::new(
        AiOrchestrator::new(vec![Arc::new(provider)])
    );

    let request = GenerationRequest {
        telegram_id: 300,
        media_type: MediaType::LipSync,
        prompt: Some("lip sync audio to video".to_string()),
        image_url: Some("https://example.com/video.mp4".to_string()),
        model: None,
        params: serde_json::json!({"audio_url": "https://example.com/audio.mp3"}),
    };

    let result = orchestrator.dispatch(&request).await.unwrap();
    assert_eq!(result.media_type, MediaType::LipSync);
}

#[tokio::test]
async fn end_to_end_faceswap_generation() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(400, None, trios_mb_types::user::Language::En).await.unwrap();
    db.add_balance(400, 100.0).await.unwrap();

    let provider = MockAiProvider::new("mock", 10);
    let orchestrator: Arc<dyn AiProviderOrchestrator> = Arc::new(
        AiOrchestrator::new(vec![Arc::new(provider)])
    );

    let service = trios_mb_ai::FaceSwapService::new(db.clone(), orchestrator.clone(), 10.0);
    let result = service.generate(
        400,
        "https://example.com/target.jpg",
        "https://example.com/source.jpg",
    ).await.unwrap();

    assert_eq!(result.media_type, MediaType::FaceSwap);
    assert!(result.result_url.is_some());

    let balance = db.get_balance(400).await.unwrap();
    assert!(balance < 100.0);
}

#[tokio::test]
async fn end_to_end_payment_flow() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(500, None, trios_mb_types::user::Language::En).await.unwrap();

    let initial_balance = db.get_balance(500).await.unwrap();
    assert_eq!(initial_balance, 0.0);

    db.add_balance(500, 250.0).await.unwrap();
    assert_eq!(db.get_balance(500).await.unwrap(), 250.0);

    let tx_id = uuid::Uuid::new_v4();
    let tx = trios_mb_types::payment::Transaction {
        id: tx_id,
        telegram_id: 500,
        amount: 250.0,
        currency: "RUB".to_string(),
        method: trios_mb_types::payment::PaymentMethod::Robokassa,
        status: trios_mb_types::payment::PaymentStatus::Pending,
        external_id: Some("robokassa-123".to_string()),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    db.create_transaction(&tx).await.unwrap();
    db.update_transaction_status(tx_id, trios_mb_types::payment::PaymentStatus::Completed).await.unwrap();

    let found = db.get_transaction(tx_id).await.unwrap().unwrap();
    assert_eq!(found.status, trios_mb_types::payment::PaymentStatus::Completed);
}

#[tokio::test]
async fn end_to_end_multi_provider_failover() {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(600, None, trios_mb_types::user::Language::En).await.unwrap();
    db.add_balance(600, 100.0).await.unwrap();

    let fail = FailingProvider;
    let ok = MockAiProvider::new("ok-provider", 20);
    let orchestrator: Arc<dyn AiProviderOrchestrator> = Arc::new(
        AiOrchestrator::new(vec![Arc::new(fail), Arc::new(ok)])
    );

    let service = trios_mb_ai::NeuroPhotoService::new(db.clone(), orchestrator, 10.0);
    let result = service.generate(600, "test", None, None).await.unwrap();

    assert_eq!(result.provider.as_deref(), Some("ok-provider"));
    let balance = db.get_balance(600).await.unwrap();
    assert!(balance < 100.0);
}

struct FailingProvider;

#[async_trait::async_trait]
impl trios_mb_traits::AiProvider for FailingProvider {
    fn name(&self) -> &'static str { "failing" }
    fn priority(&self) -> u8 { 1 }
    fn supports_media_type(&self, _: MediaType) -> bool { true }

    async fn generate(&self, _: &GenerationRequest) -> Result<GenerationResult, trios_mb_types::AppError> {
        Err(trios_mb_types::AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: "failing".to_string(),
            message: "always fails".to_string(),
        }))
    }

    async fn check_status(&self, _: &str) -> Result<GenerationStatus, trios_mb_types::AppError> {
        Ok(GenerationStatus::Failed)
    }
    async fn get_result(&self, _: &str) -> Result<Option<String>, trios_mb_types::AppError> { Ok(None) }
    async fn cancel(&self, _: &str) -> Result<(), trios_mb_types::AppError> { Ok(()) }
}
