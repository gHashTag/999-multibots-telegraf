use std::sync::LazyLock;
use secrecy::ExposeSecret;
// Wave 151: api_key migrated to secrecy::SecretString
use async_trait::async_trait;
use serde::Deserialize;
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

const PROVIDER_HTTP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const REQWEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);
const REQWEST_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const REQWEST_POOL_IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(90);

static FAL_NANO_BANANA_PRO_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_NANO_BANANA_PRO_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/nano-banana-pro".to_string())
});

static FAL_VEED_FABRIC_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_VEED_FABRIC_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/veed-fabric".to_string())
});

static FAL_WAN_25_T2V_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_WAN_25_T2V_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/wan/v2.5/text-to-video".to_string())
});

static FAL_WAN_25_I2V_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_WAN_25_I2V_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/wan/v2.5/image-to-video".to_string())
});

static FAL_LATENTSYNC_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_LATENTSYNC_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/latentsync".to_string())
});

static FAL_HUMMINGBIRD_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_HUMMINGBIRD_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/hummingbird".to_string())
});

static FAL_FLUX_SCHNELL_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_FLUX_SCHNELL_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/flux/schnell".to_string())
});

static FAL_FLUX_PRO_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_FLUX_PRO_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/flux".to_string())
});

static FAL_FLUX_DEV_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_FLUX_DEV_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/flux/dev".to_string())
});

static FAL_MINIMAX_VIDEO_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_MINIMAX_VIDEO_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/minimax/video-01-live".to_string())
});

static FAL_KLING_VIDEO_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("FAL_KLING_VIDEO_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "fal-ai/kling-video".to_string())
});

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct QueueResponse {
    request_id: String,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusResponse {
    status: String,
    #[serde(default)]
    response_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FalResultResponse {
    #[serde(default)]
    video_url: Option<String>,
    #[serde(default)]
    image_url: Option<String>,
    #[serde(default)]
    audio_url: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    images: Option<Vec<FalImage>>,
    #[serde(flatten)]
    extra: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FalImage {
    url: String,
}

pub struct FalProvider {
    api_key: secrecy::SecretString,
    http: reqwest::Client,
    base_url: String,
}

impl FalProvider {
    pub fn new(api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(REQWEST_TIMEOUT)
            .connect_timeout(REQWEST_CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(REQWEST_POOL_IDLE_TIMEOUT)
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build Fal reqwest client: {}", e)))?;
        Ok(Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http,
            base_url: "https://queue.fal.run".to_string(),
        })
    }

    fn resolve_model_id(&self, model: &str) -> Option<String> {
        match model {
            "nano-banana-pro" => Some(FAL_NANO_BANANA_PRO_MODEL.clone()),
            "veed-fabric" => Some(FAL_VEED_FABRIC_MODEL.clone()),
            "wan-2.5-t2v" => Some(FAL_WAN_25_T2V_MODEL.clone()),
            "wan-2.5-i2v" => Some(FAL_WAN_25_I2V_MODEL.clone()),
            "latentsync" => Some(FAL_LATENTSYNC_MODEL.clone()),
            "hummingbird" => Some(FAL_HUMMINGBIRD_MODEL.clone()),
            "flux-schnell" => Some(FAL_FLUX_SCHNELL_MODEL.clone()),
            "flux-pro" => Some(FAL_FLUX_PRO_MODEL.clone()),
            "flux-dev" => Some(FAL_FLUX_DEV_MODEL.clone()),
            "minimax-video" => Some(FAL_MINIMAX_VIDEO_MODEL.clone()),
            "kling-video" => Some(FAL_KLING_VIDEO_MODEL.clone()),
            other => Some(other.to_string()),
        }
    }

    fn build_image_payload(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut payload = serde_json::Map::new();
        if let Some(ref prompt) = request.prompt {
            payload.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(w) = request.params.get("width").and_then(|v| v.as_u64()) {
            payload.insert("image_width".to_string(), serde_json::Value::Number(w.into()));
        } else {
            payload.insert("image_width".to_string(), serde_json::Value::Number(768.into()));
        }
        if let Some(h) = request.params.get("height").and_then(|v| v.as_u64()) {
            payload.insert("image_height".to_string(), serde_json::Value::Number(h.into()));
        } else {
            payload.insert("image_height".to_string(), serde_json::Value::Number(1368.into()));
        }
        if let Some(n) = request.params.get("num_images").and_then(|v| v.as_u64()) {
            payload.insert("num_images".to_string(), serde_json::Value::Number(n.into()));
        }
        if let Some(ref ar) = request.params.get("aspect_ratio").and_then(|v| v.as_str()) {
            payload.insert("aspect_ratio".to_string(), serde_json::Value::String(ar.to_string()));
        }
        if let Some(ref image_url) = request.image_url {
            payload.insert("image_url".to_string(), serde_json::Value::String(image_url.clone()));
        }
        serde_json::Value::Object(payload)
    }

    fn build_video_payload(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut payload = serde_json::Map::new();
        if let Some(ref prompt) = request.prompt {
            payload.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(d) = request.params.get("duration").and_then(|v| v.as_f64()) {
            if d.is_finite() && d > 0.0 {
                payload.insert("duration".to_string(), serde_json::json!(d));
            }
        }
        if let Some(ref ar) = request.params.get("aspect_ratio").and_then(|v| v.as_str()) {
            payload.insert("aspect_ratio".to_string(), serde_json::Value::String(ar.to_string()));
        }
        if let Some(ref image_url) = request.image_url {
            payload.insert("image_url".to_string(), serde_json::Value::String(image_url.clone()));
        }
        serde_json::Value::Object(payload)
    }

    fn build_lipsync_payload(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut payload = serde_json::Map::new();
        if let Some(ref video_url) = request.image_url {
            payload.insert("video_url".to_string(), serde_json::Value::String(video_url.clone()));
        }
        if let Some(ref audio_url) = request.params.get("audio_url").and_then(|v| v.as_str()) {
            payload.insert("audio_url".to_string(), serde_json::Value::String(audio_url.to_string()));
        }
        serde_json::Value::Object(payload)
    }

    #[tracing::instrument(skip_all)]
    async fn queue_submission(&self, model_id: &str, payload: serde_json::Value) -> Result<QueueResponse, AppError> {
        let resp = match tokio::time::timeout(
            PROVIDER_HTTP_TIMEOUT,
            self.http
                .post(format!("{}/{}", self.base_url, model_id))
                .header("Authorization", format!("Key {}", self.api_key.expose_secret()))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send(),
        ).await {
            Ok(Ok(resp)) => resp,
            Ok(Err(e)) => {
                return Err(AiError::Provider {
                    provider: "fal".into(),
                    message: format!("queue request failed: {}", e),
                }.into());
            }
            Err(_) => {
                return Err(AiError::Provider {
                    provider: "fal".into(),
                    message: "queue request timed out".to_string(),
                }.into());
            }
        };

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "fal".into() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "fal".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let queue_resp: QueueResponse = super::parse_json_limited(resp, "fal", 64_000_000).await?;
        Ok(queue_resp)
    }

    #[tracing::instrument(skip_all)]
    async fn check_queue_status(&self, model_id: &str, request_id: &str) -> Result<StatusResponse, AppError> {
        let resp = match tokio::time::timeout(
            PROVIDER_HTTP_TIMEOUT,
            self.http
                .get(format!("{}/{}/requests/{}/status", self.base_url, model_id, request_id))
                .header("Authorization", format!("Key {}", self.api_key.expose_secret()))
                .send(),
        ).await {
            Ok(Ok(resp)) => resp,
            Ok(Err(e)) => {
                return Err(AiError::Provider {
                    provider: "fal".into(),
                    message: format!("status check failed: {}", e),
                }.into());
            }
            Err(_) => {
                return Err(AiError::Provider {
                    provider: "fal".into(),
                    message: "status check request timed out".to_string(),
                }.into());
            }
        };

        let status = resp.status();
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "fal".into(),
                message: format!("status HTTP {}: {}", status, text),
            }.into());
        }

        let status_resp: StatusResponse = super::parse_json_limited(resp, "fal", 64_000_000).await?;
        Ok(status_resp)
    }

    #[tracing::instrument(skip_all)]
    async fn fetch_result(&self, model_id: &str, request_id: &str) -> Result<FalResultResponse, AppError> {
        let resp = match tokio::time::timeout(
            PROVIDER_HTTP_TIMEOUT,
            self.http
                .get(format!("{}/{}/requests/{}", self.base_url, model_id, request_id))
                .header("Authorization", format!("Key {}", self.api_key.expose_secret()))
                .send(),
        ).await {
            Ok(Ok(resp)) => resp,
            Ok(Err(e)) => {
                return Err(AiError::Provider {
                    provider: "fal".into(),
                    message: format!("fetch result failed: {}", e),
                }.into());
            }
            Err(_) => {
                return Err(AiError::Provider {
                    provider: "fal".into(),
                    message: "fetch result request timed out".to_string(),
                }.into());
            }
        };

        let status = resp.status();
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "fal".into(),
                message: format!("result HTTP {}: {}", status, text),
            }.into());
        }

        let result: FalResultResponse = super::parse_json_limited(resp, "fal", 64_000_000).await?;
        Ok(result)
    }

    fn extract_url_from_result(result: &FalResultResponse) -> Option<String> {
        result.video_url.clone()
            .or_else(|| result.image_url.clone())
            .or_else(|| result.audio_url.clone())
            .or_else(|| result.url.clone())
            .or_else(|| result.images.as_ref().and_then(|imgs| imgs.first().map(|i| i.url.clone())))
    }
}

#[async_trait]
impl AiProvider for FalProvider {
    fn name(&self) -> &'static str { "fal" }
    fn priority(&self) -> u8 { 20 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::Image | MediaType::Video | MediaType::ImageToVideo | MediaType::LipSync)
    }

    #[tracing::instrument(skip_all)]
    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let prompt = request.prompt.as_deref().unwrap_or("").trim();
        if prompt.is_empty() {
            return Err(AppError::Validation("Empty prompt is not allowed".to_string()));
        }
        let model = request.model.as_deref().unwrap_or("nano-banana-pro");
        let model_id = self.resolve_model_id(model)
            .ok_or_else(|| AppError::Validation(format!("unknown fal model: {}", model)))?;

        let payload = match request.media_type {
            MediaType::Image => self.build_image_payload(request),
            MediaType::Video | MediaType::ImageToVideo => self.build_video_payload(request),
            MediaType::LipSync => self.build_lipsync_payload(request),
            _ => return Err(AiError::Provider {
                provider: "fal".into(),
                message: format!("unsupported media type: {:?}", request.media_type),
            }.into()),
        };

        let queue_resp = self.queue_submission(&model_id, payload).await?;

        Ok(GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: request.telegram_id,
            media_type: request.media_type,
            status: GenerationStatus::Processing,
            result_url: None,
            provider: Some(format!("fal:{}", queue_resp.request_id)),
            error: None,
            created_at: chrono::Utc::now(),
        })
    }

    #[tracing::instrument(skip_all)]
    async fn check_status(&self, generation_id: &str) -> Result<GenerationStatus, AppError> {
        let (model_id, request_id) = parse_fal_generation_id(generation_id)?;

        let status_resp = self.check_queue_status(&model_id, &request_id).await?;

        let status = match status_resp.status.as_str() {
            "COMPLETED" => GenerationStatus::Completed,
            "FAILED" => GenerationStatus::Failed,
            "IN_PROGRESS" | "IN_QUEUE" => GenerationStatus::Processing,
            _ => GenerationStatus::Processing,
        };
        Ok(status)
    }

    #[tracing::instrument(skip_all)]
    async fn get_result(&self, generation_id: &str) -> Result<Option<String>, AppError> {
        let (model_id, request_id) = parse_fal_generation_id(generation_id)?;

        let result = self.fetch_result(&model_id, &request_id).await?;
        Ok(Self::extract_url_from_result(&result))
    }

    async fn cancel(&self, _generation_id: &str) -> Result<(), AppError> {
        Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: "fal".into(),
            message: "Cancellation not supported by provider".into(),
        }))
    }
}

fn parse_fal_generation_id(generation_id: &str) -> Result<(String, String), AppError> {
    if let Some((model, rid)) = generation_id.split_once(':') {
        Ok((model.to_string(), rid.to_string()))
    } else {
        Err(AppError::Validation(format!("invalid fal generation id: {}", generation_id)))
    }
}
