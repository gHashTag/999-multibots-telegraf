# Wave 199 Implementation Plan

**Theme:** Continue dialogue/bot timeout wrapper migration in audio/image collection and AI render dispatch handlers.

**Date:** 2026-06-16

---

## Literature Review

### Academic Reference
**Reliable State Machines: A Framework for Programming Reliable Cloud Services** (Mukherjee et al., ECOOP 2019) — [PDF](https://drops.dagstuhl.de/storage/00lipics/lipics-vol134-ecoop2019/LIPIcs.ECOOP.2019.18/LIPIcs.ECOOP.2019.18.pdf)

This paper formalizes "Reliable State Machines" (RSMs) where each unit is a fault-tolerant communicating state machine. Key insights applicable to our Telegram bot handlers:
- **Failure Transparency Theorem:** Failure-prone semantics refine failure-free semantics, meaning programmers can reason about state machines as if they never crash.
- **Exactly-once delivery:** Persistent inboxes/outboxes ensure no message is lost during failover — analogous to our `dialogue_update_timeout` ensuring no state transition is silently dropped.
- **Atomic commit of state + outbox:** State mutations and side effects must be atomic — our timeout wrappers ensure that if a Telegram API call fails, the state transition is still attempted (or logged) rather than leaving the system in an inconsistent state.

### Engineering Reference
**Harden-Telegram Design Spec** ([idvorkin/chop-conventions](https://github.com/idvorkin/chop-conventions/blob/main/skills/harden-telegram/design.md))

Production patterns for Telegram bot resilience:
- **Durable polling loop:** Separates persistent poller from ephemeral bridge, using SQLite WAL for at-least-once delivery.
- **Exponential backoff with jitter:** Bounded retry semantics for 429 rate-limit errors.
- **Singleton enforcement:** `flock` + PID file prevents stale/crashed pollers from running concurrently.

---

## Research Summary

- **32 remaining bare `dialogue.update` calls** across `rings/SILVER-RING-SN00/src/`.
- **133 remaining bare `bot.send_message` calls** across the same directory.
- Files by remaining call count:
  - `ai_cover.rs` — 4 calls (audio collection + AI cover flow)
  - `voice_training.rs` — 3 calls (audio training flow)
  - `image_to_video.rs` — 3 calls (image-to-video flow)
  - `flux_kontext.rs` — 3 calls (FLUX Kontext render flow)
  - `avatar_brain.rs` — 3 calls (avatar brain render flow)
  - Then 7 files with 2 calls each

---

## Fix 1 — `ai_cover.rs` timeout wrappers (4 dialogue.update + ~8 send_message)

### Problem
`ai_cover.rs` contains a multi-step FSM for collecting audio files and generating AI covers. All 4 `dialogue.update` calls and all `bot.send_message` calls are bare.

### Changes
- Add `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};`.
- Wrap all 4 `dialogue.update` calls with `dialogue_update_timeout`.
- Wrap all `bot.send_message` calls with `send_message_timeout`.

---

## Fix 2 — `voice_training.rs` + `image_to_video.rs` timeout wrappers (3+3 dialogue.update + ~12 send_message)

### Problem
Both files contain multi-step FSMs for media collection (`voice_training.rs` collects audio for voice cloning; `image_to_video.rs` collects images for video generation). All `dialogue.update` and `bot.send_message` calls are bare.

### Changes
- Add imports and wrap all 3+3 `dialogue.update` calls.
- Wrap all `bot.send_message` calls in both files.

---

## Fix 3 — `flux_kontext.rs` + `avatar_brain.rs` timeout wrappers (3+3 dialogue.update + ~10 send_message)

### Problem
Both files are AI render dispatch handlers with callback-based model selection and dispatch. All `dialogue.update` and `bot.send_message` calls are bare.

### Changes
- Add imports and wrap all 3+3 `dialogue.update` calls.
- Wrap all `bot.send_message` calls in both files.

---

## Verification

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — must pass with **zero warnings**.
2. No user-facing behavioral changes.

---

## Deferred

- `music_generation.rs`, `heygen_render.rs`, `hedra_render.rs`, `face_swap.rs`, `digital_avatar_body.rs`, `ai_reels.rs`, `ai_photoshop.rs` — 2 calls each (14 total).
- `remove_bg.rs`, `fal_render.rs` — 1 call each.
- Remaining 133 bare `bot.send_message` calls (will be reduced by ~30 in this wave).
