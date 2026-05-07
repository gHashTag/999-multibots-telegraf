use std::sync::Arc;
use trios_mb_ai::AiOrchestrator;
use trios_mb_test_utils::MockAiProvider;
use trios_mb_traits::{AiProvider, AiProviderOrchestrator};
use trios_mb_types::generation::*;
use trios_mb_types::AppError;

fn make_request(media_type: MediaType) -> GenerationRequest {
    GenerationRequest {
        telegram_id: 123456,
        media_type,
        prompt: Some("test prompt".to_string()),
        image_url: None,
        model: None,
        params: serde_json::json!({}),
    }
}

#[tokio::test]
async fn orchestrator_dispatches_to_single_provider() {
    let provider = MockAiProvider::new("mock-1", 10);
    let orchestrator = AiOrchestrator::new(vec![Arc::new(provider)]);

    let result = orchestrator.dispatch(&make_request(MediaType::Image)).await;
    assert!(result.is_ok());
    let r = result.unwrap();
    assert_eq!(r.media_type, MediaType::Image);
    assert_eq!(r.telegram_id, 123456);
    assert!(r.result_url.is_some());
    assert_eq!(r.provider.as_deref(), Some("mock-1"));
}

#[tokio::test]
async fn orchestrator_dispatches_to_highest_priority() {
    let low = MockAiProvider::new("low", 100);
    let high = MockAiProvider::new("high", 1);
    let orchestrator = AiOrchestrator::new(vec![Arc::new(low), Arc::new(high)]);

    let result = orchestrator.dispatch(&make_request(MediaType::Image)).await.unwrap();
    assert_eq!(result.provider.as_deref(), Some("high"));
}

#[tokio::test]
async fn orchestrator_fallback_on_failure() {
    let fail_provider = FailingProvider { name: "fail" };
    let ok_provider = MockAiProvider::new("ok", 20);
    let orchestrator = AiOrchestrator::new(vec![
        Arc::new(fail_provider),
        Arc::new(ok_provider),
    ]);

    let result = orchestrator.dispatch(&make_request(MediaType::Image)).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().provider.as_deref(), Some("ok"));
}

#[tokio::test]
async fn orchestrator_all_providers_fail() {
    let p1 = FailingProvider { name: "fail-1" };
    let p2 = FailingProvider { name: "fail-2" };
    let orchestrator = AiOrchestrator::new(vec![Arc::new(p1), Arc::new(p2)]);

    let result = orchestrator.dispatch(&make_request(MediaType::Image)).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn orchestrator_check_status() {
    let provider = MockAiProvider::new("mock", 10);
    let orchestrator = AiOrchestrator::new(vec![Arc::new(provider)]);

    let status = orchestrator.check_status("gen-123", "mock").await;
    assert!(status.is_ok());
    assert_eq!(status.unwrap(), GenerationStatus::Completed);
}

#[tokio::test]
async fn orchestrator_check_status_unknown_provider() {
    let provider = MockAiProvider::new("mock", 10);
    let orchestrator = AiOrchestrator::new(vec![Arc::new(provider)]);

    let status = orchestrator.check_status("gen-123", "unknown").await;
    assert!(status.is_err());
}

#[tokio::test]
async fn orchestrator_get_result() {
    let provider = MockAiProvider::new("mock", 10);
    let orchestrator = AiOrchestrator::new(vec![Arc::new(provider)]);

    let result = orchestrator.get_result("gen-123", "mock").await;
    assert!(result.is_ok());
    assert!(result.unwrap().is_some());
}

#[tokio::test]
async fn orchestrator_filters_by_media_type() {
    let image_only = MockAiProvider::image_only();
    let video_only = MockAiProvider::video_only();
    let orchestrator = AiOrchestrator::new(vec![
        Arc::new(image_only),
        Arc::new(video_only),
    ]);

    let video_result = orchestrator.dispatch(&make_request(MediaType::Video)).await;
    assert!(video_result.is_ok());
    assert_eq!(video_result.unwrap().provider.as_deref(), Some("mock-video"));

    let audio_result = orchestrator.dispatch(&make_request(MediaType::Audio)).await;
    assert!(audio_result.is_err());
}

#[tokio::test]
async fn orchestrator_no_providers() {
    let orchestrator = AiOrchestrator::new(vec![]);
    let result = orchestrator.dispatch(&make_request(MediaType::Image)).await;
    assert!(result.is_err());
}

struct FailingProvider {
    name: &'static str,
}

#[async_trait::async_trait]
impl AiProvider for FailingProvider {
    fn name(&self) -> &'static str { self.name }
    fn priority(&self) -> u8 { 10 }
    fn supports_media_type(&self, _media_type: MediaType) -> bool { true }

    async fn generate(&self, _request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: self.name.to_string(),
            message: "intentional failure".to_string(),
        }))
    }

    async fn check_status(&self, _id: &str) -> Result<GenerationStatus, AppError> {
        Ok(GenerationStatus::Failed)
    }

    async fn get_result(&self, _id: &str) -> Result<Option<String>, AppError> {
        Ok(None)
    }

    async fn cancel(&self, _id: &str) -> Result<(), AppError> {
        Ok(())
    }
}
