# Wave 262 Plan

**Date:** 2026-06-16
**Scope:** Kie DTO Vec hardening, provider error sanitization, and request DTO fail-closed deserialization.

---

## Fix 1 — Kie DTO Vec element-count and per-element length caps (HIGH)

**File:** `rings/GOLD-RING-PR00/src/kie.rs`
**Problem:** Seven `Option<Vec<String>>` fields (`image_urls`, `result_urls`, `result_water_mark_urls`, `result_watermark_urls`) deserialize without element-count or per-element string-length bounds. A malicious Kie.ai webhook could send a Vec with millions of elements or multi-megabyte strings per element, causing OOM during deserialization.

**Solution:**
- Add `deserialize_option_vec_max_100` (already in `lib.rs` from Wave 261) to cap element count at 100.
- Add a new `deserialize_option_vec_string_max_100_len_4096` helper that caps both element count (100) and per-element string length (4096 bytes).
- Annotate all affected fields in `TaskInput`, `TaskData`, `TaskStatusData`, `WebhookPayload`, and `WebhookResponse`.

---

## Fix 2 — Provider raw error sanitization in SILVER-RING-AI00 (MEDIUM)

**Files:** `rings/SILVER-RING-AI00/src/providers/{replicate,fal,kie,hedra,elevenlabs,openai}.rs` + `providers/mod.rs`
**Problem:** Raw external error text (reqwest error strings, HTTP response bodies, serde_json parse errors) is passed directly into `AiError::Provider` / `AppError::Ai` without content sanitization. These strings may contain HTML, JSON fragments, PII, or potential API keys echoed back by providers.

**Solution:**
- In all `.map_err()` closures that construct `AiError::Provider`, replace raw `e.to_string()` or `format!("...{}", text)` with a static generic message (e.g., `"provider request failed"`).
- Log the raw error internally via `tracing::error!` with `truncate_for_log(..., 1024)` before returning the sanitized error.
- In `providers/mod.rs` `parse_json_limited`, replace raw `serde_json::Error` text with `"invalid provider response"`.

---

## Fix 3 — Add `deny_unknown_fields` to request DTOs (LOW)

**Files:** `rings/GOLD-RING-PR00/src/replicate.rs`, `fal.rs`, `openai.rs`, `kie.rs`
**Problem:** Outbound request DTOs (`CreateTrainingRequest`, `TrainingInput`, `CreatePredictionRequest`, `PredictionInput`, `FalImageRequest`, `FalImageInput`, `FalLipSyncRequest`, `ChatRequest`, `TranscriptionRequest`, `TaskInput`) lack `#[serde(deny_unknown_fields)]`. If these structs are ever deserialized in tests or become bidirectional, extra fields would be silently ignored instead of rejected.

**Solution:** Add `#[serde(deny_unknown_fields)]` to the listed request structs. Skip `FalLipSyncInput` because it is an untagged enum where the attribute does not apply.

---

## Compilation target
`aarch64-apple-darwin`

## Cooperation variants for Wave 263
1. **InfisicalStore timeout wrapping** — Wrap `authenticate()` and `load_secrets()` network calls in `SILVER-RING-SC00/src/store.rs` with `tokio::time::timeout`.
2. **Hardcoded provider defaults** — Extract hardcoded `voice_id`, `model_id`, `avatar_id`, and system prompt strings from provider files into env-var-backed `LazyLock` constants.
3. **Missing `tracing::instrument` on provider trait impls** — Add `#[tracing::instrument(skip_all)]` to `generate`, `check_status`, `get_result`, and `cancel` trait impl methods in all SILVER-RING-AI00 provider files.
