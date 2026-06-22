# Wave 236 Security Report

**Date:** 2026-06-16
**Scope:** Media input validation — final photo size caps in scene handlers
**Fixes delivered:** 3

---

## Fix 1 — Photo size validation in `digital_avatar_body.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/digital_avatar_body.rs`

**Problem:** `handle_digital_avatar_body_msg` step 1 accepted a photo via `msg.photo()` without checking file size. A user could upload an oversized image, causing OOM or storage exhaustion.

**Solution:**
- Added `const MAX_DIGITAL_AVATAR_BODY_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, checked `photo.file.size as u64 > MAX_DIGITAL_AVATAR_BODY_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 236 commit.

---

## Fix 2 — Photo size validation in `image_to_video.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/image_to_video.rs`

**Problem:** `handle_image_to_video_msg` step 2 accepted a photo via `msg.photo()` without checking file size. Same DoS/storage risk.

**Solution:**
- Added `const MAX_IMAGE_TO_VIDEO_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 2, after extracting the photo, checked `photo.file.size as u64 > MAX_IMAGE_TO_VIDEO_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 236 commit.

---

## Fix 3 — Photo size validation in `flux_kontext.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/flux_kontext.rs`

**Problem:** `handle_flux_kontext_msg` step 2 accepted photos via `msg.photo()` without checking file size. In blend mode, two separate photos are collected; each could be arbitrarily large, compounding storage risk.

**Solution:**
- Added `const MAX_FLUX_KONTEXT_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 2, after extracting the photo (for both blend and single-image modes), checked `photo.file.size as u64 > MAX_FLUX_KONTEXT_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 236 commit.

---

## Verification

- `cargo check -p trios-mb-scenes` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Final photo handler size cap
Add size cap to `train_flux_model.rs` (currently only limits count to 20, not individual file sizes).

### Variant B — Provider base URL externalization
Audit `heygen.rs`, `hedra.rs`, `elevenlabs.rs` for hardcoded `base_url` strings that should be externalized to env vars.

### Variant C — Text input guards sweep
Audit handlers for missing `text.trim().is_empty()` guards before length checks, and ensure all text handlers have proper empty-input rejection with localized error messages.
