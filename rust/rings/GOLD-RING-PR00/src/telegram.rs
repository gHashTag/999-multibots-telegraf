use serde::{Deserialize, Serialize};
use trios_mb_types::scene::SceneId;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallbackData {
    pub action: String,
    pub payload: Option<serde_json::Value>,
}

impl CallbackData {
    pub fn navigate(scene: SceneId) -> String {
        serde_json::to_string(&Self {
            action: "nav".into(),
            payload: Some(serde_json::json!({ "scene": scene.scene_name() })),
        })
        .unwrap_or_default()
    }

    pub fn action(name: &str) -> String {
        serde_json::to_string(&Self {
            action: name.into(),
            payload: None,
        })
        .unwrap_or_default()
    }

    pub fn action_with_payload(name: &str, payload: serde_json::Value) -> String {
        serde_json::to_string(&Self {
            action: name.into(),
            payload: Some(payload),
        })
        .unwrap_or_default()
    }

    pub fn parse(data: &str) -> Option<Self> {
        serde_json::from_str(data).ok()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InlineButton {
    pub text: String,
    pub callback_data: String,
}

impl InlineButton {
    pub fn new(text: impl Into<String>, callback_data: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            callback_data: callback_data.into(),
        }
    }

    pub fn nav(text: impl Into<String>, scene: SceneId) -> Self {
        Self {
            text: text.into(),
            callback_data: CallbackData::navigate(scene),
        }
    }

    pub fn action(text: impl Into<String>, action: &str) -> Self {
        Self {
            text: text.into(),
            callback_data: CallbackData::action(action),
        }
    }

    pub fn url(text: impl Into<String>, url: impl Into<String>) -> teloxide_inline_button_url::InlineKeyboardButtonUrl {
        teloxide_inline_button_url::InlineKeyboardButtonUrl {
            text: text.into(),
            url: url.into(),
        }
    }
}

pub mod teloxide_inline_button_url {
    #[derive(Debug, Clone)]
    pub struct InlineKeyboardButtonUrl {
        pub text: String,
        pub url: String,
    }
}
