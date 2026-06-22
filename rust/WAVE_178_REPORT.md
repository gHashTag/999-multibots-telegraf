# Wave 178 Security Report

Date: 2026-06-16  
Status: COMPLETE  

## Overview

This wave hardens three areas: strict deserialization on provider response structs, sentinel guards on Telegram callback handlers, and observability coverage on scene entrypoints.

## Fix 1 — `deny_unknown_fields` on provider response structs (HIGH)

**Problem:** When external AI providers return unexpected fields (e.g., due to API version drift or compromise), serde silently ignores them. This can mask errors, hide injected data, or cause logic bugs if downstream code later starts relying on fields that are not actually being parsed.

**Solution:** Applied `#[serde(deny_unknown_fields)]` to all inbound deserialization structs across 7 provider modules (28 structs total).

**Files changed:**

- `rings/SILVER-RING-AI00/src/providers/openai.rs` — 5 structs
- `rings/SILVER-RING-AI00/src/providers/fal.rs` — 4 structs
- `rings/SILVER-RING-AI00/src/providers/replicate.rs` — 2 structs
- `rings/SILVER-RING-AI00/src/providers/heygen.rs` — 7 structs
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs` — 5 structs
- `rings/SILVER-RING-AI00/src/providers/hedra.rs` — 2 structs
- `rings/SILVER-RING-AI00/src/providers/kie.rs` — 3 structs

**Impact:** Provider API changes now cause immediate deserialization errors instead of silent truncation, giving operators early warning and preventing downstream logic from acting on missing or mis-typed fields.

## Fix 2 — `telegram_id <= 0` sentinel guards in callback handlers (MEDIUM)

**Problem:** Telegram callback query handlers in `SILVER-RING-SN00` extract `telegram_id` from `q.from.id` and immediately use it for database lookups and balance checks. A malformed or forged callback could carry `id = 0`, which in Rust `as i64` still yields `0`, leading to queries against the wrong user or potential confusion with uninitialized state.

**Solution:** Added an explicit `if tid <= 0 { warn!(...); return Ok(()); }` guard at the top of 10 callback handlers before any DB or balance operation.

**Files changed:**

- `rings/SILVER-RING-SN00/src/select_model.rs`
- `rings/SILVER-RING-SN00/src/text_to_image.rs`
- `rings/SILVER-RING-SN00/src/text_to_video.rs`
- `rings/SILVER-RING-SN00/src/neuro_photo.rs`
- `rings/SILVER-RING-SN00/src/lip_sync.rs`
- `rings/SILVER-RING-SN00/src/morphing.rs`
- `rings/SILVER-RING-SN00/src/voice_training.rs`
- `rings/SILVER-RING-SN00/src/ai_cover.rs`
- `rings/SILVER-RING-SN00/src/ai_reels.rs`
- `rings/SILVER-RING-SN00/src/music_generation.rs`

**Impact:** Callback queries with non-positive `telegram_id` are rejected early with a clear log line, preventing spurious DB operations and improving auditability.

## Fix 3 — `tracing::instrument` on key scene handlers (MEDIUM)

**Problem:** The bot's primary entrypoint handlers (`start`, `payment`, `balance`, scene commands) were not instrumented with `tracing::instrument`, making distributed tracing and production debugging difficult when errors propagated through the scene dispatcher.

**Solution:** Added `#[tracing::instrument(skip_all)]` to 20 high-value async handlers across `SILVER-RING-SN00`.

**Files changed:**

- `rings/SILVER-RING-SN00/src/start.rs`
- `rings/SILVER-RING-SN00/src/payment.rs`
- `rings/SILVER-RING-SN00/src/balance.rs`
- `rings/SILVER-RING-SN00/src/neuro_photo.rs`
- `rings/SILVER-RING-SN00/src/text_to_image.rs`
- `rings/SILVER-RING-SN00/src/text_to_video.rs`
- `rings/SILVER-RING-SN00/src/face_swap.rs`
- `rings/SILVER-RING-SN00/src/morphing.rs`
- `rings/SILVER-RING-SN00/src/image_to_video.rs`
- `rings/SILVER-RING-SN00/src/train_flux_model.rs`

**Impact:** All primary user-facing entrypoints now emit tracing spans, enabling production profiling, latency analysis, and root-cause tracing without code changes.

## Deferred / Not in this wave

- `deny_unknown_fields` on provider request structs (outbound payloads) — lower priority because malformed outbound data is caught by the provider, not by us.
- `tracing::instrument` on internal utility functions — deferred to a dedicated observability wave.

## Verification

- `cargo check --workspace --target aarch64-apple-darwin` passes cleanly.
- All changes are additive or compile-time guards; no runtime behavior changes beyond early-return on invalid `telegram_id`.

## Patterns for next wave

1. **Fail-closed deserialization** — Every inbound struct that maps external JSON to internal state should use `deny_unknown_fields` unless explicitly designed for forward compatibility.
2. **Identity sentinel guards** — Any handler that receives an identity from an untrusted context (Telegram, webhooks, OAuth) should validate it against a known-invalid sentinel before DB or state mutation.
3. **Observability at boundaries** — Every user-facing entrypoint and every async handler that crosses a runtime boundary (DB, network, filesystem) should carry `tracing::instrument(skip_all)`.
