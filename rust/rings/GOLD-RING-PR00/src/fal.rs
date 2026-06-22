use serde::{Deserialize, Serialize};
use crate::deserialize_finite_f64;

#[derive(Debug, Clone, Serialize)]
pub struct FalImageRequest {
    pub input: FalImageInput,
    #[serde(default)]
    pub logs: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FalImageInput {
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_size: Option<FalImageSize>,
    #[serde(default = "default_one")]
    pub num_images: i32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub loras: Vec<FalLora>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalImageSize {
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalLora {
    pub path: String,
    #[serde(default = "default_scale", deserialize_with = "deserialize_finite_f64")]
    pub scale: f64,
}

fn default_one() -> i32 { 1 }
fn default_scale() -> f64 { 1.0 }

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalImageResponse {
    pub data: Option<FalImageData>,
    pub images: Option<Vec<FalImageUrl>>,
    pub image_url: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalImageData {
    pub images: Option<Vec<FalImageUrl>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalImageUrl {
    pub url: String,
}

impl FalImageResponse {
    pub fn extract_urls(&self) -> Vec<String> {
        if let Some(data) = &self.data {
            if let Some(images) = &data.images {
                return images.iter().map(|i| i.url.clone()).collect();
            }
        }
        if let Some(images) = &self.images {
            return images.iter().map(|i| i.url.clone()).collect();
        }
        if let Some(url) = &self.image_url {
            return vec![url.clone()];
        }
        if let Some(url) = &self.url {
            return vec![url.clone()];
        }
        Vec::new()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FalLipSyncRequest {
    pub input: FalLipSyncInput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum FalLipSyncInput {
    ImageToVideo {
        image_url: String,
        audio_url: String,
        resolution: Option<String>,
    },
    VideoToVideo {
        video_url: String,
        audio_url: String,
        guidance_scale: Option<f64>,
    },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalLipSyncResponse {
    pub data: Option<FalLipSyncData>,
    pub request_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalLipSyncData {
    pub video: serde_json::Value,
}

impl FalLipSyncResponse {
    pub fn video_url(&self) -> Option<String> {
        self.data.as_ref().and_then(|d| {
            if let Some(obj) = d.video.as_object() {
                obj.get("url").and_then(|v| v.as_str()).map(String::from)
            } else {
                d.video.as_str().map(String::from)
            }
        })
    }
}
