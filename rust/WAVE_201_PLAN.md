# Wave 201 Implementation Plan

**Theme:** Complete the dialogue/bot timeout wrapper migration — final 10 bare `dialogue.update` calls across 6 AI render dispatch handlers.

**Date:** 2026-06-16

---

## Literature Review

### Academic Reference
**PALADIN: Self-Correcting Language Model Agents to Cure Tool-Failure Cases** (Vuddanti et al., OpenReview forthcoming) — [PDF](https://openreview.net/attachment?id=NVTtoO297p&name=pdf)

This paper systematically injects realistic runtime failures — API timeouts, malformed outputs, silent failures — into LLM-based agents. Key findings:
- **Timeout bugs are the dominant failure mode:** Agents often deadlock or hang when external API calls stall.
- **Recovery-annotated trajectories:** Explicit recovery behaviors (diagnosis, replanning, retries, graceful termination) raise recovery rate from ~33% to ~90%.
- **Taxonomy-guided fault injection:** A structured taxonomy of failures (timeout, hang, malformed, dependency) is necessary for comprehensive hardening.

For our Telegram bot handlers, this validates that wrapping every external API call (Telegram `send_message`, `dialogue.update`) with a hard timeout is not optional — it is the primary defense against deadlock and state corruption.

### Engineering Reference
**ChaosLLM: A Dependability Testing Approach for Tool-calling Agents** (Iannillo, IEEE ISSRE 2025 Workshops) — [PDF](https://orbilu.uni.lu/bitstream/10993/67676/1/ISSRE2025_Iannillo.pdf)

This paper introduces a fault-injection middleware for LLM agents that emulates realistic system-level faults. Key insight:
- **Slow Response and Non-Responsive (Hang) failure classes** map directly to timeout bugs.
- Current agents often deadlock or time out when tools hang, motivating better watchdog/timeout logic.
- Dependability metrics (Task Success Rate, Timeout Ratio) should be measured under fault injection.

---

## Research Summary

- **10 remaining bare `dialogue.update` calls** across 6 files.
- **74 remaining bare `bot.send_message` calls** across those files.
- Files by remaining call count:
  - `hedra_render.rs` — 2 calls (image + text/voice animation dispatch)
  - `heygen_render.rs` — 2 calls (avatar ID + text speech dispatch)
  - `music_generation.rs` — 2 calls (prompt + model selection dispatch)
  - `ai_reels.rs` — 2 calls (prompt + style selection dispatch)
  - `remove_bg.rs` — 1 call (image upload + background removal dispatch)
  - `fal_render.rs` — 1 call (prompt + Fal.ai render dispatch)

---

## Fix 1 — `music_generation.rs` + `remove_bg.rs` timeout wrappers (2+1 dialogue.update + ~11 send_message)

### Problem
`music_generation.rs` contains a two-step FSM for collecting a music prompt and selecting a model (Suno/Udio). `remove_bg.rs` contains a two-step FSM for collecting an image and dispatching background removal. All `dialogue.update` and `bot.send_message` calls are bare.

### Changes
- Add `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};` to both files.
- Wrap all 2+1 `dialogue.update` calls with `dialogue_update_timeout`.
- Wrap all `bot.send_message` calls with `send_message_timeout`.

---

## Fix 2 — `ai_reels.rs` + `fal_render.rs` timeout wrappers (2+1 dialogue.update + ~12 send_message)

### Problem
`ai_reels.rs` contains a two-step FSM for collecting a video prompt and selecting a style (cinematic/anime/realistic). `fal_render.rs` contains a two-step FSM for collecting a prompt and dispatching a Fal.ai render. All `dialogue.update` and `bot.send_message` calls are bare.

### Changes
- Add imports and wrap all 2+1 `dialogue.update` calls.
- Wrap all `bot.send_message` calls in both files including back_cancel keyboards, validation errors, balance deduction errors, and style selection keyboards.

---

## Fix 3 — `hedra_render.rs` + `heygen_render.rs` timeout wrappers (2+2 dialogue.update + ~15 send_message)

### Problem
`hedra_render.rs` contains a three-step FSM for collecting an image and either text or voice for animation. `heygen_render.rs` contains a three-step FSM for collecting an avatar ID and text for HeyGen speech rendering. All `dialogue.update` and `bot.send_message` calls are bare.

### Changes
- Add imports and wrap all 2+2 `dialogue.update` calls.
- Wrap all `bot.send_message` calls in both files including back_cancel keyboards, image retrieval errors, validation errors, balance deduction errors, and prompt requests.

---

## Verification

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — must pass with **zero warnings**.
2. No user-facing behavioral changes.

---

## Post-Wave 201 State

After this wave, **zero bare `dialogue.update` calls** will remain across all scene handlers. The `dialogue_update_timeout` migration workstream will be fully complete.

Remaining work:
- 74 bare `bot.send_message` calls across all handlers (next workstream).
