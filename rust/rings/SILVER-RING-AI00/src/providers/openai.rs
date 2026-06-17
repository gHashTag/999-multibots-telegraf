use secrecy::ExposeSecret;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

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
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
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
struct ImageResponse {
    data: Vec<ImageData>,
}

#[derive(Debug, Deserialize)]
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
    pub fn new(api_key: &str) -> Self {
        Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none()).build()
                .expect("Failed to build OpenAI reqwest client"),
            base_url: "https://api.openai.com".to_string(),
        }
    }

    pub fn with_base_url(mut self, url: &str) -> Self {
        self.base_url = url.to_string();
        self
    }

    pub fn deepseek(api_key: &str) -> Self {
        Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none()).build()
                .expect("Failed to build DeepSeek reqwest client"),
            base_url: "https://api.deepseek.com/v1".to_string(),
        }
    }

    pub fn grok(api_key: &str) -> Self {
        Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none()).build()
                .expect("Failed to build Grok reqwest client"),
            base_url: "https://api.x.ai/v1".to_string(),
        }
    }

    pub async fn chat_completion(
        &self,
        model: &str,
        messages: Vec<ChatMessage>,
        temperature: Option<f64>,
        max_tokens: Option<u32>,
    ) -> Result<String, AppError> {
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
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read openai error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "openai".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let chat_resp: ChatResponse = resp.json().await.map_err(|e| AiError::InvalidResponse {
            provider: "openai".into(),
            message: format!("json parse: {}", e),
        })?;

        chat_resp.choices.first()
            .map(|c| c.message.content.clone())
            .ok_or_else(|| AiError::InvalidResponse {
                provider: "openai".into(),
                message: "no choices in response".into(),
            }.into())
    }

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

    async fn generate_image(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let model = request.model.as_deref().unwrap_or("gpt-4o");
        let prompt = request.prompt.as_deref().unwrap_or("");

        let body = ImageRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            n: request.params.get("num_images").and_then(|v| v.as_u64()).map(|n| n as u32).or(Some(1)),
            size: request.params.get("size").and_then(|v| v.as_str()).map(|s| s.to_string()),
            quality: request.params.get("quality").and_then(|v| v.as_str()).map(|q| q.to_string()),
        };

        let resp = self.http
            .post(format!("{}/images/generations", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "openai".into(),
                message: format!("image request failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "openai".into() }.into());
        }
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read openai error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "openai".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let img_resp: ImageResponse = resp.json().await.map_err(|e| AiError::InvalidResponse {
            provider: "openai".into(),
            message: format!("json parse: {}", e),
        })?;

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

    async fn text_to_speech(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let prompt = request.prompt.as_deref().unwrap_or("");
        let voice = request.params.get("voice")
            .and_then(|v| v.as_str())
            .unwrap_or("alloy");

        let body = TtsRequest {
            model: "tts-1".to_string(),
            input: prompt.to_string(),
            voice: voice.to_string(),
            speed: request.params.get("speed").and_then(|v| v.as_f64()),
        };

        let resp = self.http
            .post(format!("{}/audio/speech", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "openai".into(),
                message: format!("tts request failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "openai".into() }.into());
        }
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read openai error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "openai".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        let bytes = resp.bytes().await.map_err(|e| AiError::InvalidResponse {
            provider: "openai".into(),
            message: format!("read body: {}", e),
        })?;

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

    async fn check_status(&self, _generation_id: &str) -> Result<GenerationStatus, AppError> {
        Ok(GenerationStatus::Completed)
    }

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
