# Wave 200 Implementation Plan

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

## Research Summary

- **16 remaining bare `dialogue.update` calls** across 8 files.
- **93 remaining bare `bot.send_message` calls** across those files.
- Files by remaining call count:
  - `digital_avatar_body.rs` — 2 calls (body style selection + face photo dispatch)
  - `face_swap.rs` — 2 calls (two-photo collection + balance deduction + dispatch)
  - `ai_photoshop.rs` — 2 calls (image collection + prompt + balance deduction + dispatch)
  - Then 6 files with 2 or 1 calls each

---

## Fix 1 — `digital_avatar_body.rs` timeout wrappers (2 dialogue.update + 5 send_message)

### Problem
`digital_avatar_body.rs` contains a two-step FSM for selecting a body style and uploading a face photo for digital avatar generation. Both `dialogue.update` calls and all `bot.send_message` calls are bare.

### Changes
- Add `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};`.
- Wrap both `dialogue.update` calls with `dialogue_update_timeout`.
- Wrap all `bot.send_message` calls with `send_message_timeout`.

---

## Fix 2 — `face_swap.rs` timeout wrappers (2 dialogue.update + 7 send_message)

### Problem
`face_swap.rs` contains a three-step FSM for collecting two photos and dispatching a face-swap job. Both `dialogue.update` calls and all `bot.send_message` calls are bare.

### Changes
- Add imports and wrap both `dialogue.update` calls.
- Wrap all `bot.send_message` calls including back_cancel keyboard, error replies, balance deduction, and dispatch flow.

---

## Fix 3 — `ai_photoshop.rs` timeout wrappers (2 dialogue.update + 7 send_message)

### Problem
`ai_photoshop.rs` contains a three-step FSM for collecting an image, collecting an edit prompt, and dispatching an AI Photoshop job. Both `dialogue.update` calls and all `bot.send_message` calls are bare.

### Changes
- Add imports and wrap both `dialogue.update` calls.
- Wrap all `bot.send_message` calls including back_cancel keyboard, error replies, validation, balance deduction, and dispatch flow.

---

## Verification

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — must pass with **zero warnings**.
2. No user-facing behavioral changes.

---

## Deferred

- `music_generation.rs`, `heygen_render.rs`, `hedra_render.rs`, `ai_reels.rs` — 2 calls each (8 total).
- `fal_render.rs`, `remove_bg.rs` — 1 call each (2 total).
- Remaining 93 bare `bot.send_message` calls.
