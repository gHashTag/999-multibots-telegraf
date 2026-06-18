use std::time::Duration;
use trios_mb_types::AppError;

pub mod replicate;
pub mod fal;
pub mod kie;
pub mod openai;
pub mod elevenlabs;
pub mod heygen;
pub mod hedra;
pub mod midjourney;

pub use replicate::ReplicateProvider;
pub use fal::FalProvider;
pub use kie::KieProvider;
pub use openai::OpenAiProvider;
pub use elevenlabs::ElevenLabsProvider;
pub use heygen::HeyGenProvider;
pub use hedra::HedraProvider;
pub use midjourney::MidjourneyProvider;

/// Read an HTTP error response body with a byte cap and timeout to prevent
/// OOM and indefinite hangs from malicious or misbehaving servers.
pub(crate) async fn read_error_body(resp: reqwest::Response, max_bytes: usize) -> String {
    match resp.content_length() {
        Some(len) if len > max_bytes as u64 => {
            format!("(error body too large: {} bytes)", len)
        }
        _ => match tokio::time::timeout(Duration::from_secs(10), resp.bytes()).await {
            Ok(Ok(b)) => {
                if b.len() > max_bytes {
                    format!("(error body too large: {} bytes)", b.len())
                } else {
                    String::from_utf8_lossy(&b).into_owned()
                }
            }
            Ok(Err(e)) => format!("(failed to read error body: {})", e),
            Err(_) => "(error body read timed out)".to_string(),
        },
    }
}

/// Read a successful HTTP response body with a hard timeout, enforce `max_bytes`,
/// then parse JSON. This closes the chunked-transfer bypass where
/// `content_length()` is `None` and `.json().await` buffers an infinite stream.
pub(super) async fn parse_json_limited<T: serde::de::DeserializeOwned>(
    resp: reqwest::Response,
    provider: &str,
    max_bytes: u64,
) -> Result<T, AppError> {
    let bytes = match tokio::time::timeout(Duration::from_secs(30), resp.bytes()).await {
        Ok(Ok(b)) => b,
        Ok(Err(e)) => {
            return Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
                provider: provider.to_string(),
                message: format!("failed to read response body: {}", e),
            }));
        }
        Err(_) => {
            return Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
                provider: provider.to_string(),
                message: "response body read timed out".to_string(),
            }));
        }
    };
    if bytes.len() as u64 > max_bytes {
        return Err(AppError::Ai(trios_mb_types::errors::AiError::Provider {
            provider: provider.to_string(),
            message: format!(
                "response body too large: {} bytes (max {})",
                bytes.len(),
                max_bytes
            ),
        }));
    }
    serde_json::from_slice(&bytes).map_err(|e| {
        AppError::Ai(trios_mb_types::errors::AiError::InvalidResponse {
            provider: provider.to_string(),
            message: format!("json parse: {}", e),
        })
    })
}
