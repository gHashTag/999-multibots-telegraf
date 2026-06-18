use secrecy::ExposeSecret;
// Wave 151: api_key migrated to secrecy::SecretString
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

#[derive(Debug, Serialize)]
struct CreateVideoRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    video_inputs: Option<Vec<VideoInput>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    test: Option<bool>,
}

#[derive(Debug, Serialize)]
struct VideoInput {
    character: CharacterInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    voice: Option<VoiceInput>,
}

#[derive(Debug, Serialize)]
struct CharacterInput {
    #[serde(rename = "type")]
    char_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    avatar_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    voice_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct VoiceInput {
    #[serde(rename = "type")]
    voice_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    voice_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HeyGenResponse {
    #[serde(default)]
    data: Option<HeyGenData>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    code: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HeyGenData {
    #[serde(default)]
    video_id: Option<String>,
    #[serde(default)]
    video_url: Option<String>,
    #[serde(default)]
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct VideoStatusResponse {
    #[serde(default)]
    data: Option<VideoStatusData>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct VideoStatusData {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    video_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AvatarListResponse {
    #[serde(default)]
    data: Option<AvatarData>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AvatarData {
    #[serde(default)]
    avatars: Option<Vec<Avatar>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Avatar {
    pub avatar_id: String,
    #[serde(default)]
    pub avatar_name: Option<String>,
}

pub struct HeyGenProvider {
    api_key: secrecy::SecretString,
    http: reqwest::Client,
    base_url: String,
}

impl HeyGenProvider {
    pub fn new(api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none()).pool_max_idle_per_host(10).build()
            .map_err(|e| AppError::Internal(format!("Failed to build HeyGen reqwest client: {}", e)))?;
        Ok(Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http,
            base_url: "https://api.heygen.com".to_string(),
        })
    }

    #[tracing::instrument(skip_all, fields(avatar_id = %avatar_id))]
    pub async fn create_avatar_video(
        &self,
        avatar_id: &str,
        voice_id: &str,
        text: &str,
        test: bool,
    ) -> Result<String, AppError> {
        let body = CreateVideoRequest {
            video_inputs: Some(vec![VideoInput {
                character: CharacterInput {
                    char_type: "avatar".to_string(),
                    avatar_id: Some(avatar_id.to_string()),
                    voice_id: Some(voice_id.to_string()),
                },
                voice: Some(VoiceInput {
                    voice_type: "text".to_string(),
                    input_text: Some(text.to_string()),
                    voice_id: None,
                }),
            }]),
            test: Some(test),
        };

        let resp = self.http
            .post(format!("{}/v2/video/generate", self.base_url))
            .header("X-Api-Key", self.api_key.expose_secret())
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "heygen".into(),
                message: format!("create video failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "heygen".into() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "heygen".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let hg_resp: HeyGenResponse = super::parse_json_limited(resp, "heygen", 64_000_000).await?;

        hg_resp.data
            .and_then(|d| d.video_id)
            .ok_or_else(|| AiError::InvalidResponse {
                provider: "heygen".into(),
                message: hg_resp.error.unwrap_or_else(|| "no video_id".into()),
            }.into())
    }

    #[tracing::instrument(skip_all, fields(video_id = %video_id))]
    pub async fn check_video_status(&self, video_id: &str) -> Result<(String, Option<String>), AppError> {
        let resp = self.http
            .get(format!("{}/v1/video_status.get?video_id={}", self.base_url, video_id))
            .header("X-Api-Key", self.api_key.expose_secret())
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "heygen".into(),
                message: format!("status check failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "heygen".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let status_resp: VideoStatusResponse = super::parse_json_limited(resp, "heygen", 64_000_000).await?;

        let data = status_resp.data.ok_or_else(|| AiError::InvalidResponse {
            provider: "heygen".into(),
            message: "no data in status response".into(),
        })?;

        let status_str = data.status.ok_or_else(|| AiError::InvalidResponse {
            provider: "heygen".into(),
            message: "missing status field".into(),
        })?;
        Ok((status_str, data.video_url))
    }

    #[tracing::instrument(skip_all)]
    pub async fn list_avatars(&self) -> Result<Vec<Avatar>, AppError> {
        let resp = self.http
            .get(format!("{}/v2/avatars", self.base_url))
            .header("X-Api-Key", self.api_key.expose_secret())
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "heygen".into(),
                message: format!("list avatars failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "heygen".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let avatars_resp: AvatarListResponse = super::parse_json_limited(resp, "heygen", 64_000_000).await?;

        let avatars = avatars_resp.data.and_then(|d| d.avatars).ok_or_else(|| AiError::InvalidResponse {
            provider: "heygen".into(),
            message: "missing avatars data".into(),
        })?;
        Ok(avatars)
    }
}

#[async_trait]
impl AiProvider for HeyGenProvider {
    fn name(&self) -> &'static str { "heygen" }
    fn priority(&self) -> u8 { 25 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::Video | MediaType::LipSync)
    }

    #[tracing::instrument(skip_all)]
    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let avatar_id = request.params.get("avatar_id")
            .and_then(|v| v.as_str())
            .unwrap_or("avatar_public_default");
        let voice_id = request.params.get("voice_id")
            .and_then(|v| v.as_str())
            .unwrap_or("voice_public_default");
        let text = request.prompt.as_deref().unwrap_or("");
        let test = request.params.get("test").and_then(|v| v.as_bool()).unwrap_or(false);

        let video_id = self.create_avatar_video(avatar_id, voice_id, text, test).await?;

        Ok(GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: request.telegram_id,
            media_type: request.media_type,
            status: GenerationStatus::Processing,
            result_url: None,
            provider: Some(format!("heygen:{}", video_id)),
            error: None,
            created_at: chrono::Utc::now(),
        })
    }

    #[tracing::instrument(skip_all)]
    async fn check_status(&self, generation_id: &str) -> Result<GenerationStatus, AppError> {
        let video_id = generation_id.strip_prefix("heygen:")
            .unwrap_or(generation_id);

        let (status_str, _) = self.check_video_status(video_id).await?;

        let status = match status_str.as_str() {
            "completed" | "success" => GenerationStatus::Completed,
            "failed" | "error" => GenerationStatus::Failed,
            "pending" | "processing" | "queued" => GenerationStatus::Processing,
            _ => GenerationStatus::Processing,
        };
        Ok(status)
    }

    #[tracing::instrument(skip_all)]
    async fn get_result(&self, generation_id: &str) -> Result<Option<String>, AppError> {
        let video_id = generation_id.strip_prefix("heygen:")
            .unwrap_or(generation_id);

        let (_, video_url) = self.check_video_status(video_id).await?;
        Ok(video_url)
    }

    async fn cancel(&self, _generation_id: &str) -> Result<(), AppError> {
        Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: "heygen".into(),
            message: "Cancellation not supported by provider".into(),
        }))
    }
}
