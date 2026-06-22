# Wave 197 Implementation Plan

**Theme:** Continue dialogue/bot timeout wrapper migration in simple scene handlers + eliminate `unused_assignments` compiler warnings.

**Date:** 2026-06-16

---

## Research Summary

- **63 remaining bare `dialogue.update` calls** across `rings/SILVER-RING-SN00/src/` (down from ~80+ after Wave 196).
- **203 remaining bare `bot.send_message` calls** across the same directory.
- **4 compiler warnings** in `trios-mb-scenes` lib: 3 in `select_model.rs`, 1 in `email.rs` — all `unused_assignments` / `unused_variables`.
- The centralized `dialogue_update_timeout` and `send_message_timeout` helpers are proven, stable, and already used in `handlers.rs` and generation utilities.

---

## Fix 1 — `dialogue_update_timeout` wrappers in simple scene handlers (17 calls)

Target files with exactly 1–2 bare `dialogue.update` calls. These are the simplest handlers (entry/greeting or lightweight callbacks), making them the fastest to migrate safely.

**Files:**
1. `menu.rs` — 1 call (line 22)
2. `change_language.rs` — 1 call (line 38)
3. `balance.rs` — 1 call (line 42)
4. `help.rs` — 1 call (line 20)
5. `voice_avatar.rs` — 1 call
6. `video_transcription.rs` — 1 call
7. `text_to_speech.rs` — 1 call
8. `image_upscaler.rs` — 1 call
9. `improve_prompt.rs` — 1 call
10. `chat_with_avatar.rs` — 1 call
11. `image_to_prompt.rs` — 1 call
12. `size.rs` — 2 calls (msg + callback)
13. `video_duration.rs` — 2 calls (msg + callback)
14. `select_model.rs` — 1 call (line 45)
15. `email.rs` — 1 call (line 83)

**Steps per file:**
1. Add `use trios_mb_tg::dialogue_update_timeout;` to imports.
2. Replace every `dialogue.update(Scene::...).await?` with `dialogue_update_timeout(&dialogue, Scene::...).await?`.

---

## Fix 2 — `send_message_timeout` wrappers in the same 15 files (~35 calls)

Every `bot.send_message(chat_id, text)` and `bot.send_message(chat_id, text).reply_markup(kb)` in the Fix 1 file set gets replaced with `send_message_timeout(&bot, chat_id, text, None)` or `send_message_timeout(&bot, chat_id, text, Some(kb.into()))`.

**Files:** same 15 as Fix 1.

**Steps per file:**
1. Add `use trios_mb_tg::send_message_timeout;` if not already imported.
2. Replace bare `bot.send_message(...)` calls with the helper.
3. For calls with `.reply_markup(kb)`, pass `Some(kb.into())`.

---

## Fix 3 — Eliminate `unused_assignments` / `unused_variables` warnings in `select_model.rs` and `email.rs`

### `select_model.rs`
- **Warning:** `mut state: SelectModelState` at line 56 (callback handler) is unused — the callback mutates `state.selected_model` at line 84 but never persists the state to the dialogue. The model is already saved to the DB via `db.update_user_model()`.
- **Fix:** Remove `mut` from `state` in `handle_select_model_callback` and remove the unused `state.selected_model = Some(...)` assignment.

### `email.rs`
- **Warning:** `state.email = Some(email.to_string())` at line 100 is assigned but never read. The function returns via `return_to_menu` which resets the scene to `MainMenu`, discarding the mutated state. There is no DB persistence call for the email.
- **Fix:** Remove the `state.email = Some(...)` assignment. The `email` local variable is sufficient for the confirmation message. This closes the warning without redesigning the feature (adding a DB method is out of scope for a single wave).

---

## Verification

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — must pass with **zero new warnings**.
2. Confirm the 4 existing warnings are resolved.
3. No user-facing behavioral changes.

---

## Deferred

- Files with 3+ `dialogue.update` calls (`train_flux_model.rs`, `morphing.rs`, `avatar_transform.rs`, `ai_cover.rs`, `voice_training.rs`, `image_to_video.rs`, `flux_kontext.rs`, `avatar_brain.rs`, `ai_reels.rs`, `face_swap.rs`, `hedra_render.rs`, `heygen_render.rs`, `digital_avatar_body.rs`, `music_generation.rs`, `ai_photoshop.rs`, `fal_render.rs`, `remove_bg.rs`) → Wave 198/199.
- Remaining bare `bot.send_message` in the deferred file set.
- `dialogue_exit_timeout` in per-scene cancellation branches (already handled centrally in `handlers.rs`, but some scenes have custom `sm:cancel` or similar branches that reset to MainMenu without the helper).
