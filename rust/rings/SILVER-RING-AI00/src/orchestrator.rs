use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::RwLock;
use trios_mb_traits::{AiProvider, AiProviderOrchestrator};
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use crate::circuit_breaker::CircuitBreaker;

pub struct AiOrchestrator {
    providers: Vec<Arc<dyn AiProvider>>,
    circuit_breakers: Arc<RwLock<HashMap<String, CircuitBreaker>>>,
}

impl AiOrchestrator {
    pub fn new(providers: Vec<Arc<dyn AiProvider>>) -> Self {
        Self {
            providers,
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    fn get_providers_for_type(&self, media_type: MediaType) -> Vec<&Arc<dyn AiProvider>> {
        let mut matching: Vec<_> = self.providers.iter()
            .filter(|p| p.supports_media_type(media_type))
            .collect();
        matching.sort_by_key(|p| p.priority());
        matching
    }
}

#[async_trait::async_trait]
impl AiProviderOrchestrator for AiOrchestrator {
    async fn dispatch(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let providers = self.get_providers_for_type(request.media_type);
        let breakers = self.circuit_breakers.read().await;

        let mut last_error = None;
        for provider in &providers {
            let breaker = breakers.get(provider.name());
            if let Some(b) = breaker {
                if !b.allow_request() {
                    tracing::warn!(provider = provider.name(), "circuit breaker open, skipping");
                    continue;
                }
            }

            match provider.generate(request).await {
                Ok(result) => {
                    if let Some(b) = breaker {
                        b.record_success();
                    }
                    return Ok(result);
                }
                Err(e) => {
                    tracing::warn!(provider = provider.name(), error = %e, "provider failed");
                    if let Some(b) = breaker {
                        b.record_failure();
                    }
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| AppError::Ai(trios_mb_types::errors::AiError::AllProvidersFailed {
            media_type: format!("{:?}", request.media_type),
        })))
    }

    async fn check_status(&self, generation_id: &str, provider_name: &str) -> Result<GenerationStatus, AppError> {
        let provider = self.providers.iter()
            .find(|p| p.name() == provider_name)
            .ok_or_else(|| AppError::NotFound(format!("provider {}", provider_name)))?;
        provider.check_status(generation_id).await
    }

    async fn get_result(&self, generation_id: &str, provider_name: &str) -> Result<Option<String>, AppError> {
        let provider = self.providers.iter()
            .find(|p| p.name() == provider_name)
            .ok_or_else(|| AppError::NotFound(format!("provider {}", provider_name)))?;
        provider.get_result(generation_id).await
    }
}
