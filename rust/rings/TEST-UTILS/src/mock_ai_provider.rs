use async_trait::async_trait;
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;

#[derive(Debug, Clone)]
pub struct MockAiProvider {
    pub name: &'static str,
    pub priority: u8,
    pub supported_types: Vec<MediaType>,
}

impl MockAiProvider {
    pub fn new(name: &'static str, priority: u8) -> Self {
        Self {
            name,
            priority,
            supported_types: vec![
                MediaType::Image,
                MediaType::Video,
                MediaType::Audio,
                MediaType::ImageToVideo,
                MediaType::TextToSpeech,
                MediaType::LipSync,
                MediaType::FaceSwap,
                MediaType::Morphing,
                MediaType::Upscale,
            ],
        }
    }

    pub fn image_only() -> Self {
        Self {
            supported_types: vec![MediaType::Image],
            ..Self::new("mock-image", 10)
        }
    }

    pub fn video_only() -> Self {
        Self {
            supported_types: vec![MediaType::Video],
            ..Self::new("mock-video", 20)
        }
    }
}

#[async_trait]
impl AiProvider for MockAiProvider {
    fn name(&self) -> &'static str {
        self.name
    }

    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        Ok(GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: request.telegram_id,
            media_type: request.media_type,
            status: GenerationStatus::Completed,
            result_url: Some("https://mock.example/result.png".to_string()),
            provider: Some(self.name.to_string()),
            error: None,
            created_at: chrono::Utc::now(),
        })
    }

    async fn check_status(&self, _generation_id: &str) -> Result<GenerationStatus, AppError> {
        Ok(GenerationStatus::Completed)
    }

    async fn get_result(&self, _generation_id: &str) -> Result<Option<String>, AppError> {
        Ok(Some("https://mock.example/result.png".to_string()))
    }

    async fn cancel(&self, _generation_id: &str) -> Result<(), AppError> {
        Ok(())
    }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        self.supported_types.contains(&media_type)
    }

    fn priority(&self) -> u8 {
        self.priority
    }
}
