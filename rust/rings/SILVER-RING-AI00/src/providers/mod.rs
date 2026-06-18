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

/// Read an HTTP error response body with a byte cap to prevent OOM from malicious
/// or misbehaving servers sending infinite/chunked error payloads.
pub(crate) async fn read_error_body(resp: reqwest::Response, max_bytes: usize) -> String {
    match resp.content_length() {
        Some(len) if len > max_bytes as u64 => {
            format!("(error body too large: {} bytes)", len)
        }
        _ => match resp.bytes().await {
            Ok(b) => {
                if b.len() > max_bytes {
                    format!("(error body too large: {} bytes)", b.len())
                } else {
                    String::from_utf8_lossy(&b).into_owned()
                }
            }
            Err(e) => format!("(failed to read error body: {})", e),
        },
    }
}
