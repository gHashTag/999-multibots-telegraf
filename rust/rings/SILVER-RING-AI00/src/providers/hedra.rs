use secrecy::ExposeSecret;
// Wave 151: api_key migrated to secrecy::SecretString
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

#[derive(Debug, Serialize)]
struct CreateAnimationRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    audio_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    video_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    voice_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HedronResponse {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    video_url: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    data: Option<HedraData>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HedraData {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    video_url: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

pub struct HedraProvider {
    api_key: secrecy::SecretString,
    http: reqwest::Client,
    base_url: String,
}

impl HedraProvider {
    pub fn new(api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none()).build()
            .map_err(|e| AppError::Internal(format!("Failed to build Hedra reqwest client: {}", e)))?;
        Ok(Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http,
            base_url: "https://api.hedra.com".to_string(),
        })
    }

    async fn create_animation(&self, request: &GenerationRequest) -> Result<HedronResponse, AppError> {
        let body = CreateAnimationRequest {
            audio_url: request.params.get("audio_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
            image_url: request.image_url.clone(),
            video_url: request.params.get("video_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
            text: request.prompt.clone(),
            voice_id: request.params.get("voice_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
        };

        let resp = self.http
            .post(format!("{}/v1/animations", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "hedra".into(),
                message: format!("create animation failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "hedra".into() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "hedra".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        super::check_json_body_size(&resp, "hedra", 64_000_000)?;
        resp.json::<HedronResponse>()
            .await
            .map_err(|e| AiError::InvalidResponse {
                provider: "hedra".into(),
                message: format!("json parse: {}", e),
            }.into())
    }

    async fn fetch_animation_status(&self, animation_id: &str) -> Result<HedronResponse, AppError> {
        let resp = self.http
            .get(format!("{}/v1/animations/{}", self.base_url, animation_id))
            .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "hedra".into(),
                message: format!("status check failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "hedra".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        super::check_json_body_size(&resp, "hedra", 64_000_000)?;
        resp.json::<HedronResponse>()
            .await
            .map_err(|e| AiError::InvalidResponse {
                provider: "hedra".into(),
                message: format!("json parse: {}", e),
            }.into())
    }

    fn extract_id(resp: &HedronResponse) -> Option<String> {
        resp.id.clone()
            .or_else(|| resp.data.as_ref().and_then(|d| d.id.clone()))
    }

    fn extract_url(resp: &HedronResponse) -> Option<String> {
        resp.video_url.clone()
            .or_else(|| resp.data.as_ref().and_then(|d| d.video_url.clone()))
            .or_else(|| resp.data.as_ref().and_then(|d| d.url.clone()))
    }
}

#[async_trait]
impl AiProvider for HedraProvider {
    fn name(&self) -> &'static str { "hedra" }
    fn priority(&self) -> u8 { 35 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::LipSync | MediaType::Video)
    }

    #[tracing::instrument(skip_all)]
    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let hedra_resp = self.create_animation(request).await?;

        let anim_id = Self::extract_id(&hedra_resp);
        let result_url = Self::extract_url(&hedra_resp);

        let gen_status = if result_url.is_some() {
            GenerationStatus::Completed
        } else if anim_id.is_some() {
            GenerationStatus::Processing
        } else {
            GenerationStatus::Failed
        };

        Ok(GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: request.telegram_id,
            media_type: request.media_type,
            status: gen_status,
            result_url,
            provider: anim_id.map(|id| format!("hedra:{}", id)),
            error: hedra_resp.error,
            created_at: chrono::Utc::now(),
        })
    }

    #[tracing::instrument(skip_all)]
    async fn check_status(&self, generation_id: &str) -> Result<GenerationStatus, AppError> {
        let anim_id = generation_id.strip_prefix("hedra:")
            .unwrap_or(generation_id);

        if anim_id.is_empty() {
            return Err(AppError::Validation("empty hedra animation id".into()));
        }

        let resp = self.fetch_animation_status(anim_id).await?;

        let status_str = resp.status.as_deref()
            .or_else(|| resp.data.as_ref().and_then(|d| d.status.as_deref()))
            .unwrap_or("processing");

        let status = match status_str {
            "completed" | "succeeded" | "done" => GenerationStatus::Completed,
            "failed" | "error" => GenerationStatus::Failed,
            "cancelled" | "canceled" => GenerationStatus::Cancelled,
            _ => GenerationStatus::Processing,
        };
        Ok(status)
    }

    #[tracing::instrument(skip_all)]
    async fn get_result(&self, generation_id: &str) -> Result<Option<String>, AppError> {
        let anim_id = generation_id.strip_prefix("hedra:")
            .unwrap_or(generation_id);

        if anim_id.is_empty() {
            return Err(AppError::Validation("empty hedra animation id".into()));
        }

        let resp = self.fetch_animation_status(anim_id).await?;
        Ok(Self::extract_url(&resp))
    }

    async fn cancel(&self, _generation_id: &str) -> Result<(), AppError> {
        Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: "hedra".into(),
            message: "Cancellation not supported by provider".into(),
        }))
    }
}
