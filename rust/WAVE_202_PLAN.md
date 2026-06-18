# Wave 202 Implementation Plan

**Theme:** Complete `send_message_timeout` wrapper migration in high-call-count scene handlers.

**Date:** 2026-06-16

---

## Literature Review

### Academic Reference
**Resilient Integration of Large Language Models in Microservices Using Circuit Breakers and Fallback Strategies** (QIT Press, 2025) — [PDF](https://qitpress.com/articles/QITP-IJAIDLRD/VOLUME_6_ISSUE_2/QITP-IJAIDLRD_06_02_002.pdf)

This paper proposes a resilience-driven architecture for LLM/chatbot integration. Key findings:
- **API timeout wrappers** with adaptive timeouts and retry discipline prevent cascading retry storms.
- **Circuit breakers** (CLOSED → OPEN → HALF_OPEN state machine) per provider prevent cascading failures.
- **Bulkheads** isolate thread pools for LLM calls to prevent cross-service starvation.
- **Tiered fallback strategies:** semantic cache → smaller model → rules/templates → safe default.

For our Telegram bot handlers, this confirms that centralized timeout wrappers around every external API call are the foundation of resilience. The remaining bare `bot.send_message` calls are the last unguarded API boundaries.

### Engineering Reference
**Building a Fault-Tolerant Data Pipeline for Chatbots** (Salesforce Engineering, 2024) — [Blog](https://engineering.salesforce.com/building-a-fault-tolerant-data-pipeline-for-chatbots-47d74bc31f5b/)

This article describes the Einstein Bots event pipeline. Key patterns:
- **Timeouts:** Sensible HTTP connection timeouts (e.g., `1.5 × medianLatency`) to prevent connection pool exhaustion.
- **Retry logic:** Failed requests retried up to 6 times over 16 hours to avoid overwhelming recovering services.
- **Circuit breaker per downstream endpoint:** Three-state machine preventing calls to known-failed endpoints.
- **Bulkhead per endpoint:** Limits concurrent requests to prevent one bad endpoint from starving others.

---

## Research Summary

- **35 remaining bare `bot.send_message` calls** across 7 files.
- Files by remaining call count:
  - `neuro_photo.rs` — 9 calls (photo/text collection + gender callback dispatch)
  - `text_to_image.rs` — 7 calls (prompt + model + ratio selection dispatch)
  - `text_to_video.rs` — 7 calls (prompt + model + duration selection dispatch)
  - `lip_sync.rs` — 6 calls
  - `tech_support.rs` — 3 calls
  - `neuro_coder.rs` — 2 calls
  - `invite.rs` — 1 call

---

## Fix 1 — `neuro_photo.rs` timeout wrappers (9 send_message + duplicate tracing cleanup)

### Problem
`neuro_photo.rs` contains a multi-step FSM for collecting a photo and text prompt for neuro-photo generation. All 9 `bot.send_message` calls are bare. Additionally, both `handle_neuro_photo_entry` and `handle_neuro_photo_msg` have duplicate `#[tracing::instrument(skip_all)]` attributes.

### Changes
- Add `send_message_timeout` to the existing import block.
- Wrap all 9 `bot.send_message` calls with `send_message_timeout`.
- Remove duplicate `#[tracing::instrument(skip_all)]` on `handle_neuro_photo_entry` and `handle_neuro_photo_msg`.

---

## Fix 2 — `text_to_image.rs` timeout wrappers (7 send_message)

### Problem
`text_to_image.rs` contains a three-step FSM for collecting a prompt, selecting a model (FLUX/SDXL/DALL-E/Midjourney), and selecting an aspect ratio before dispatch. All 7 `bot.send_message` calls are bare.

### Changes
- Add `send_message_timeout` to the existing import block.
- Wrap all 7 `bot.send_message` calls with `send_message_timeout`.
- Covers: entry prompt, prompt length validation, model selection keyboard, ratio selection keyboard, session expiry errors, retry prompt, done main_menu keyboard.

---

## Fix 3 — `text_to_video.rs` timeout wrappers (7 send_message)

### Problem
`text_to_video.rs` contains a three-step FSM for collecting a prompt, selecting a model (Kling/Runway/Sora/Luma), and selecting a duration before dispatch. All 7 `bot.send_message` calls are bare.

### Changes
- Add `send_message_timeout` to the existing import block.
- Wrap all 7 `bot.send_message` calls with `send_message_timeout`.
- Covers: entry prompt, prompt length validation, model selection keyboard, duration selection keyboard, session expiry error, retry prompt, done main_menu keyboard.

---

## Verification

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — must pass with **zero warnings**.
2. No user-facing behavioral changes.

---

## Post-Wave 202 State

After this wave:
- 12 bare `bot.send_message` calls remain across 4 files (`lip_sync.rs` 6, `tech_support.rs` 3, `neuro_coder.rs` 2, `invite.rs` 1).
- All dialogue.update calls remain wrapped (0 bare).
