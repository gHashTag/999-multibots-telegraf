use secrecy::ExposeSecret;
// Wave 151: api_key migrated to secrecy::SecretString
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

#[derive(Debug, Serialize)]
struct TtsPayload {
    text: String,
    model_id: String,
    voice_settings: VoiceSettings,
}

#[derive(Debug, Serialize)]
struct VoiceSettings {
    stability: f64,
    similarity_boost: f64,
    style: f64,
    use_speaker_boost: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct VoiceListResponse {
    voices: Option<Vec<Voice>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Voice {
    pub voice_id: String,
    pub name: String,
    #[serde(default)]
    labels: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AddVoiceResponse {
    voice_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct UserResponse {
    #[serde(default)]
    subscription: Option<UserSubscription>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct UserSubscription {
    #[serde(default)]
    character_count: Option<i64>,
    #[serde(default)]
    character_limit: Option<i64>,
}

pub struct ElevenLabsProvider {
    api_key: secrecy::SecretString,
    http: reqwest::Client,
    base_url: String,
}

impl ElevenLabsProvider {
    pub fn new(api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .connect_timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none()).build()
            .map_err(|e| AppError::Internal(format!("Failed to build ElevenLabs reqwest client: {}", e)))?;
        Ok(Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http,
            base_url: "https://api.elevenlabs.io".to_string(),
        })
    }

    pub async fn text_to_speech_raw(
        &self,
        voice_id: &str,
        text: &str,
        model_id: &str,
    ) -> Result<Vec<u8>, AppError> {
        let payload = TtsPayload {
            text: text.to_string(),
            model_id: model_id.to_string(),
            voice_settings: VoiceSettings {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
            },
        };

        let resp = self.http
            .post(format!("{}/v1/text-to-speech/{}", self.base_url, voice_id))
            .header("xi-api-key", self.api_key.expose_secret())
            .header("Content-Type", "application/json")
            .header("Accept", "audio/mpeg")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("tts request failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "elevenlabs".into() }.into());
        }
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(AiError::NotFound { id: voice_id.to_string() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        const MAX_RESPONSE_BYTES: u64 = 50 * 1024 * 1024;
        let bytes = match tokio::time::timeout(std::time::Duration::from_secs(30), resp.bytes()).await {
            Ok(Ok(b)) => b,
            Ok(Err(e)) => {
                return Err(AiError::InvalidResponse {
                    provider: "elevenlabs".into(),
                    message: format!("read body: {}", e),
                }.into());
            }
            Err(_) => {
                return Err(AiError::InvalidResponse {
                    provider: "elevenlabs".into(),
                    message: "response body read timed out".to_string(),
                }.into());
            }
        };
        if bytes.len() as u64 > MAX_RESPONSE_BYTES {
            return Err(AiError::InvalidResponse {
                provider: "elevenlabs".into(),
                message: format!("response body too large: {} bytes (max {})", bytes.len(), MAX_RESPONSE_BYTES),
            }.into());
        }
        Ok(bytes.to_vec())
    }

    pub async fn list_voices(&self) -> Result<Vec<Voice>, AppError> {
        let resp = self.http
            .get(format!("{}/v1/voices", self.base_url))
            .header("xi-api-key", self.api_key.expose_secret())
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("list voices failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let voice_resp: VoiceListResponse = super::parse_json_limited(resp, "elevenlabs", 64_000_000).await?;

        let voices = voice_resp.voices.ok_or_else(|| AiError::InvalidResponse {
            provider: "elevenlabs".into(),
            message: "missing voices field".into(),
        })?;
        Ok(voices)
    }

    pub async fn voice_exists(&self, voice_id: &str) -> Result<bool, AppError> {
        let voices = self.list_voices().await?;
        Ok(voices.iter().any(|v| v.voice_id == voice_id))
    }

    pub async fn add_voice(
        &self,
        name: &str,
        audio_data: &[u8],
        description: &str,
    ) -> Result<String, AppError> {
        let form = reqwest::multipart::Form::new()
            .text("name", name.to_string())
            .text("description", description.to_string())
            .text("labels", r#"{"accent":"neutral"}"#.to_string())
            .part("files", reqwest::multipart::Part::bytes(audio_data.to_vec())
                .file_name("voice.mp3")
                .mime_str("audio/mpeg")
                .map_err(|e| AppError::Internal(e.to_string()))?);

        let resp = self.http
            .post(format!("{}/v1/voices/add", self.base_url))
            .header("xi-api-key", self.api_key.expose_secret())
            .multipart(form)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("add voice failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "elevenlabs".into() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let add_resp: AddVoiceResponse = super::parse_json_limited(resp, "elevenlabs", 64_000_000).await?;

        Ok(add_resp.voice_id)
    }

    pub async fn get_character_balance(&self) -> Result<(i64, i64), AppError> {
        let resp = self.http
            .get(format!("{}/v1/user", self.base_url))
            .header("xi-api-key", self.api_key.expose_secret())
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("user info failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let user: UserResponse = super::parse_json_limited(resp, "elevenlabs", 64_000_000).await?;

        let sub = user.subscription.unwrap_or(UserSubscription {
            character_count: Some(0),
            character_limit: Some(0),
        });
        Ok((sub.character_count.unwrap_or(0), sub.character_limit.unwrap_or(0)))
    }
}

#[async_trait]
impl AiProvider for ElevenLabsProvider {
    fn name(&self) -> &'static str { "elevenlabs" }
    fn priority(&self) -> u8 { 15 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::TextToSpeech | MediaType::Audio)
    }

    #[tracing::instrument(skip_all)]
    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        match request.media_type {
            MediaType::TextToSpeech | MediaType::Audio => {
                let voice_id = request.params.get("voice_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("21m00Tcm4TlvDq8ikWAM");
                let model_id = request.params.get("model_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("eleven_turbo_v2_5");
                let text = request.prompt.as_deref().unwrap_or("");

                let audio_data = self.text_to_speech_raw(voice_id, text, model_id).await?;

                Ok(GenerationResult {
                    id: uuid::Uuid::new_v4(),
                    telegram_id: request.telegram_id,
                    media_type: request.media_type,
                    status: GenerationStatus::Completed,
                    result_url: Some(format!("data:audio/mpeg;base64,{}", to_base64(&audio_data))),
                    provider: Some("elevenlabs".to_string()),
                    error: None,
                    created_at: chrono::Utc::now(),
                })
            }
            _ => Err(AiError::Provider {
                provider: "elevenlabs".into(),
                message: format!("unsupported media type: {:?}", request.media_type),
            }.into()),
        }
    }

    #[tracing::instrument(skip_all)]
    async fn check_status(&self, _generation_id: &str) -> Result<GenerationStatus, AppError> {
        Ok(GenerationStatus::Completed)
    }

    #[tracing::instrument(skip_all)]
    async fn get_result(&self, _generation_id: &str) -> Result<Option<String>, AppError> {
        Ok(None)
    }

    async fn cancel(&self, _generation_id: &str) -> Result<(), AppError> {
        Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: "elevenlabs".into(),
            message: "Cancellation not supported by provider".into(),
        }))
    }
}

fn to_base64(data: &[u8]) -> String {
    let mut result = String::new();
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for chunk in data.chunks(3) {
        let mut acc: u32 = 0;
        for byte in chunk.iter() {
            acc = (acc << 8) | (*byte as u32);
        }
        let pad = 3 - chunk.len();
        for i in 0..(4 - pad) {
            let shift = (3 - i) * 6;
            let idx = ((acc >> shift) & 0x3F) as usize;
            result.push(CHARSET[idx] as char);
        }
        for _ in 0..pad {
            result.push('=');
        }
    }
    result
}
