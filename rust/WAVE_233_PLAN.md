# Wave 233 Security Plan

**Date:** 2026-06-16
**Theme:** Input validation & configuration hardening — media size caps in photo handlers, provider model digest externalization

---

## Fix 1: Add photo size validation in `face_swap.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/face_swap.rs`

**Problem:** `handle_face_swap_msg` accepts photos in both step 1 (target photo) and step 2 (source photo) without checking file size. A user could upload oversized images in either step, causing OOM or storage exhaustion.

**Solution:**
- Add `const MAX_FACE_SWAP_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1 and step 2, after extracting the photo, check `photo.file.size as u64 > MAX_FACE_SWAP_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 2: Add photo size validation in `remove_bg.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/remove_bg.rs`

**Problem:** `handle_remove_bg_msg` step 1 accepts a photo via `msg.photo()` without checking file size. Same DoS/storage risk as Fix 1.

**Solution:**
- Add `const MAX_REMOVE_BG_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, check `photo.file.size as u64 > MAX_REMOVE_BG_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 3: Externalize hardcoded model IDs in `fal.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/fal.rs`

**Problem:** `resolve_model_id` contains 9 hardcoded model identifiers (`nano-banana-pro`, `veed-fabric`, `wan-2.5-t2v`, `wan-2.5-i2v`, `latentsync`, `hummingbird`, `flux-schnell`, `flux-pro`, `flux-dev`, `minimax-video`, `kling-video`). Hardcoded IDs require a code redeploy to rotate versions.

**Solution:**
- Add `std::sync::LazyLock<String>` constants for each model ID, sourcing from environment variables with sensible defaults preserving current values.
- Replace hardcoded strings in `resolve_model_id` with the new `LazyLock` references.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00` and `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Each fix is isolated in its own commit (or all in one wave commit)
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Extend media size validation to voice handlers
Audit `voice_avatar.rs` and `voice_training.rs` (and any other voice-accepting handlers) and add file size caps for voice/audio uploads.

### Variant B — Extend media size validation to remaining photo handlers
Add size caps to `avatar_transform.rs`, `digital_avatar_body.rs`, `flux_kontext.rs`, `image_to_prompt.rs`, `image_to_video.rs`, `image_upscaler.rs`, `morphing.rs`, and `train_flux_model.rs`.

### Variant C — Provider configuration externalization sweep
Audit other providers (`elevenlabs.rs`, `heygen.rs`, `openai.rs`, `hedra.rs`, `midjourney.rs`, `kie.rs`) for hardcoded API endpoints, model names, or version strings that should be externalized to env vars.
