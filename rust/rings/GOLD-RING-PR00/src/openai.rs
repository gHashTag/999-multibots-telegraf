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

/// Restricted role enum for OpenAI Chat API messages.
/// Prevents injection of unexpected roles and enables exhaustive pattern matching.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

impl std::fmt::Display for Role {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Role::System => "system",
            Role::User => "user",
            Role::Assistant => "assistant",
            Role::Tool => "tool",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self { role: Role::System, content: content.into() }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self { role: Role::User, content: content.into() }
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self { role: Role::Assistant, content: content.into() }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChatResponse {
    pub choices: Vec<ChatChoice>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChatChoice {
    pub message: ChatChoiceMessage,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
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
#[serde(deny_unknown_fields)]
pub struct TranscriptionResponse {
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WhisperResponse {
    pub text: String,
}
