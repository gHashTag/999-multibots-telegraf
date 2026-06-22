# Wave 261 Plan

**Date:** 2026-06-16
**Scope:** Provider DTO deserialization hardening — length caps and type safety.

---

## Fix 1 — Replicate WebhookPayload / Response string length caps (HIGH)

**File:** `rings/GOLD-RING-PR00/src/replicate.rs`  
**Problem:** `WebhookPayload` fields (`id`, `status`, `error`, `logs`, `created_at`, `completed_at`), `TrainingResponse` fields (`id`, `status`), and `PredictionResponse` fields (`id`, `error`, `status`) deserialize without length caps. A malicious or buggy Replicate webhook could inject multi-megabyte strings, risking OOM and log buffer exhaustion.

**Solution:** Apply existing `deserialize_string_max_*` and `deserialize_option_string_max_*` helpers from `lib.rs`:
- `id` fields → max 256 bytes
- `status` fields → max 256 bytes
- `error` fields → max 1024 bytes
- `logs` fields → max 4096 bytes (logs can be longer)
- `created_at` / `completed_at` → max 64 bytes (ISO-8601 timestamps)

---

## Fix 2 — Fal DTO string and Vec hardening (HIGH)

**File:** `rings/GOLD-RING-PR00/src/fal.rs`  
**Problem:** `FalImageResponse` and `FalImageData` contain unbounded `Vec<FalImageUrl>`, and `FalImageUrl.url` is an unbounded string. `FalLipSyncResponse.request_id` is also unbounded. A malicious provider response with an enormous Vec or URL string could cause OOM during deserialization.

**Solution:**
- Add `#[serde(deserialize_with = "deserialize_option_string_max_4096")]` to `FalImageResponse.image_url`, `url`
- Add `#[serde(deserialize_with = "deserialize_string_max_4096")]` to `FalImageUrl.url`
- Add `#[serde(deserialize_with = "deserialize_option_string_max_256")]` to `FalLipSyncResponse.request_id`
- Add a `deserialize_vec_max_100` helper to `lib.rs` and apply to `FalImageResponse.images` and `FalImageData.images` to cap the Vec at 100 elements.

---

## Fix 3 — `ChatMessage.role` strongly-typed enum (MEDIUM)

**File:** `rings/GOLD-RING-PR00/src/openai.rs`  
**Problem:** `ChatMessage.role` is a raw `String`. Any garbage value can be deserialized. This prevents exhaustive pattern matching and could allow injection of unexpected roles into OpenAI API requests.

**Solution:** Replace `role: String` with a `Role` enum (`System`, `User`, `Assistant`, `Tool`) with `#[serde(rename_all = "lowercase")]` and `#[derive(Serialize, Deserialize)]`. Update the three constructor methods (`system`, `user`, `assistant`) to use the enum variants.

---

## Compilation target
`aarch64-apple-darwin`

## Cooperation variants for Wave 262
1. **Kie DTO Vec hardening** — Add `deserialize_vec_max_100` to `kie.rs` `TaskInput.image_urls`, `TaskData.result_urls`, `TaskStatusData.result_urls`, `WebhookPayload.result_urls`, and cap element string lengths.
2. **Add `deny_unknown_fields` to request DTOs** — Add `#[serde(deny_unknown_fields)]` to outbound request structs in `replicate.rs`, `fal.rs`, and `openai.rs` to fail-closed on provider API drift.
3. **Provider raw error sanitization** — Replace user-facing raw error strings in `SILVER-RING-AI00/src/providers/*.rs` with static messages, logging raw errors internally via `truncate_for_log`.
