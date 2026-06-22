# Wave 236 Security Plan

**Date:** 2026-06-16
**Theme:** Media input validation — final photo size caps in scene handlers

---

## Fix 1: Add photo size validation in `digital_avatar_body.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/digital_avatar_body.rs`

**Problem:** `handle_digital_avatar_body_msg` step 1 accepts a photo via `msg.photo()` without checking file size. A user could upload an oversized image, causing OOM or storage exhaustion.

**Solution:**
- Add `const MAX_DIGITAL_AVATAR_BODY_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, check `photo.file.size as u64 > MAX_DIGITAL_AVATAR_BODY_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 2: Add photo size validation in `image_to_video.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/image_to_video.rs`

**Problem:** `handle_image_to_video_msg` step 2 accepts a photo via `msg.photo()` without checking file size. Same DoS/storage risk.

**Solution:**
- Add `const MAX_IMAGE_TO_VIDEO_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 2, after extracting the photo, check `photo.file.size as u64 > MAX_IMAGE_TO_VIDEO_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 3: Add photo size validation in `flux_kontext.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/flux_kontext.rs`

**Problem:** `handle_flux_kontext_msg` step 2 accepts photos via `msg.photo()` without checking file size. In blend mode, two separate photos are collected. Each can be arbitrarily large, compounding storage risk.

**Solution:**
- Add `const MAX_FLUX_KONTEXT_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 2, after extracting the photo (for both blend and single-image modes), check `photo.file.size as u64 > MAX_FLUX_KONTEXT_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Final photo handler size cap
Add size cap to `train_flux_model.rs` (currently only limits count to 20, not individual file sizes).

### Variant B — Provider base URL externalization
Audit `heygen.rs`, `hedra.rs`, `elevenlabs.rs` for hardcoded `base_url` strings that should be externalized to env vars.

### Variant C — Text input guards sweep
Audit handlers for missing `text.trim().is_empty()` guards before length checks, and ensure all text handlers have proper empty-input rejection with localized error messages.
