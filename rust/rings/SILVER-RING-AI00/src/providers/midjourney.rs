// Wave 151: api_key migrated to secrecy::SecretString
use async_trait::async_trait;
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

pub struct MidjourneyProvider {
    http: reqwest::Client,
}

impl MidjourneyProvider {
    pub fn new(_api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none()).build()
            .map_err(|e| AppError::Internal(format!("Failed to build Midjourney reqwest client: {}", e)))?;
        Ok(Self {
            http,
        })
    }
}

#[async_trait]
impl AiProvider for MidjourneyProvider {
    fn name(&self) -> &'static str { "midjourney" }
    fn priority(&self) -> u8 { 50 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::Image)
    }

    #[tracing::instrument(skip_all)]
    async fn generate(&self, _request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        Err(AiError::Provider {
            provider: "midjourney".into(),
            message: "Midjourney requires Discord integration. Use Replicate FLUX proxy instead.".into(),
        }.into())
    }

    #[tracing::instrument(skip_all)]
    async fn check_status(&self, _generation_id: &str) -> Result<GenerationStatus, AppError> {
        Ok(GenerationStatus::Failed)
    }

    #[tracing::instrument(skip_all)]
    async fn get_result(&self, _generation_id: &str) -> Result<Option<String>, AppError> {
        Ok(None)
    }

    async fn cancel(&self, _generation_id: &str) -> Result<(), AppError> {
        Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: "midjourney".into(),
            message: "Cancellation not supported by provider".into(),
        }))
    }
}
