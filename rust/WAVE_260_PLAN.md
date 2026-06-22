# Wave 260 Plan

**Date:** 2026-06-16
**Scope:** Provider DTO deserialization hardening and webhook secret rotation support.

---

## Fix 1 — Add `is_finite()` deserialization guards to f64 fields in GOLD-RING-PR00 DTOs (MEDIUM)

**Files:** `rings/GOLD-RING-PR00/src/fal.rs`, `kie.rs`, `providers.rs`, `replicate.rs`  
**Problem:** Six `f64` fields across provider DTOs accept `NaN` and `Infinity` during deserialization from untrusted provider JSON. These values can break comparisons, corrupt aggregations, and cause panics in downstream logic.

**Fields to guard:**
- `fal.rs` line 33: `FalLora.scale`
- `kie.rs` line 70: `TaskStatusData.duration`
- `kie.rs` line 116: `WebhookResponse.duration`
- `providers.rs` line 21: `VideoStatusResponse.duration`
- `replicate.rs` line 27: `TrainingInput.learning_rate`
- `replicate.rs` line 59: `PredictionInput.guidance_scale`

**Solution:** Add a `pub fn deserialize_finite_f64<'de, D>(deserializer: D) -> Result<f64, D::Error>` helper to `lib.rs` and annotate each field with `#[serde(deserialize_with = "deserialize_finite_f64")]`.

---

## Fix 2 — Add length-cap deserializers to unbounded String fields in provider DTOs (MEDIUM)

**Files:** `rings/GOLD-RING-PR00/src/providers.rs`, `kie.rs`  
**Problem:** Multiple `String` fields in provider request/response DTOs deserialize without length caps. A malicious or misbehaving provider could return multi-megabyte strings, risking OOM and log buffer exhaustion.

**Fields to cap (max 4096 bytes for URLs, max 1024 bytes for IDs/error messages):**
- `providers.rs`: `HedraGenerateRequest.image_url`, `audio_url`
- `providers.rs`: `HedraGenerateResponse.video_url`, `status`, `error`
- `providers.rs`: `Avatar.avatar_id`, `avatar_name`
- `providers.rs`: `VideoStatusResponse.video_url`, `status`, `error`
- `kie.rs`: `WebhookPayload.task_id`, `video_url`, `error_message`, `error_code`
- `kie.rs`: `WebhookResponse.error_message`

**Solution:** Add a `deserialize_string_max_len` helper to `lib.rs` and annotate each field with `#[serde(deserialize_with = "deserialize_string_max_len::<_, 4096>")]` (or appropriate limit).

---

## Fix 3 — Webhook secret rotation support (LOW)

**Files:** `rings/BRONZE-RING-SRV/src/router.rs`, `webhooks.rs`  
**Problem:** `AppState.webhook_secrets` stores exactly one secret per provider. During a secret rotation, the old secret is revoked immediately while in-flight provider retries may still use it, causing false rejections.

**Solution:**
1. Change `AppState.webhook_secrets` from `HashMap<String, SecretString>` to `HashMap<String, Vec<SecretString>>`.
2. Modify `load_webhook_secret` to also attempt loading a `_OLD` variant (e.g., `REPLICATE_WEBHOOK_SECRET_OLD`) and append it to the Vec.
3. Modify `verify_webhook_secret` to accept `&[SecretString]` and return `Ok(())` if any secret matches via constant-time comparison.
4. Update `create_router` and `create_router_with_payments` to use the new HashMap value type.

---

## Compilation target
`aarch64-apple-darwin`

## Cooperation variants for Wave 261
1. **Replicate WebhookPayload string length caps** — Add length-limit deserializers to `replicate.rs` `WebhookPayload` fields (`id`, `status`, `error`, `logs`, `created_at`, `completed_at`).
2. **Fal DTO hardening** — Add length caps to `FalImageResponse` and `FalImageUrl` fields, and cap `FalImageResponse.images` Vec length.
3. **ChatMessage.role enum validation** — Replace the raw `String` `role` field in `openai.rs` `ChatMessage` with a strongly-typed enum (`System`, `User`, `Assistant`) to prevent injection of unexpected roles.
