# Wave 235 Security Plan

**Date:** 2026-06-16
**Theme:** Media input validation — photo size caps in remaining scene handlers

---

## Fix 1: Add photo size validation in `avatar_transform.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/avatar_transform.rs`

**Problem:** `handle_avatar_transform_msg` step 2 accepts a photo via `msg.photo()` without checking file size. A user could upload an oversized image, causing OOM or storage exhaustion.

**Solution:**
- Add `const MAX_AVATAR_TRANSFORM_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 2, after extracting the photo, check `photo.file.size as u64 > MAX_AVATAR_TRANSFORM_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 2: Add photo size validation in `morphing.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/morphing.rs`

**Problem:** `handle_morphing_msg` step 1 accepts multiple photos via `msg.photo()` without checking file size. It already limits the count to `MAX_MORPHING_IMAGES` (10), but each individual image can be arbitrarily large, compounding the storage risk.

**Solution:**
- Add `const MAX_MORPHING_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, check `photo.file.size as u64 > MAX_MORPHING_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 3: Add photo size validation in `image_to_prompt.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/image_to_prompt.rs`

**Problem:** `handle_image_to_prompt_msg` step 1 accepts a photo via `msg.photo()` without checking file size. Same DoS/storage risk as other photo handlers.

**Solution:**
- Add `const MAX_IMAGE_TO_PROMPT_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, check `photo.file.size as u64 > MAX_IMAGE_TO_PROMPT_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00`
- [ ] No new warnings
- [ ] Each fix is isolated in its own commit (or all in one wave commit)
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Finish remaining photo handler size caps
Add size caps to `digital_avatar_body.rs`, `flux_kontext.rs`, `image_to_video.rs`, and `train_flux_model.rs`.

### Variant B — Provider base URL externalization
Audit `heygen.rs`, `hedra.rs`, `elevenlabs.rs` for hardcoded `base_url` strings that should be externalized to env vars.

### Variant C — Multi-photo batch size hardening in `train_flux_model.rs`
Add per-image size caps in `train_flux_model.rs` (currently only limits count to 20, not individual file sizes).
