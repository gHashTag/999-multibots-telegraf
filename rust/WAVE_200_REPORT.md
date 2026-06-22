# Wave 200 Report

**Theme:** Complete dialogue/bot timeout wrapper migration in AI render dispatch handlers.

**Date:** 2026-06-16

---

## Literature Review

### Academic Reference
**TFix+: Self-configuring Hybrid Timeout Bug Fixing for Cloud Systems** (Zhang et al., IEEE/ACM 2021) — [arXiv](https://ar5iv.labs.arxiv.org/html/2110.04101)

This paper analyzes timeout bugs in large-scale cloud systems (Hadoop, HDFS, Yarn, HBase, MapReduce). Key findings:
- **78% of production timeout bugs** stem from missing timeouts or misconfigured values.
- **Self-configuring timeout primitives:** Runtime history should inform timeout values rather than hard-coding them.
- **Hybrid static/dynamic analysis:** Static taint analysis finds missing-timeout code paths; runtime tracing validates whether the timeout is actually triggered.

For our Telegram bot handlers, this confirms that centralized timeout helpers (like `send_message_timeout` and `dialogue_update_timeout`) are a necessity, not a luxury — and that every bare API call is a latent timeout bug.

### Engineering Reference
**Method Overloading the Circuit** (ACM SoCC 2022) — [PDF](https://christophermeiklejohn.com/publications/socc2022-preprint.pdf)

This paper studies circuit-breaker designs in microservices (Netflix/Hystrix, Envoy, DoorDash). Key insight:
- **Fine-grained wrapper scoping:** Wrapping RPCs at the method/path level (rather than per-service) prevents over-tripping and cascading failures.
- **API-call wrappers as resilience primitives:** Timeouts, retries, and circuit breakers should be treated as first-class infrastructure around every external API boundary.

---

## Fix 1 — `digital_avatar_body.rs` timeout wrappers (2 dialogue.update + 5 send_message)

### Problem
`digital_avatar_body.rs` contained a two-step FSM for selecting a body style and uploading a face photo for digital avatar generation. Both `dialogue.update` calls and all `bot.send_message` calls were bare.

### Changes
- Added `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};`.
- Wrapped both `dialogue.update` calls with `dialogue_update_timeout`.
- Wrapped all `bot.send_message` calls with `send_message_timeout`:
  - Model selection keyboard with inline buttons (business/creative/sporty/cancel)
  - Image retrieval error reply
  - Face photo request prompt
  - Callback style selection + face photo prompt

---

## Fix 2 — `face_swap.rs` timeout wrappers (2 dialogue.update + 7 send_message)

### Problem
`face_swap.rs` contained a three-step FSM for collecting two photos and dispatching a face-swap job. Both `dialogue.update` calls and all `bot.send_message` calls were bare.

### Changes
- Added imports and wrapped both `dialogue.update` calls.
- Wrapped all `bot.send_message` calls:
  - Intro message with `back_cancel_keyboard`
  - Two image retrieval error replies (step 1 and step 2)
  - First photo confirmation + second photo request
  - Two "send photo" error replies (step 1 and step 2)
  - Balance deduction error reply

---

## Fix 3 — `ai_photoshop.rs` timeout wrappers (2 dialogue.update + 7 send_message)

### Problem
`ai_photoshop.rs` contained a three-step FSM for collecting an image, collecting an edit prompt, and dispatching an AI Photoshop job. Both `dialogue.update` calls and all `bot.send_message` calls were bare.

### Changes
- Added imports and wrapped both `dialogue.update` calls.
- Wrapped all `bot.send_message` calls:
  - Intro message with `back_cancel_keyboard`
  - Image retrieval error reply
  - Image confirmation + prompt request
  - "Send image" error reply
  - Empty prompt validation error
  - Prompt length validation error
  - Balance deduction error reply
  - "Enter prompt" error reply (non-text input)

---

## Verification

- `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — **passed with zero warnings**.
- No user-facing behavioral changes.

---

## Metrics

| Metric | Before Wave 200 | After Wave 200 | Delta |
|---|---|---|---|
| Bare `dialogue.update` calls | 16 | 10 | −6 (−38%) |
| Bare `bot.send_message` calls | 93 | 74 | −19 (−20%) |
| Files with bare dialogue.update | 8 | 5 | −3 |

---

## Remaining Work

- 5 files with 2 calls each: `music_generation.rs`, `heygen_render.rs`, `hedra_render.rs`, `ai_reels.rs` (8 total)
- 2 files with 1 call each: `fal_render.rs`, `remove_bg.rs` (2 total)
- 74 remaining bare `bot.send_message` calls

---

## Cooperation Variants for Wave 201

### Variant A — Finish remaining dialogue.update migration (10 calls across 5 files)
Complete the remaining 10 bare `dialogue.update` calls in `music_generation.rs`, `heygen_render.rs`, `hedra_render.rs`, `ai_reels.rs`, `fal_render.rs`, and `remove_bg.rs`. This closes the dialogue timeout workstream entirely and shifts focus to other hardening areas in Wave 202.

### Variant B — Mixed: finish dialogue.update + start send_message bulk migration in payment/admin flows
Complete the remaining 10 `dialogue.update` calls, then begin bulk-migrating the 74 remaining `bot.send_message` calls in the highest-risk handlers (payment-adjacent and admin flows). Slightly larger scope but closes two workstreams faster.

### Variant C — Shift to a new hardening theme (provider response body caps or DB timeout audit)
Pause the Telegram timeout work (already 91% complete for dialogue.update) and pivot to the next security theme identified in research, such as:
- Webhook response body length caps across provider call sites
- Database query timeout audit in `GOLD-RING-TR00`
- Input validation guards in remaining un-audited handlers

**Recommendation:** Variant A — the dialogue.update workstream is 91% complete; finishing it in one wave provides a clean milestone before shifting themes.
