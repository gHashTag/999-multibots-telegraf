# Wave 198 Implementation Plan

**Theme:** Continue dialogue/bot timeout wrapper migration in complex multi-step scene handlers.

**Date:** 2026-06-16

---

## Research Summary

- **46 remaining bare `dialogue.update` calls** across `rings/SILVER-RING-SN00/src/`.
- **167 remaining bare `bot.send_message` calls** across the same directory.
- Largest remaining files:
  - `train_flux_model.rs` — 5 bare `dialogue.update` calls (multi-step image collection + training flow)
  - `morphing.rs` — 5 bare `dialogue.update` calls (multi-step image collection + morphing flow)
  - `avatar_transform.rs` — 4 bare `dialogue.update` calls (hero selection + photo flow)
  - `ai_cover.rs` — 4 bare `dialogue.update` calls (audio collection + cover flow)
  - `voice_training.rs`, `image_to_video.rs`, `flux_kontext.rs`, `avatar_brain.rs` — 3 each

These files contain complex multi-step FSM handlers with image/audio collection, inline keyboards, and branching logic. They are the highest-risk files for state-loss during Telegram API stalls.

---

## Fix 1 — `train_flux_model.rs` timeout wrappers (5 dialogue.update + ~12 send_message)

### Problem
`train_flux_model.rs` contains a 4-step FSM for collecting training images, trigger word, and model name. All 5 `dialogue.update` calls and all `bot.send_message` calls are bare, risking indefinite blocking during any step transition.

### Changes
- Add `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};`.
- Wrap all 5 `dialogue.update(...)` calls with `dialogue_update_timeout`:
  - `handle_train_flux_model_msg`: step 0 (line 37), step 1 (line 86), step 1 text branch (line 92), step 2 (line 109)
  - `handle_train_flux_model_callback`: "tf:done_upload" (line 186)
- Wrap all `bot.send_message` calls with `send_message_timeout`.

---

## Fix 2 — `morphing.rs` timeout wrappers (5 dialogue.update + ~15 send_message)

### Problem
`morphing.rs` contains a multi-step FSM for collecting images and selecting morphing options. All 5 `dialogue.update` calls and all `bot.send_message` calls are bare. This handler also has a duplicate `#[tracing::instrument(skip_all)]` attribute.

### Changes
- Add `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};`.
- Wrap all 5 `dialogue.update(...)` calls with `dialogue_update_timeout`:
  - `handle_morphing_msg`: step 0 (line 39), step 1 image branch (line 92)
  - `handle_morphing_callback`: "mor:generate" (line 168), "mor:loop" | "mor:linear" (line 182), "mor:back_upload" (line 188)
- Wrap all `bot.send_message` calls with `send_message_timeout`.
- Remove duplicate `#[tracing::instrument(skip_all)]` on both functions.

---

## Fix 3 — `avatar_transform.rs` timeout wrappers (4 dialogue.update + ~8 send_message)

### Problem
`avatar_transform.rs` contains a 3-step FSM for selecting a superhero and uploading a photo. All 4 `dialogue.update` calls and all `bot.send_message` calls are bare.

### Changes
- Add `use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};`.
- Wrap all 4 `dialogue.update(...)` calls with `dialogue_update_timeout`:
  - `handle_avatar_transform_msg`: step 0 (line 62), step 1 (line 75), step 2 (implicit via `return_to_menu` from `dispatch_and_reply`)
  - `handle_avatar_transform_callback`: "at:custom" (line 156), "at:*" hero branch (line 172)
- Wrap all `bot.send_message` calls with `send_message_timeout`.

---

## Verification

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — must pass with **zero warnings**.
2. No user-facing behavioral changes.

---

## Deferred

- `ai_cover.rs` — 4 remaining `dialogue.update` calls.
- `voice_training.rs`, `image_to_video.rs`, `flux_kontext.rs`, `avatar_brain.rs` — 3 each.
- `music_generation.rs`, `heygen_render.rs`, `hedra_render.rs`, `face_swap.rs`, `digital_avatar_body.rs`, `ai_reels.rs`, `ai_photoshop.rs` — 2 each.
- `remove_bg.rs`, `fal_render.rs` — 1 each.
- Remaining 167 bare `bot.send_message` calls across deferred files.
