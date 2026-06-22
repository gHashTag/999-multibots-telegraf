#[allow(dead_code)]
use serde::{Deserialize, Serialize};
use crate::{
    deserialize_option_string_max_1024, deserialize_option_string_max_256,
    deserialize_option_string_max_4096, deserialize_string_max_256,
};

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
    #[serde(default = "default_learning_rate", deserialize_with = "deserialize_finite_f64")]
    pub learning_rate: f64,
}

fn default_lora_rank() -> i32 { 128 }
fn default_optimizer() -> String { "adamw8bit".to_string() }
fn default_batch_size() -> i32 { 1 }
fn default_resolution() -> String { "512,768,1024".to_string() }
fn default_learning_rate() -> f64 { 0.0001 }

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrainingResponse {
    #[serde(deserialize_with = "deserialize_string_max_256")]
    pub id: String,
    #[serde(deserialize_with = "deserialize_string_max_256")]
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
    #[serde(default = "default_guidance", deserialize_with = "deserialize_finite_f64")]
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
#[serde(deny_unknown_fields)]
pub struct PredictionResponse {
    #[serde(deserialize_with = "deserialize_string_max_256")]
    pub id: String,
    pub output: Option<serde_json::Value>,
    #[serde(deserialize_with = "deserialize_option_string_max_1024")]
    pub error: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WebhookPayload {
    #[serde(deserialize_with = "deserialize_string_max_256")]
    pub id: String,
    #[serde(deserialize_with = "deserialize_string_max_256")]
    pub status: String,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
    pub model: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
    pub version: Option<String>,
    pub input: Option<serde_json::Value>,
    pub output: Option<serde_json::Value>,
    #[serde(deserialize_with = "deserialize_option_string_max_1024")]
    pub error: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_4096")]
    pub logs: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
    pub created_at: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
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
        match self.output.as_ref() {
            None => Vec::new(),
            Some(o) => {
                if let Some(arr) = o.as_array() {
                    arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
                } else if let Some(s) = o.as_str() {
                    vec![s.to_string()]
                } else {
                    let raw = o.to_string();
                    let preview = trios_mb_types::truncate_for_log(&raw, 256);
                    tracing::warn!(
                        id = %trios_mb_types::truncate_for_log(&self.id, 256),
                        status = %trios_mb_types::truncate_for_log(&self.status, 256),
                        output_preview = %preview,
                        "Replicate output format is neither array nor string; possible provider API drift"
                    );
                    Vec::new()
                }
            }
        }
    }
}
