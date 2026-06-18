use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, Serialize)]
pub struct AuthRequest {
    pub client_id: String,
    client_secret: String,
}

impl fmt::Debug for AuthRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthRequest")
            .field("client_id", &self.client_id)
            .field("client_secret", &"<redacted>")
            .finish()
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuthResponse {
    pub access_token: String,
    pub expires_at: Option<i64>,
}

impl fmt::Debug for AuthResponse {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AuthResponse")
            .field("access_token", &"<redacted>")
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

#[derive(Clone, Serialize)]
pub struct GetSecretsRequest {
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub environment: String,
}

impl fmt::Debug for GetSecretsRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GetSecretsRequest")
            .field("workspace_id", &self.workspace_id)
            .field("environment", &self.environment)
            .finish()
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetSecretsResponse {
    pub secrets: Vec<SecretItem>,
}

impl fmt::Debug for GetSecretsResponse {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("GetSecretsResponse")
            .field("secrets", &"<redacted>")
            .finish()
    }
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SecretItem {
    pub key: String,
    #[serde(rename = "secretValue")]
    pub value: String,
}

impl fmt::Debug for SecretItem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SecretItem")
            .field("key", &self.key)
            .field("value", &"<redacted>")
            .finish()
    }
}
