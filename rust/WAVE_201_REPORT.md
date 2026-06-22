# Wave 201 Report

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

## Fix 1 — `music_generation.rs` + `remove_bg.rs` timeout wrappers (2+1 dialogue.update + 11 send_message)

### Problem
`music_generation.rs` contained a two-step FSM for collecting a music prompt and selecting a model (Suno/Udio). `remove_bg.rs` contained a two-step FSM for collecting an image and dispatching background removal. All `dialogue.update` and `bot.send_message` calls were bare.

### Changes
- Added `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};` to both files.
- Wrapped all 2+1 `dialogue.update` calls with `dialogue_update_timeout`.
- Wrapped all `bot.send_message` calls with `send_message_timeout`:
  - `music_generation.rs`: intro back_cancel keyboard, prompt length validation, model selection inline keyboard, callback missing-prompt error, callback balance-deduction error
  - `remove_bg.rs`: intro back_cancel keyboard, image retrieval error, balance deduction error, "send photo" error

---

## Fix 2 — `ai_reels.rs` + `fal_render.rs` timeout wrappers (2+1 dialogue.update + 12 send_message)

### Problem
`ai_reels.rs` contained a two-step FSM for collecting a video prompt and selecting a style (cinematic/anime/realistic). `fal_render.rs` contained a two-step FSM for collecting a prompt and dispatching a Fal.ai render. All `dialogue.update` and `bot.send_message` calls were bare.

### Changes
- Added imports and wrapped all 2+1 `dialogue.update` calls.
- Wrapped all `bot.send_message` calls in both files:
  - `ai_reels.rs`: intro back_cancel keyboard, empty prompt validation, prompt length validation, style selection inline keyboard, non-text error, callback missing-prompt error, callback balance-deduction error
  - `fal_render.rs`: intro back_cancel keyboard, empty prompt validation, prompt length validation, balance deduction error, non-text error

---

## Fix 3 — `hedra_render.rs` + `heygen_render.rs` timeout wrappers (2+2 dialogue.update + 15 send_message)

### Problem
`hedra_render.rs` contained a three-step FSM for collecting an image and either text or voice for animation. `heygen_render.rs` contained a three-step FSM for collecting an avatar ID and text for HeyGen speech rendering. All `dialogue.update` and `bot.send_message` calls were bare.

### Changes
- Added imports and wrapped all 2+2 `dialogue.update` calls.
- Wrapped all `bot.send_message` calls in both files:
  - `hedra_render.rs`: intro back_cancel keyboard, image retrieval error, image confirmation + text/voice request, non-image error, text empty validation, text length validation, text balance deduction error, voice balance deduction error, non-text/voice error
  - `heygen_render.rs`: intro back_cancel keyboard, avatar ID empty validation, avatar ID length validation, avatar ID confirmation + text request, non-text error, text empty validation, text length validation, text balance deduction error, non-text error

---

## Verification

- `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — **passed with zero warnings**.
- **Zero bare `dialogue.update` calls remain** across all scene handlers.
- No user-facing behavioral changes.

---

## Metrics

| Metric | Before Wave 201 | After Wave 201 | Delta |
|---|---|---|---|
| Bare `dialogue.update` calls | 10 | **0** | −10 (−100%) |
| Bare `bot.send_message` calls | 74 | 35 | −39 (−53%) |
| Files with bare dialogue.update | 6 | **0** | −6 |

---

## Milestone: Dialogue Timeout Migration Complete

After 8 waves (Waves 194–201), the `dialogue.update` → `dialogue_update_timeout` migration is **fully complete**:
- **Waves 194–196:** Initial migration in simple handlers
- **Wave 197:** 15 scene handlers wrapped
- **Wave 198:** Complex multi-step handlers (train_flux_model, morphing, avatar_transform)
- **Wave 199:** 5 media/AI handlers (ai_cover, voice_training, image_to_video, flux_kontext, avatar_brain)
- **Wave 200:** 3 AI render dispatch handlers (digital_avatar_body, face_swap, ai_photoshop)
- **Wave 201:** Final 6 handlers (music_generation, remove_bg, ai_reels, fal_render, hedra_render, heygen_render)

Total: **~175 dialogue.update calls wrapped** across **~40 handler files**.

---

## Remaining Work

- **35 bare `bot.send_message` calls** remain across scene handlers. These are primarily:
  - Callback handler error replies in already-wrapped files
  - Simple one-off messages that do not affect FSM state
- Next workstream options: bulk `send_message_timeout` migration, or pivot to a new hardening theme.

---

## Cooperation Variants for Wave 202

### Variant A — Bulk migrate remaining 35 `bot.send_message` calls
Complete the `send_message_timeout` migration for the remaining 35 bare `bot.send_message` calls. This closes the entire Telegram API timeout wrapper workstream. The calls are spread across ~15 files, many with only 1–2 calls each, making this feasible in a single wave.

### Variant B — Shift to provider response body cap audit
Pivot to a new hardening theme: enforce maximum response body length caps across all AI provider call sites (success and error paths). This addresses the risk of memory exhaustion from unexpectedly large provider responses and aligns with the streaming-byte-cap pattern already established in the codebase.

### Variant C — Shift to database query timeout audit
Pivot to a new hardening theme: audit all database query sites in `GOLD-RING-TR00` and `GOLD-RING-DB00` for missing query timeouts. Long-running or stuck DB queries can exhaust connection pools and cause cascading failures. This is a defensive-depth measure complementing the Telegram API timeout work.

**Recommendation:** Variant A — finish what we started. The `send_message_timeout` workstream is 67% complete (70 of 105 calls wrapped); completing the remaining 35 calls provides a clean closure before shifting to a new theme in Wave 203.
