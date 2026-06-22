# Wave 234 Security Report

**Date:** 2026-06-16
**Scope:** Media input validation — voice/audio and photo size caps in scene handlers
**Fixes delivered:** 3

---

## Fix 1 — Voice/audio size validation in `voice_training.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/voice_training.rs`

**Problem:** `handle_voice_training_msg` accepted audio/voice messages in step 1 but only validated duration (30–180 seconds). It did not check file size, so a malicious user could upload an oversized audio file, causing storage exhaustion or degraded service.

**Solution:**
- Added `const MAX_VOICE_TRAINING_AUDIO_BYTES: u64 = 50 * 1024 * 1024;`
- Refactored step 1 extraction to collect `file_id`, `duration`, and `size` for both `msg.audio()` and `msg.voice()` branches.
- Added a size check `size > MAX_VOICE_TRAINING_AUDIO_BYTES` before the duration check.
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 234 commit.

---

## Fix 2 — Voice/audio size validation in `voice_avatar.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/voice_avatar.rs`

**Problem:** `handle_voice_avatar_msg` accepted voice messages in step 1 without any file size or duration validation. A user could upload an oversized voice/audio file.

**Solution:**
- Added `const MAX_VOICE_AVATAR_AUDIO_BYTES: u64 = 50 * 1024 * 1024;`
- Refactored step 1 extraction to collect `file_id` and `size` for both `msg.voice()` and `msg.audio()` branches.
- Added a size check `size > MAX_VOICE_AVATAR_AUDIO_BYTES` before storing the audio.
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 234 commit.

---

## Fix 3 — Photo size validation in `image_upscaler.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/image_upscaler.rs`

**Problem:** `handle_image_upscaler_msg` step 1 accepted a photo via `msg.photo()` without checking file size. Same DoS/storage risk as previous photo handlers.

**Solution:**
- Added `const MAX_UPSCALER_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, checked `photo.file.size as u64 > MAX_UPSCALER_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 234 commit.

---

## Verification

- `cargo check -p trios-mb-scenes` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Extend media size validation to remaining photo handlers
Add size caps to `avatar_transform.rs`, `digital_avatar_body.rs`, `flux_kontext.rs`, `image_to_prompt.rs`, `image_to_video.rs`, `morphing.rs`, and `train_flux_model.rs`.

### Variant B — Provider hardcoded model externalization sweep
Audit `heygen.rs`, `elevenlabs.rs`, `hedra.rs`, `midjourney.rs`, `kie.rs`, `openai.rs` for hardcoded model names or version strings that should be externalized to env vars.

### Variant C — Input length and prompt guards sweep
Audit all scene handlers for missing `text.trim().is_empty()` guards, missing `MAX_DIALOGUE_TEXT_LEN` checks, or missing cancel-keyword exact-match guards.
