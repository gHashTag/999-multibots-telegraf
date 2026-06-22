# Wave 234 Security Plan

**Date:** 2026-06-16
**Theme:** Media input validation — voice/audio and photo size caps

---

## Fix 1: Add voice/audio size validation in `voice_training.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/voice_training.rs`

**Problem:** `handle_voice_training_msg` accepts audio/voice messages in step 1 but only validates duration (30–180 seconds). It does not check file size, so a malicious user could upload an oversized audio file, causing storage exhaustion or degraded service.

**Solution:**
- Add `const MAX_VOICE_TRAINING_AUDIO_BYTES: u64 = 50 * 1024 * 1024;`
- When extracting `audio` or `voice` in step 1, check `file.size as u64 > MAX_VOICE_TRAINING_AUDIO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 2: Add voice/audio size validation in `voice_avatar.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/voice_avatar.rs`

**Problem:** `handle_voice_avatar_msg` accepts voice messages in step 1 without any file size or duration validation. A user could upload an oversized voice/audio file.

**Solution:**
- Add `const MAX_VOICE_AVATAR_AUDIO_BYTES: u64 = 50 * 1024 * 1024;`
- When extracting `voice` or `audio` in step 1, check `file.size as u64 > MAX_VOICE_AVATAR_AUDIO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 3: Add photo size validation in `image_upscaler.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/image_upscaler.rs`

**Problem:** `handle_image_upscaler_msg` step 1 accepts a photo via `msg.photo()` without checking file size. Same DoS/storage risk as previous photo handlers.

**Solution:**
- Add `const MAX_UPSCALER_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, check `photo.file.size as u64 > MAX_UPSCALER_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00`
- [ ] No new warnings
- [ ] Each fix is isolated in its own commit (or all in one wave commit)
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Extend media size validation to remaining photo handlers
Add size caps to `avatar_transform.rs`, `digital_avatar_body.rs`, `flux_kontext.rs`, `image_to_prompt.rs`, `image_to_video.rs`, `morphing.rs`, and `train_flux_model.rs`.

### Variant B — Provider hardcoded model externalization sweep
Audit `heygen.rs`, `elevenlabs.rs`, `hedra.rs`, `midjourney.rs`, `kie.rs`, `openai.rs` for hardcoded model names or version strings that should be externalized to env vars.

### Variant C — Input length and prompt guards sweep
Audit all scene handlers for missing `text.trim().is_empty()` guards, missing `MAX_DIALOGUE_TEXT_LEN` checks, or missing cancel-keyword exact-match guards.
