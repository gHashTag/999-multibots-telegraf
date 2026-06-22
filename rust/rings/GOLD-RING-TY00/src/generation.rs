use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum MediaType {
    Image,
    Video,
    Audio,
    ImageToVideo,
    TextToSpeech,
    LipSync,
    FaceSwap,
    Morphing,
    Upscale,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GenerationRequest {
    pub telegram_id: i64,
    pub media_type: MediaType,
    pub prompt: Option<String>,
    pub image_url: Option<String>,
    pub model: Option<String>,
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GenerationResult {
    pub id: uuid::Uuid,
    pub telegram_id: i64,
    pub media_type: MediaType,
    pub status: GenerationStatus,
    pub result_url: Option<String>,
    pub provider: Option<String>,
    pub error: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum GenerationStatus {
    Queued,
    Processing,
    Completed,
    Failed,
    Cancelled,
}
