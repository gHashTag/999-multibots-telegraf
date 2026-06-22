use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct CreateAvatarVideoRequest {
    pub avatar_speech: String,
    pub avatar_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voice_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateAvatarVideoResponse {
    pub video_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VideoStatusResponse {
    pub video_url: Option<String>,
    pub duration: Option<f64>,
    pub status: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AvatarListResponse {
    pub avatars: Vec<Avatar>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Avatar {
    pub avatar_id: String,
    pub avatar_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ElevenLabsTtsRequest {
    pub text: String,
    pub model_id: String,
    pub voice_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ElevenLabsVoice {
    pub voice_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HedraGenerateRequest {
    pub image_url: String,
    pub audio_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HedraGenerateResponse {
    pub video_url: Option<String>,
    pub status: Option<String>,
    pub error: Option<String>,
}
