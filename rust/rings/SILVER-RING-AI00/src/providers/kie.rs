use secrecy::ExposeSecret;
// Wave 151: api_key migrated to secrecy::SecretString
use async_trait::async_trait;
use serde::Deserialize;
use trios_mb_traits::AiProvider;
use trios_mb_types::generation::*;
use trios_mb_types::AppError;
use trios_mb_types::errors::AiError;

#[derive(Debug, Deserialize)]
struct KieTaskResponse {
    #[serde(default)]
    task_id: Option<String>,
    #[serde(default)]
    video_url: Option<String>,
    #[serde(default)]
    image_url: Option<String>,
    #[serde(default)]
    audio_url: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    data: Option<KieData>,
}

#[derive(Debug, Deserialize)]
struct KieData {
    #[serde(default)]
    video_url: Option<String>,
    #[serde(default)]
    image_url: Option<String>,
    #[serde(default)]
    task_id: Option<String>,
    #[serde(default)]
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KieBalanceResponse {
    #[serde(default)]
    balance: Option<f64>,
    #[serde(default)]
    available: Option<f64>,
    #[serde(default)]
    total: Option<f64>,
}

pub struct KieProvider {
    api_key: secrecy::SecretString,
    http: reqwest::Client,
    base_url: String,
}

impl KieProvider {
    pub fn new(api_key: &str) -> Self {
        Self {
            api_key: secrecy::SecretString::new(api_key.to_string().into_boxed_str()),
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("Failed to build KIE reqwest client"),
            base_url: "https://api.kie.ai".to_string(),
        }
    }

    fn build_video_payload(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut payload = serde_json::Map::new();
        payload.insert("model".to_string(), serde_json::Value::String(
            request.model.clone().unwrap_or_else(|| "veo3_fast".to_string())
        ));
        if let Some(ref prompt) = request.prompt {
            payload.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(d) = request.params.get("duration").and_then(|v| v.as_f64()) {
            payload.insert("duration".to_string(), serde_json::json!(d));
        } else {
            payload.insert("duration".to_string(), serde_json::json!(5));
        }
        if let Some(ref ar) = request.params.get("aspect_ratio").and_then(|v| v.as_str()) {
            payload.insert("aspect_ratio".to_string(), serde_json::Value::String(ar.to_string()));
        }
        if let Some(ref image_url) = request.image_url {
            payload.insert("image_url".to_string(), serde_json::Value::String(image_url.clone()));
        }
        if let Some(ref tid) = request.params.get("telegram_id").and_then(|v| v.as_str()) {
            payload.insert("telegram_id".to_string(), serde_json::Value::String(tid.to_string()));
        }
        serde_json::Value::Object(payload)
    }

    fn build_image_payload(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut payload = serde_json::Map::new();
        payload.insert("model".to_string(), serde_json::Value::String(
            request.model.clone().unwrap_or_else(|| "gpt-4o-image".to_string())
        ));
        if let Some(ref prompt) = request.prompt {
            payload.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(w) = request.params.get("width").and_then(|v| v.as_u64()) {
            payload.insert("width".to_string(), serde_json::Value::Number(w.into()));
        }
        if let Some(h) = request.params.get("height").and_then(|v| v.as_u64()) {
            payload.insert("height".to_string(), serde_json::Value::Number(h.into()));
        }
        serde_json::Value::Object(payload)
    }

    fn build_music_payload(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut payload = serde_json::Map::new();
        payload.insert("model".to_string(), serde_json::Value::String(
            request.model.clone().unwrap_or_else(|| "suno-v4".to_string())
        ));
        if let Some(ref prompt) = request.prompt {
            payload.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(ref lyrics) = request.params.get("lyrics").and_then(|v| v.as_str()) {
            payload.insert("lyrics".to_string(), serde_json::Value::String(lyrics.to_string()));
        }
        if let Some(instrumental) = request.params.get("instrumental").and_then(|v| v.as_bool()) {
            payload.insert("instrumental".to_string(), serde_json::Value::Bool(instrumental));
        }
        if let Some(d) = request.params.get("duration").and_then(|v| v.as_f64()) {
            payload.insert("duration".to_string(), serde_json::json!(d));
        }
        serde_json::Value::Object(payload)
    }

    fn build_sora_payload(&self, request: &GenerationRequest) -> serde_json::Value {
        let mut payload = serde_json::Map::new();
        let model = request.model.as_deref().unwrap_or("sora-2");
        let sora_model = if model.contains("pro") {
            "sora-2-pro-text-to-video"
        } else {
            "sora-2-text-to-video"
        };
        payload.insert("model".to_string(), serde_json::Value::String(sora_model.to_string()));
        if let Some(ref prompt) = request.prompt {
            payload.insert("prompt".to_string(), serde_json::Value::String(prompt.clone()));
        }
        if let Some(ar) = request.params.get("aspect_ratio").and_then(|v| v.as_str()) {
            let sora_ar = if ar == "9:16" { "portrait" } else { "landscape" };
            payload.insert("aspect_ratio".to_string(), serde_json::Value::String(sora_ar.to_string()));
        }
        if let Some(rm) = request.params.get("remove_watermark").and_then(|v| v.as_bool()) {
            payload.insert("remove_watermark".to_string(), serde_json::Value::Bool(rm));
        }
        payload.insert("duration".to_string(), serde_json::json!(10));
        if let Some(ref tid) = request.params.get("telegram_id").and_then(|v| v.as_str()) {
            payload.insert("telegram_id".to_string(), serde_json::Value::String(tid.to_string()));
        }
        serde_json::Value::Object(payload)
    }

    fn is_sora_model(model: &str) -> bool {
        model.contains("sora")
    }

    fn is_wan_model(model: &str) -> bool {
        model.contains("wan")
    }

    async fn submit_video(&self, payload: serde_json::Value) -> Result<KieTaskResponse, AppError> {
        let endpoint = "/api/v1/video/generate";
        self.send_request(endpoint, payload).await
    }

    async fn submit_sora(&self, payload: serde_json::Value) -> Result<KieTaskResponse, AppError> {
        let endpoint = "/api/v1/sora/generate";
        self.send_request(endpoint, payload).await
    }

    async fn submit_image(&self, payload: serde_json::Value) -> Result<KieTaskResponse, AppError> {
        let endpoint = "/api/v1/image/generate";
        self.send_request(endpoint, payload).await
    }

    async fn submit_music(&self, payload: serde_json::Value) -> Result<KieTaskResponse, AppError> {
        let endpoint = "/api/v1/music/generate";
        self.send_request(endpoint, payload).await
    }

    async fn send_request(&self, endpoint: &str, payload: serde_json::Value) -> Result<KieTaskResponse, AppError> {
        let resp = self.http
            .post(format!("{}{}", self.base_url, endpoint))
            .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "kie".into(),
                message: format!("request failed: {}", e),
            })?;

        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AiError::RateLimited { provider: "kie".into() }.into());
        }
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read kie error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "kie".into(),
                message: format!("HTTP {}: {}", status, text),
            }.into());
        }

        resp.json::<KieTaskResponse>()
            .await
            .map_err(|e| AiError::InvalidResponse {
                provider: "kie".into(),
                message: format!("json parse: {}", e),
            }.into())
    }

    async fn check_task_status(&self, task_id: &str) -> Result<KieTaskResponse, AppError> {
        let resp = self.http
            .get(format!("{}/api/v1/task/{}", self.base_url, task_id))
            .header("Authorization", format!("Bearer {}", self.api_key.expose_secret()))
            .send()
            .await
            .map_err(|e| AiError::Provider {
                provider: "kie".into(),
                message: format!("status check failed: {}", e),
            })?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_else(|e| {
                tracing::warn!(error = %e, "Failed to read kie error response body");
                format!("[body unreadable: {}]", e)
            });
            return Err(AiError::Provider {
                provider: "kie".into(),
                message: format!("status HTTP {}: {}", status, text),
            }.into());
        }

        resp.json::<KieTaskResponse>()
            .await
            .map_err(|e| AiError::InvalidResponse {
                provider: "kie".into(),
                message: format!("json parse: {}", e),
            }.into())
    }

    fn extract_url(resp: &KieTaskResponse) -> Option<String> {
        resp.video_url.clone()
            .or_else(|| resp.image_url.clone())
            .or_else(|| resp.audio_url.clone())
            .or_else(|| resp.data.as_ref().and_then(|d| d.video_url.clone()))
            .or_else(|| resp.data.as_ref().and_then(|d| d.image_url.clone()))
    }

    fn extract_task_id(resp: &KieTaskResponse) -> Option<String> {
        resp.task_id.clone()
            .or_else(|| resp.data.as_ref().and_then(|d| d.task_id.clone()))
    }
}

#[async_trait]
impl AiProvider for KieProvider {
    fn name(&self) -> &'static str { "kie" }
    fn priority(&self) -> u8 { 30 }

    fn supports_media_type(&self, media_type: MediaType) -> bool {
        matches!(media_type, MediaType::Image | MediaType::Video | MediaType::LipSync | MediaType::ImageToVideo)
    }

    async fn generate(&self, request: &GenerationRequest) -> Result<GenerationResult, AppError> {
        let model = request.model.as_deref().unwrap_or("veo3_fast");

        let kie_resp = match request.media_type {
            MediaType::Video | MediaType::ImageToVideo => {
                if Self::is_sora_model(model) {
                    let payload = self.build_sora_payload(request);
                    self.submit_sora(payload).await?
                } else {
                    let payload = self.build_video_payload(request);
                    self.submit_video(payload).await?
                }
            }
            MediaType::Image => {
                let payload = self.build_image_payload(request);
                self.submit_image(payload).await?
            }
            _ => return Err(AiError::Provider {
                provider: "kie".into(),
                message: format!("unsupported media type: {:?}", request.media_type),
            }.into()),
        };

        let result_url = Self::extract_url(&kie_resp);
        let task_id = Self::extract_task_id(&kie_resp);

        let gen_status = if result_url.is_some() {
            GenerationStatus::Completed
        } else if task_id.is_some() {
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
            provider: task_id.map(|id| format!("kie:{}", id)),
            error: kie_resp.error,
            created_at: chrono::Utc::now(),
        })
    }

    async fn check_status(&self, generation_id: &str) -> Result<GenerationStatus, AppError> {
        let task_id = generation_id.strip_prefix("kie:")
            .unwrap_or(generation_id);

        if task_id.is_empty() {
            return Err(AppError::Validation("empty kie task id".into()));
        }

        let resp = self.check_task_status(task_id).await?;

        let status = match resp.status.as_deref().or_else(|| resp.data.as_ref().and_then(|d| d.status.as_deref())) {
            Some("completed" | "succeeded" | "done") => GenerationStatus::Completed,
            Some("failed" | "error") => GenerationStatus::Failed,
            Some("cancelled" | "canceled") => GenerationStatus::Cancelled,
            _ => GenerationStatus::Processing,
        };
        Ok(status)
    }

    async fn get_result(&self, generation_id: &str) -> Result<Option<String>, AppError> {
        let task_id = generation_id.strip_prefix("kie:")
            .unwrap_or(generation_id);

        if task_id.is_empty() {
            return Err(AppError::Validation("empty kie task id".into()));
        }

        let resp = self.check_task_status(task_id).await?;
        Ok(Self::extract_url(&resp))
    }

    async fn cancel(&self, _generation_id: &str) -> Result<(), AppError> {
        Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: "kie".into(),
            message: "Cancellation not supported by provider".into(),
        }))
    }
}
