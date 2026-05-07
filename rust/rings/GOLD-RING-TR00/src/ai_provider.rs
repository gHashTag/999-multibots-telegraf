use async_trait::async_trait;
use trios_mb_types::{generation::*, AppError};

#[async_trait]
pub trait AiProvider: Send + Sync {
    fn name(&self) -> &'static str;

    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError>;

    async fn check_status(&self, generation_id: &str) -> Result<GenerationStatus, AppError>;

    async fn get_result(&self, generation_id: &str) -> Result<Option<String>, AppError>;

    async fn cancel(&self, generation_id: &str) -> Result<(), AppError>;

    fn supports_media_type(&self, media_type: MediaType) -> bool;

    fn priority(&self) -> u8;
}

#[async_trait]
pub trait AiProviderOrchestrator: Send + Sync {
    async fn dispatch(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError>;

    async fn check_status(&self, generation_id: &str, provider_name: &str) -> Result<GenerationStatus, AppError>;

    async fn get_result(&self, generation_id: &str, provider_name: &str) -> Result<Option<String>, AppError>;
}
