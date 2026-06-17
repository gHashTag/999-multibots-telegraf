use secrecy::ExposeSecret;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

#[derive(Debug, Serialize)]
struct PredictionInput {
    #[serde(flatten)]
    fields: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct CreatePredictionRequest {
    version: Option<String>,
    input: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    webhook: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PredictionResponse {
    id: String,
    status: String,
    output: Option<serde_json::Value>,
    error: Option<String>,
    urls: Option<PredictionUrls>,
}

#[derive(Debug, Deserialize)]
struct PredictionUrls {
    get: String,
    cancel: String,
}

// Wave 151: api_key migrated to secrecy::SecretString
pub struct ReplicateProvider {
    api_key: secrecy::SecretString,
    http: reqwest::Client,
    base_url: String,
    webhook_url: Option<String>,
}

impl ReplicateProvider {
    pub fn new(api_key: &str) -> Self {
        Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .connect_timeout(std::time::Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none()).build()
                .expect("Failed to build Replicate reqwest client"),
            base_url: "https://api.replicate.com".to_string(),
            webhook_url: None,
        }
    }

    pub fn with_webhook(mut self, url: &str) -> Self {
        self.webhook_url = Some(url.to_string());
        self
    }

    fn resolve_model_version(&self, model: &str) -> Option<String> {
        match model {
            "flux" => Some("black-forest-labs/flux-1.1-pro-ultra".to_string()),
            "sdxl" => Some("stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc".to_string()),
            "sd3" => Some("stability-ai/stable-diffusion-3.5-large-turbo".to_string()),
            "recraft" => Some("recraft-ai/recraft-v3".to_string()),
            "photon" => Some("luma/photon".to_string()),
            "haiper" => Some("haiper-ai/haiper-video-2".to_string()),
            "minimax" => Some("minimax/video-01".to_string()),
            "kling-lip-sync" => Some("kwaivgi/kling-lip-sync".to_string()),
            "face-swap" => Some("lucataco/faceswap".to_string()),
            _ => None,
        }
    }

    fn build_image_input(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut input = serde_json::Map::new();
        if let Some(ref prompt) = request.prompt {
            input.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(aspect_ratio) = request.params.get("aspect_ratio").and_then(|v| v.as_str()) {
            let (w, h) = match aspect_ratio {
                "1:1" => (1024, 1024),
                "16:9" => (1368, 768),
                "9:16" => (768, 1368),
                _ => (1368, 1024),
            };
            input.insert("width".to_string(), serde_json::Value::Number(w.into()));
            input.insert("height".to_string(), serde_json::Value::Number(h.into()));
            input.insert("aspect_ratio".to_string(), serde_json::Value::String(aspect_ratio.to_string()));
        }
        if let Some(ref image_url) = request.image_url {
            input.insert("image_url".to_string(), serde_json::Value::String(image_url.clone()));
        }
        if let Some(negative) = request.params.get("negative_prompt").and_then(|v| v.as_str()) {
            input.insert("negative_prompt".to_string(), serde_json::Value::String(negative.to_string()));
        }
        serde_json::Value::Object(input)
    }

    fn build_video_input(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut input = serde_json::Map::new();
        if let Some(ref prompt) = request.prompt {
            input.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(duration) = request.params.get("duration").and_then(|v| v.as_f64()) {
            input.insert("duration".to_string(), serde_json::Value::Number((duration as i64).into()));
        }
        if let Some(ref ar) = request.params.get("aspect_ratio").and_then(|v| v.as_str()) {
            input.insert("aspect_ratio".to_string(), serde_json::Value::String(ar.to_string()));
        }
        if let Some(ref image_url) = request.image_url {
            input.insert("image_url".to_string(), serde_json::Value::String(image_url.clone()));
        }
        if let Some(ref model) = request.model {
            if model == "haiper" {
                input.insert("use_prompt_enhancer".to_string(), serde_json::Value::Bool(true));
            } else if model == "minimax" {
                input.insert("prompt_optimizer".to_string(), serde_json::Value::Bool(true));
            }
        }
        serde_json::Value::Object(input)
    }

    fn build_lipsync_input(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut input = serde_json::Map::new();
        if let Some(ref video_url) = request.image_url {
            input.insert("video_url".to_string(), serde_json::Value::String(video_url.clone()));
        }
        if let Some(ref audio_url) = request.params.get("audio_url").and_then(|v| v.as_str()) {
            input.insert("audio_url".to_string(), serde_json::Value::String(audio_url.to_string()));
        }
        serde_json::Value::Object(input)
    }

    fn build_faceswap_input(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut input = serde_json::Map::new();
        if let Some(ref target) = request.image_url {
            input.insert("target_image_url".to_string(), serde_json::Value::String(target.clone()));
        }
        if let Some(ref swap) = request.params.get("swap_image_url").and_then(|v| v.as_str()) {
            input.insert("swap_image_url".to_string(), serde_json::Value::String(swap.to_string()));
        }
        serde_json::Value::Object(input)
    }

    async fn create_prediction(&self, model: &str, input: serde_json::Value) -> Result<PredictionResponse, AppError> {
        let version = self.resolve_model_version(model)
            .ok_or_else(|| AppError::Validation(format!("unknown model: {}", model)))?;

        let body = CreatePredictionRequest {
            version: Some(version),
            input,
            webhook: self.webhook_url.clone(),
        };

        let resp = self.http
            .post(format!("{}/v1/predictions", self.base_url))
            .header("Authorization", format!("Token {}", self.api_key.expose_secret()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "replicate".into(),
                message: format!("request failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "replicate".into() }.into());
        }
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read replicate error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "replicate".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        resp.json::<PredictionResponse>()
            .await
            .map_err(|e| AiError::InvalidResponse {
                provider: "replicate".into(),
                message: format!("json parse: {}", e),
            }.into())
    }

    async fn fetch_prediction(&self, prediction_id: &str) -> Result<PredictionResponse, AppError> {
        let resp = self.http
            .get(format!("{}/v1/predictions/{}", self.base_url, prediction_id))
            .header("Authorization", format!("Token {}", self.api_key.expose_secret()))
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "replicate".into(),
                message: format!("status check failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "replicate".into() }.into());
        }
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read replicate error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "replicate".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        resp.json::<PredictionResponse>()
            .await
            .map_err(|e| AiError::InvalidResponse {
                provider: "replicate".into(),
                message: format!("json parse: {}", e),
            }.into())
    }

    fn extract_output_url(output: &Option<serde_json::Value>) -> Option<String> {
        match output {
            Some(serde_json::Value::String(s)) => Some(s.clone()),
            Some(serde_json::Value::Array(arr)) => arr.first().and_then(|v| v.as_str()).map(|s| s.to_string()),
            Some(serde_json::Value::Object(map)) => {
                map.get("video_url").or(map.get("image_url"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| map.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()))
            }
            _ => None,
        }
    }
}

#[async_trait]
impl AiProvider for ReplicateProvider {
    fn name(&self) -> &'static str { "replicate" }
    fn priority(&self) -> u8 { 10 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::Image | MediaType::Video | MediaType::ImageToVideo | MediaType::LipSync | MediaType::FaceSwap)
    }

    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let model = request.model.as_deref().unwrap_or("flux");
        let input = match request.media_type {
            MediaType::Image => self.build_image_input(request),
            MediaType::Video | MediaType::ImageToVideo => self.build_video_input(request),
            MediaType::LipSync => self.build_lipsync_input(request),
            MediaType::FaceSwap => self.build_faceswap_input(request),
            _ => return Err(AiError::Provider {
                provider: "replicate".into(),
                message: format!("unsupported media type: {:?}", request.media_type),
            }.into()),
        };

        let prediction = self.create_prediction(model, input).await?;

        let gen_status = match prediction.status.as_str() {
            "succeeded" => GenerationStatus::Completed,
            "failed" | "canceled" => GenerationStatus::Failed,
            _ => GenerationStatus::Processing,
        };

        let result_url = Self::extract_output_url(&prediction.output);

        Ok(GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: request.telegram_id,
            media_type: request.media_type,
            status: gen_status,
            result_url,
            provider: Some(format!("replicate:{}", prediction.id)),
            error: prediction.error,
            created_at: chrono::Utc::now(),
        })
    }

    async fn check_status(&self, generation_id: &str) -> Result<GenerationStatus, AppError> {
        let prediction = self.fetch_prediction(generation_id).await?;
        let status = match prediction.status.as_str() {
            "starting" | "processing" => GenerationStatus::Processing,
            "succeeded" => GenerationStatus::Completed,
            "failed" | "canceled" => GenerationStatus::Failed,
            _ => GenerationStatus::Processing,
        };
        Ok(status)
    }

    async fn get_result(&self, generation_id: &str) -> Result<Option<String>, AppError> {
        let prediction = self.fetch_prediction(generation_id).await?;
        Ok(Self::extract_output_url(&prediction.output))
    }

    async fn cancel(&self, generation_id: &str) -> Result<(), AppError> {
        let resp = self.http
            .post(format!("{}/v1/predictions/{}/cancel", self.base_url, generation_id))
            .header("Authorization", format!("Token {}", self.api_key.expose_secret()))
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "replicate".into(),
                message: format!("cancel failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read replicate cancel error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "replicate".into(),
                message: format!("cancel HTTP {}: {}", status, text),
            }.into());
        }
        Ok(())
    }
}
