use serde::{Deserialize, Serialize};
use crate::{deserialize_option_finite_f64, deserialize_option_string_max_4096, deserialize_option_string_max_1024, deserialize_option_string_max_256, deserialize_string_max_256, deserialize_string_max_4096};

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
    #[serde(deserialize_with = "deserialize_option_string_max_4096")]
    pub video_url: Option<String>,
    #[serde(deserialize_with = "deserialize_option_finite_f64")]
    pub duration: Option<f64>,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
    pub status: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_1024")]
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
    #[serde(deserialize_with = "deserialize_string_max_256")]
    pub avatar_id: String,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
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
    #[serde(deserialize_with = "deserialize_string_max_4096")]
    pub image_url: String,
    #[serde(deserialize_with = "deserialize_string_max_4096")]
    pub audio_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HedraGenerateResponse {
    #[serde(deserialize_with = "deserialize_option_string_max_4096")]
    pub video_url: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_256")]
    pub status: Option<String>,
    #[serde(deserialize_with = "deserialize_option_string_max_1024")]
    pub error: Option<String>,
}
