use std::sync::Arc;
use trios_mb_ai::services::*;
use trios_mb_test_utils::{MockDatabase, MockAiProvider};
use trios_mb_ai::AiOrchestrator;
use trios_mb_traits::{Database, AiProviderOrchestrator};
use trios_mb_types::generation::*;

async fn setup() -> (Arc<dyn Database>, Arc<dyn AiProviderOrchestrator>) {
    let db: Arc<dyn Database> = Arc::new(MockDatabase::new());
    db.create_user(123456, Some("testuser"), trios_mb_types::user::Language::En)
        .await
        .unwrap();
    db.add_balance(123456, 1000.0).await.unwrap();

    let provider = MockAiProvider::new("mock", 10);
    let orchestrator: Arc<dyn AiProviderOrchestrator> = Arc::new(
        AiOrchestrator::new(vec![Arc::new(provider)])
    );

    (db, orchestrator)
}

#[tokio::test]
async fn neuro_photo_service_generates() {
    let (db, orch) = setup().await;
    let service = NeuroPhotoService::new(db.clone(), orch, 10.0);

    let result = service.generate(
        123456,
        "a beautiful sunset",
        Some("flux-pro"),
        Some("https://example.com/photo.jpg"),
    ).await;

    assert!(result.is_ok());
    let r = result.unwrap();
    assert_eq!(r.media_type, MediaType::Image);
    assert!(r.result_url.is_some());

    let balance = db.get_balance(123456).await.unwrap();
    assert!(balance < 1000.0);
}

#[tokio::test]
async fn neuro_photo_service_insufficient_balance() {
    let (db, orch) = setup().await;
    let service = NeuroPhotoService::new(db.clone(), orch, 10000.0);

    let result = service.generate(123456, "test", None, None).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn text_to_image_service_generates() {
    let (db, orch) = setup().await;
    let service = TextToImageService::new(db.clone(), orch, 5.0);

    let result = service.generate(123456, "a cat wearing a hat", Some("flux-schnell")).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().media_type, MediaType::Image);
}

#[tokio::test]
async fn text_to_video_service_generates() {
    let (db, orch) = setup().await;
    let service = TextToVideoService::new(db.clone(), orch, 20.0);

    let result = service.generate(123456, "ocean waves", Some("wan-2.5"), Some("16:9"), Some(10.0)).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().media_type, MediaType::Video);
}

#[tokio::test]
async fn lip_sync_service_generates() {
    let (db, orch) = setup().await;
    let service = LipSyncService::new(db.clone(), orch, 15.0);

    let result = service.generate(
        123456,
        "https://example.com/video.mp4",
        "https://example.com/audio.mp3",
    ).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn face_swap_service_generates() {
    let (db, orch) = setup().await;
    let service = FaceSwapService::new(db.clone(), orch, 10.0);

    let result = service.generate(
        123456,
        "https://example.com/target.jpg",
        "https://example.com/source.jpg",
    ).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn tts_service_generates() {
    let (db, orch) = setup().await;
    let service = TextToSpeechService::new(db.clone(), orch, 3.0);

    let result = service.generate(123456, "Hello world", "voice-123").await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn upscaler_service_generates() {
    let (db, orch) = setup().await;
    let service = UpscalerService::new(db.clone(), orch, 5.0);

    let result = service.generate(
        123456,
        "https://example.com/small.jpg",
        Some(4),
    ).await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn generation_refunds_on_failure() {
    let (db, _orch) = setup().await;
    let fail_orch: Arc<dyn AiProviderOrchestrator> = Arc::new(
        AiOrchestrator::new(vec![Arc::new(FailingProvider)])
    );
    let service = NeuroPhotoService::new(db.clone(), fail_orch, 50.0);

    let balance_before = db.get_balance(123456).await.unwrap();
    let result = service.generate(123456, "test", None, None).await;
    assert!(result.is_err());

    let balance_after = db.get_balance(123456).await.unwrap();
    assert!((balance_before - balance_after).abs() < 0.01);
}

struct FailingProvider;

#[async_trait::async_trait]
impl trios_mb_traits::AiProvider for FailingProvider {
    fn name(&self) -> &'static str { "failing" }
    fn priority(&self) -> u8 { 10 }
    fn supports_media_type(&self, _: MediaType) -> bool { true }

    async fn generate(&self, _req: &GenerationRequest) -> Result<GenerationResult, trios_mb_types::AppError> {
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
