use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self { role: "system".into(), content: content.into() }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self { role: "user".into(), content: content.into() }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self { role: "assistant".into(), content: content.into() }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatResponse {
    pub choices: Vec<ChatChoice>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatChoice {
    pub message: ChatChoiceMessage,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatChoiceMessage {
    pub content: Option<String>,
}

impl ChatResponse {
    pub fn text(&self) -> Option<&str> {
        self.choices
            .first()
            .and_then(|c| c.message.content.as_deref())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionRequest {
    pub model: String,
    pub file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TranscriptionResponse {
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WhisperResponse {
    pub text: String,
}
