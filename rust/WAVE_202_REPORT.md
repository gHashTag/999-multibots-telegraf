# Wave 202 Report

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

## Fix 1 — `neuro_photo.rs` timeout wrappers (9 send_message + duplicate tracing cleanup)

### Problem
`neuro_photo.rs` contained a multi-step FSM for collecting a photo and text prompt for neuro-photo generation. All 9 `bot.send_message` calls were bare. Additionally, both `handle_neuro_photo_entry` and `handle_neuro_photo_msg` had duplicate `#[tracing::instrument(skip_all)]` attributes.

### Changes
- Added `send_message_timeout` to the import block.
- Wrapped all 9 `bot.send_message` calls with `send_message_timeout`.
- Removed duplicate `#[tracing::instrument(skip_all)]` on `handle_neuro_photo_entry` and `handle_neuro_photo_msg`.

---

## Fix 2 — `text_to_image.rs` timeout wrappers (7 send_message)

### Problem
`text_to_image.rs` contained a three-step FSM for collecting a prompt, selecting a model (FLUX/SDXL/DALL-E/Midjourney), and selecting an aspect ratio before dispatch. All 7 `bot.send_message` calls were bare.

### Changes
- Added `send_message_timeout` to the import block.
- Wrapped all 7 `bot.send_message` calls with `send_message_timeout`.
- Covered: entry prompt, prompt length validation, model selection keyboard, ratio selection keyboard, session expiry error, retry prompt, done main_menu keyboard.

---

## Fix 3 — `text_to_video.rs` timeout wrappers (7 send_message)

### Problem
`text_to_video.rs` contained a three-step FSM for collecting a prompt, selecting a model (Kling/Runway/Sora/Luma), and selecting a duration before dispatch. All 7 `bot.send_message` calls were bare.

### Changes
- Added `send_message_timeout` to the import block.
- Wrapped all 7 `bot.send_message` calls with `send_message_timeout`.
- Covered: entry prompt, prompt length validation, model selection keyboard, duration selection keyboard, session expiry error, retry prompt, done main_menu keyboard.

---

## Verification

- `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — **passed with zero warnings**.
- **Zero bare `dialogue.update` calls remain** across all scene handlers.
- No user-facing behavioral changes.

---

## Metrics

| Metric | Before Wave 202 | After Wave 202 | Delta |
|---|---|---|---|
| Bare `dialogue.update` calls | 0 | 0 | 0 |
| Bare `bot.send_message` calls | 35 | 12 | −23 (−66%) |
| Files with bare send_message | 7 | 4 | −3 |

---

## Remaining Work

- 4 files with 12 bare `bot.send_message` calls:
  - `lip_sync.rs` — 6 calls
  - `tech_support.rs` — 3 calls
  - `neuro_coder.rs` — 2 calls
  - `invite.rs` — 1 call

---

## Cooperation Variants for Wave 203

### Variant A — Finish remaining `bot.send_message` migration (12 calls across 4 files)
Complete the `send_message_timeout` migration for the remaining 12 bare `bot.send_message` calls in `lip_sync.rs`, `tech_support.rs`, `neuro_coder.rs`, and `invite.rs`. This closes the entire Telegram API timeout wrapper workstream. The `lip_sync.rs` file has the most remaining calls (6) and should be the primary focus.

### Variant B — Shift to provider response body cap audit
Pivot to a new hardening theme: enforce maximum response body length caps across all AI provider call sites (success and error paths). This addresses the risk of memory exhaustion from unexpectedly large provider responses and aligns with the streaming-byte-cap pattern already established in the codebase.

### Variant C — Shift to input validation guard audit
Pivot to a new hardening theme: audit all scene handlers for missing input validation guards (length caps, empty checks, character filters) on user-provided text fields. Many handlers already have validation, but a systematic audit may reveal gaps in newer or less-frequently-used flows.

**Recommendation:** Variant A — finish what we started. The `send_message_timeout` workstream is 80% complete (93 of 105 calls wrapped); completing the remaining 12 calls provides a clean closure before shifting to a new theme in Wave 204.
