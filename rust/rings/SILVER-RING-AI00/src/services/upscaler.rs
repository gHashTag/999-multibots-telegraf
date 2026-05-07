use std::sync::Arc;
use trios_mb_traits::{AiProviderOrchestrator, Database};
use trios_mb_types::generation::*;
use trios_mb_types::AppError;

pub struct UpscalerService {
    db: Arc<dyn Database>,
    orchestrator: Arc<dyn AiProviderOrchestrator>,
    cost: f64,
}

impl UpscalerService {
    pub fn new(db: Arc<dyn Database>, orchestrator: Arc<dyn AiProviderOrchestrator>, cost: f64) -> Self {
        Self { db, orchestrator, cost }
    }

    pub async fn generate(
        &self,
        telegram_id: i64,
        image_url: &str,
        scale: Option<u32>,
    ) -> Result<GenerationResult, AppError> {
        let deducted = self.db.deduct_balance(telegram_id, self.cost).await?;
        if !deducted {
            return Err(AppError::Payment(trios_mb_types::errors::PaymentError::InsufficientBalance {
                required: self.cost,
                current: self.db.get_balance(telegram_id).await?,
            }));
        }

        let request = GenerationRequest {
            telegram_id,
            media_type: MediaType::Upscale,
            prompt: None,
            image_url: Some(image_url.to_string()),
            model: None,
            params: serde_json::json!({
                "scale": scale.unwrap_or(2),
            }),
        };

        let gen = self.db.create_generation(&request).await?;

        match self.orchestrator.dispatch(&request).await {
            Ok(result) => {
                self.db.update_generation_status(
                    gen.id,
                    GenerationStatus::Completed,
                    result.result_url.as_deref(),
                    None,
                ).await?;
                Ok(result)
            }
            Err(e) => {
                self.db.add_balance(telegram_id, self.cost).await?;
                self.db.update_generation_status(
                    gen.id,
                    GenerationStatus::Failed,
                    None,
                    Some(&e.to_string()),
                ).await?;
                Err(e)
            }
        }
    }
}
