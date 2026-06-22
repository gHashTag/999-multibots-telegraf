use std::sync::Arc;
use std::collections::HashMap;
use std::time::Duration;
use tokio::sync::RwLock;
use trios_mb_traits::{AiProvider, AiProviderOrchestrator};
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::truncate_for_log;
use crate::circuit_breaker::CircuitBreaker;

const FAILURE_THRESHOLD: u32 = 3;
const RESET_TIMEOUT_SECS: u64 = 60;

pub struct AiOrchestrator {
    providers: Vec<Arc<dyn AiProvider>>,
    circuit_breakers: Arc<RwLock<HashMap<String, CircuitBreaker>>>,
}

impl AiOrchestrator {
    pub fn new(providers: Vec<Arc<dyn AiProvider>>) -> Self {
        let mut breakers = HashMap::new();
        for p in &providers {
            breakers.insert(
                p.name().to_string(),
                CircuitBreaker::new(FAILURE_THRESHOLD, Duration::from_secs(RESET_TIMEOUT_SECS)),
            );
        }
        Self {
            providers,
            circuit_breakers: Arc::new(RwLock::new(breakers)),
        }
    }

    fn get_providers_for_type(&self, media_type: MediaType) -> Vec<&Arc<dyn AiProvider>> {
        let mut matching: Vec<_> = self.providers.iter()
            .filter(|p| p.supports_media_type(media_type))
            .collect();
        matching.sort_by_key(|p| p.priority());
        matching
    }

    #[tracing::instrument(skip_all)]
    async fn dispatch_inner(&self, request: &GenerationRequest,
    ) -> Result<GenerationResult, AppError> {
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
                    let err_msg = e.to_string();
                    let err_short = truncate_for_log(&err_msg, 256);
                    tracing::warn!(provider = provider.name(), error = %err_short, "provider failed");
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
}

#[async_trait::async_trait]
impl AiProviderOrchestrator for AiOrchestrator {
    #[tracing::instrument(skip_all)]
    async fn dispatch(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        match tokio::time::timeout(Duration::from_secs(120), self.dispatch_inner(request)).await {
            Ok(result) => result,
            Err(_) => {
                tracing::warn!(media_type = ?request.media_type, "Orchestrator dispatch timed out after 120s");
                Err(AppError::Ai(trios_mb_types::errors::AiError::AllProvidersFailed {
                    media_type: format!("{:?}", request.media_type),
                }))
            }
        }
    }

    #[tracing::instrument(skip_all)]
    async fn check_status(&self, generation_id: &str, provider_name: &str) -> Result<GenerationStatus, AppError> {
        let provider = self.providers.iter()
            .find(|p| p.name() == provider_name)
            .ok_or_else(|| AppError::NotFound(format!("provider {}", provider_name)))?;
        match tokio::time::timeout(Duration::from_secs(30), provider.check_status(generation_id)).await {
            Ok(result) => result,
            Err(_) => {
                tracing::warn!(provider = provider_name, generation_id, "check_status timed out after 30s");
                Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
                    provider: provider_name.to_string(),
                    message: "check_status timed out".to_string(),
                }))
            }
        }
    }

    #[tracing::instrument(skip_all)]
    async fn get_result(&self, generation_id: &str, provider_name: &str) -> Result<Option<String>, AppError> {
        let provider = self.providers.iter()
            .find(|p| p.name() == provider_name)
            .ok_or_else(|| AppError::NotFound(format!("provider {}", provider_name)))?;
        match tokio::time::timeout(Duration::from_secs(30), provider.get_result(generation_id)).await {
            Ok(result) => result,
            Err(_) => {
                tracing::warn!(provider = provider_name, generation_id, "get_result timed out after 30s");
                Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
                    provider: provider_name.to_string(),
                    message: "get_result timed out".to_string(),
                }))
            }
        }
    }
}
