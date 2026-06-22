use std::sync::LazyLock;
use secrecy::ExposeSecret;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

const PROVIDER_HTTP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const REQWEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const REQWEST_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
const REQWEST_POOL_IDLE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(90);

static OPENAI_BASE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("OPENAI_BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://api.openai.com".to_string())
});

static DEEPSEEK_BASE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("DEEPSEEK_BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string())
});

static GROK_BASE_URL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("GROK_BASE_URL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "https://api.x.ai/v1".to_string())
});

static OPENAI_DEFAULT_MODEL: LazyLock<String> = LazyLock::new(|| {
    std::env::var("OPENAI_DEFAULT_MODEL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "gpt-4o".to_string())
});

#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Serialize)]
struct ImageRequest {
    model: String,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    n: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    quality: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ImageResponse {
    data: Vec<ImageData>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ImageData {
    url: Option<String>,
    b64_json: Option<String>,
}

#[derive(Debug, Serialize)]
struct TtsRequest {
    model: String,
    input: String,
    voice: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    speed: Option<f64>,
}

// Wave 151: api_key migrated to secrecy::SecretString
pub struct OpenAiProvider {
    api_key: secrecy::SecretString,
    http: reqwest::Client,
    base_url: String,
}

impl OpenAiProvider {
    pub fn new(api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(REQWEST_TIMEOUT)
            .connect_timeout(REQWEST_CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(REQWEST_POOL_IDLE_TIMEOUT)
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build OpenAI reqwest client: {}", e)))?;
        Ok(Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http,
            base_url: OPENAI_BASE_URL.clone(),
        })
    }

    pub fn with_base_url(mut self, url: &str) -> Self {
        self.base_url = url.to_string();
        self
    }

    pub fn deepseek(api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(REQWEST_TIMEOUT)
            .connect_timeout(REQWEST_CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(REQWEST_POOL_IDLE_TIMEOUT)
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build DeepSeek reqwest client: {}", e)))?;
        Ok(Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http,
            base_url: DEEPSEEK_BASE_URL.clone(),
        })
    }

    pub fn grok(api_key: &str) -> Result<Self, AppError> {
        let http = reqwest::Client::builder()
            .timeout(REQWEST_TIMEOUT)
            .connect_timeout(REQWEST_CONNECT_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(REQWEST_POOL_IDLE_TIMEOUT)
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build Grok reqwest client: {}", e)))?;
        Ok(Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http,
            base_url: GROK_BASE_URL.clone(),
        })
    }

    #[tracing::instrument(skip_all, fields(model = %model))]
    pub async fn chat_completion(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        temperature: Option<f64>,
        max_tokens: Option<u32>,
    ) -> Result<String, AppError> {
        let temperature = temperature.filter(|t| t.is_finite() && *t >= 0.0 && *t <= 2.0);
        let body = ChatRequest {
            model: model.to_string(),
            messages,
            temperature,
            max_tokens,
        };

        let resp = self.http
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "openai".into(),
                message: format!("chat request failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "openai".into() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "openai".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let chat_resp: ChatResponse = super::parse_json_limited(resp, "openai", 64_000_000).await?;

        chat_resp.choices.first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| AiError::InvalidResponse {
                provider: "openai".into(),
                message: "no choices in response".into(),
            }.into())
    }

    #[tracing::instrument(skip_all, fields(prompt_len = prompt.len()))]
    pub async fn upgrade_prompt(&self, prompt: &str) -> Result<String, AppError> {
        self.chat_completion(
            "deepseek-chat",
            vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "You are a helpful assistant that upgrades the given prompt for image generation. Return only the upgraded prompt. Maximum detail and disclosure of meaning.".to_string(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: prompt.to_string(),
                },
            ],
            Some(0.4),
            Some(2000),
        ).await
    }

    #[tracing::instrument(skip_all)]
    async fn generate_image(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let model = request.model.as_deref().unwrap_or(&OPENAI_DEFAULT_MODEL);
        let prompt = request.prompt.as_deref().unwrap_or("").trim();
        if prompt.is_empty() {
            return Err(AppError::Validation("prompt is empty or whitespace-only".to_string()));
        }

        let body = ImageRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            n: request.params.get("num_images").and_then(|v| v.as_u64()).map(|n| n as u32).or(Some(1)),
            size: request.params.get("size").and_then(|v| v.as_str()).map(|s| s.to_string()),
            quality: request.params.get("quality").and_then(|v| v.as_str()).map(|q| q.to_string()),
        };

        let resp = match tokio::time::timeout(
            PROVIDER_HTTP_TIMEOUT,
            self.http
                .post(format!("{}/images/generations", self.base_url))
                .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
                .header("Content-Type", "application/json")
                .json(&body)
                .send(),
        ).await {
            Ok(Ok(resp)) => resp,
            Ok(Err(e)) => {
                return Err(AiError::Provider {
                    provider: "openai".into(),
                    message: format!("image request failed: {}", e),
                }.into());
            }
            Err(_) => {
                return Err(AiError::Provider {
                    provider: "openai".into(),
                    message: "image request timed out".to_string(),
                }.into());
            }
        };

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "openai".into() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "openai".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let img_resp: ImageResponse = super::parse_json_limited(resp, "openai", 64_000_000).await?;

        let url = img_resp.data.first()
            .and_then(|d| d.url.clone().or_else(|| d.b64_json.clone()))
            .ok_or_else(|| AiError::InvalidResponse {
                provider: "openai".into(),
                message: "no image data in response".into(),
            })?;

        Ok(GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: request.telegram_id,
            media_type: request.media_type,
            status: GenerationStatus::Completed,
            result_url: Some(url),
            provider: Some("openai".to_string()),
            error: None,
            created_at: chrono::Utc::now(),
        })
    }

    #[tracing::instrument(skip_all)]
    async fn text_to_speech(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let prompt = request.prompt.as_deref().unwrap_or("").trim();
        if prompt.is_empty() {
            return Err(AppError::Validation("prompt is empty or whitespace-only".to_string()));
        }
        let voice = request.params.get("voice")
            .and_then(|v| v.as_str())
            .unwrap_or("alloy");

        let speed = request.params.get("speed").and_then(|v| v.as_f64()).filter(|s| s.is_finite() && *s > 0.0 && *s <= 4.0);
        let body = TtsRequest {
            model: "tts-1".to_string(),
            input: prompt.to_string(),
            voice: voice.to_string(),
            speed,
        };

        let resp = match tokio::time::timeout(
            PROVIDER_HTTP_TIMEOUT,
            self.http
                .post(format!("{}/audio/speech", self.base_url))
                .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
                .header("Content-Type", "application/json")
                .json(&body)
                .send(),
        ).await {
            Ok(Ok(resp)) => resp,
            Ok(Err(e)) => {
                return Err(AiError::Provider {
                    provider: "openai".into(),
                    message: format!("tts request failed: {}", e),
                }.into());
            }
            Err(_) => {
                return Err(AiError::Provider {
                    provider: "openai".into(),
                    message: "tts request timed out".to_string(),
                }.into());
            }
        };

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "openai".into() }.into());
        }
        if !status.is_success() {
            let text = super::read_error_body(resp, 64_000).await;
            return Err(AiError::Provider {
                provider: "openai".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        const MAX_RESPONSE_BYTES: u64 = 50 * 1024 * 1024;
        let bytes = match tokio::time::timeout(std::time::Duration::from_secs(30), resp.bytes()).await {
            Ok(Ok(b)) => b,
            Ok(Err(e)) => {
                return Err(AiError::InvalidResponse {
                    provider: "openai".into(),
                    message: format!("read body: {}", e),
                }.into());
            }
            Err(_) => {
                return Err(AiError::InvalidResponse {
                    provider: "openai".into(),
                    message: "response body read timed out".to_string(),
                }.into());
            }
        };
        if bytes.len() as u64 > MAX_RESPONSE_BYTES {
            return Err(AiError::InvalidResponse {
                provider: "openai".into(),
                message: format!("response body too large: {} bytes (max {})", bytes.len(), MAX_RESPONSE_BYTES),
            }.into());
        }

        Ok(GenerationResult {
            id: uuid::Uuid::new_v4(),
            telegram_id: request.telegram_id,
            media_type: request.media_type,
            status: GenerationStatus::Completed,
            result_url: Some(format!("data:audio/mpeg;base64,{}", base64_encode(&bytes))),
            provider: Some("openai".to_string()),
            error: None,
            created_at: chrono::Utc::now(),
        })
    }
}

fn base64_encode(data: &[u8]) -> String {
    use std::fmt::Write;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let mut acc: u32 = 0;
        for byte in chunk.iter() {
            acc = (acc << 8) | (*byte as u32);
        }
        let pad = 3 - chunk.len();
        for i in 0..(4 - pad) {
            let shift = (3 - i) * 6;
            let idx = ((acc >> shift) & 0x3F) as usize;
            // Infallible: write to pre-allocated String with ASCII chars
            let _ = result.write_char(CHARSET[idx] as char);
        }
        for _ in 0..pad {
            let _ = result.write_char('=');
        }
    }
    result
}

#[async_trait]
impl AiProvider for OpenAiProvider {
    fn name(&self) -> &'static str { "openai" }
    fn priority(&self) -> u8 { 5 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::Image | MediaType::TextToSpeech)
    }

    #[tracing::instrument(skip_all)]
    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        match request.media_type {
            MediaType::Image => self.generate_image(request).await,
            MediaType::TextToSpeech => self.text_to_speech(request).await,
            _ => Err(AiError::Provider {
                provider: "openai".into(),
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
            provider: "openai".into(),
            message: "Cancellation not supported by provider".into(),
        }))
    }
}
