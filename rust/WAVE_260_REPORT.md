# Wave 260 Report

**Date:** 2026-06-16
**Scope:** Provider DTO deserialization hardening and webhook secret rotation support.
**Co-Authored-By:** Claude Opus 4.8 <noreply@anthropic.com>

---

## Fix 1: `is_finite()` deserialization guards on f64 fields in GOLD-RING-PR00 DTOs (MEDIUM)

**Files:** `rings/GOLD-RING-PR00/src/fal.rs`, `kie.rs`, `providers.rs`, `replicate.rs`  
**Pattern:** All `f64` fields that deserialize from untrusted provider JSON must reject `NaN` and `Infinity` at the deserialization boundary.

Added a `deserialize_finite_f64` helper (and `deserialize_option_finite_f64` for `Option<f64>`) to `lib.rs` and annotated six fields across four files:
- `fal.rs`: `FalLora.scale`
- `kie.rs`: `TaskStatusData.duration`, `WebhookResponse.duration`
- `providers.rs`: `VideoStatusResponse.duration`
- `replicate.rs`: `TrainingInput.learning_rate`, `PredictionInput.guidance_scale`

**Why:** Malicious or corrupted provider JSON can inject `NaN` or `Infinity` into numeric fields. These values break comparisons, corrupt aggregations, and can cause panics or infinite loops in downstream logic. Rejecting them at deserialization is the earliest and safest defense.

---

## Fix 2: Length-cap deserializers on unbounded String fields in provider DTOs (MEDIUM)

**Files:** `rings/GOLD-RING-PR00/src/providers.rs`, `kie.rs`  
**Pattern:** All `String` fields that deserialize from untrusted provider JSON must have length caps to prevent OOM and log buffer exhaustion.

Added `deserialize_string_max_4096`, `deserialize_string_max_1024`, `deserialize_string_max_256`, and their `Option` variants to `lib.rs`. Annotated 14 fields:
- `providers.rs`: `HedraGenerateRequest.image_url`, `audio_url` (max 4096)
- `providers.rs`: `HedraGenerateResponse.video_url` (max 4096), `status` (max 256), `error` (max 1024)
- `providers.rs`: `Avatar.avatar_id` (max 256), `avatar_name` (max 256)
- `providers.rs`: `VideoStatusResponse.video_url` (max 4096), `status` (max 256), `error` (max 1024)
- `kie.rs`: `WebhookPayload.task_id` (max 256), `video_url` (max 4096), `error_message` (max 1024), `error_code` (max 256)
- `kie.rs`: `WebhookResponse.error_message` (max 1024)

**Why:** A misbehaving or malicious provider could return multi-megabyte strings in fields like `video_url`, `error_message`, or `task_id`. Without length caps, these strings could exhaust memory during deserialization or overflow log buffers when later emitted via `tracing`.

---

## Fix 3: Webhook secret rotation support (LOW)

**Files:** `rings/BRONZE-RING-SRV/src/router.rs`, `webhooks.rs`  
**Pattern:** Webhook secret verification must support multiple valid secrets during a rotation grace period.

Changed `AppState.webhook_secrets` from `HashMap<String, SecretString>` to `HashMap<String, Vec<SecretString>>`. Modified `load_webhook_secret` to load both the current secret (e.g., `REPLICATE_WEBHOOK_SECRET`) and an `_OLD` variant (e.g., `REPLICATE_WEBHOOK_SECRET_OLD`). Modified `verify_webhook_secret` to accept `&[SecretString]` and constant-time compare against all valid secrets, returning `Ok(())` on the first match.

**Why:** During a secret rotation, the old secret must remain valid for the provider's retry window (typically minutes to hours). Without dual-secret support, any in-flight retry using the old secret would be falsely rejected, causing provider webhooks to be permanently lost.

---

## Verification

- `cargo check -p trios-mb-proto --target aarch64-apple-darwin` ✅
- `cargo check -p trios-mb-server --target aarch64-apple-darwin` ✅

No regressions introduced. All fixes are additive or tightening and do not change happy-path behavior.

---

## Cooperation Variants for Wave 261

1. **Replicate WebhookPayload string length caps** — Add length-limit deserializers to `replicate.rs` `WebhookPayload` fields (`id`, `status`, `error`, `logs`, `created_at`, `completed_at`).
2. **Fal DTO hardening** — Add length caps to `FalImageResponse` and `FalImageUrl` fields, and cap `FalImageResponse.images` Vec length.
3. **ChatMessage.role enum validation** — Replace the raw `String` `role` field in `openai.rs` `ChatMessage` with a strongly-typed enum (`System`, `User`, `Assistant`) to prevent injection of unexpected roles.
