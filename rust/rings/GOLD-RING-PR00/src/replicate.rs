use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct CreateTrainingRequest {
    pub destination: String,
    pub input: TrainingInput,
    pub webhook: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub webhook_events_filter: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrainingInput {
    pub input_images: String,
    pub trigger_word: String,
    pub steps: i32,
    #[serde(default = "default_lora_rank")]
    pub lora_rank: i32,
    #[serde(default = "default_optimizer")]
    pub optimizer: String,
    #[serde(default = "default_batch_size")]
    pub batch_size: i32,
    #[serde(default = "default_resolution")]
    pub resolution: String,
    #[serde(default = "default_learning_rate")]
    pub learning_rate: f64,
}

fn default_lora_rank() -> i32 { 128 }
fn default_optimizer() -> String { "adamw8bit".to_string() }
fn default_batch_size() -> i32 { 1 }
fn default_resolution() -> String { "512,768,1024".to_string() }
fn default_learning_rate() -> f64 { 0.0001 }

#[derive(Debug, Clone, Deserialize)]
pub struct TrainingResponse {
    pub id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreatePredictionRequest {
    pub version: String,
    pub input: PredictionInput,
}

#[derive(Debug, Clone, Serialize)]
pub struct PredictionInput {
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negative_prompt: Option<String>,
    #[serde(default = "default_steps")]
    pub num_inference_steps: i32,
    #[serde(default = "default_format")]
    pub output_format: String,
    #[serde(default = "default_guidance")]
    pub guidance_scale: f64,
    #[serde(default = "default_quality")]
    pub output_quality: i32,
    #[serde(default = "default_outputs")]
    pub num_outputs: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aspect_ratio: Option<String>,
}

fn default_steps() -> i32 { 40 }
fn default_format() -> String { "jpg".to_string() }
fn default_guidance() -> f64 { 3.0 }
fn default_quality() -> i32 { 80 }
fn default_outputs() -> i32 { 1 }

#[derive(Debug, Clone, Deserialize)]
pub struct PredictionResponse {
    pub id: String,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WebhookPayload {
    pub id: String,
    pub status: String,
    pub model: Option<String>,
    pub version: Option<String>,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub logs: Option<String>,
    pub created_at: Option<String>,
    pub completed_at: Option<String>,
}

impl WebhookPayload {
    pub fn is_completed(&self) -> bool {
        self.status == "succeeded"
    }

    pub fn is_failed(&self) -> bool {
        self.status == "failed" || self.status == "canceled"
    }

    pub fn output_version(&self) -> Option<&str> {
        self.output
            .as_ref()
            .and_then(|o| o.get("version"))
            .and_then(|v| v.as_str())
    }

    pub fn output_weights(&self) -> Option<&str> {
        self.output
            .as_ref()
            .and_then(|o| o.get("weights"))
            .and_then(|v| v.as_str())
    }

    pub fn output_urls(&self) -> Vec<String> {
        self.output
            .as_ref()
            .and_then(|o| {
                if let Some(arr) = o.as_array() {
                    Some(arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                } else if let Some(s) = o.as_str() {
                    Some(vec![s.to_string()])
                } else {
                    None
                }
            })
            .unwrap_or_default()
    }
}
