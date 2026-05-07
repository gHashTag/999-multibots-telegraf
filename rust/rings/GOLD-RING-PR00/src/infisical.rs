use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct AuthRequest {
    pub client_id: String,
    client_secret: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GetSecretsRequest {
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub environment: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GetSecretsResponse {
    pub secrets: Vec<SecretItem>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SecretItem {
    pub key: String,
    #[serde(rename = "secretValue")]
    pub value: String,
}
