# Wave 233 Security Report

**Date:** 2026-06-16
**Scope:** Input validation & configuration hardening in scene handlers and AI provider
**Fixes delivered:** 3

---

## Fix 1 — Photo size validation in `face_swap.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/face_swap.rs`

**Problem:** `handle_face_swap_msg` accepted photos in both step 1 (target photo) and step 2 (source photo) without checking file size. A user could upload oversized images in either step, causing OOM, storage exhaustion, or degraded service.

**Solution:**
- Added `const MAX_FACE_SWAP_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1 and step 2, after extracting the photo from `msg.photo()`, checked `photo.file.size as u64 > MAX_FACE_SWAP_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 233 commit.

---

## Fix 2 — Photo size validation in `remove_bg.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/remove_bg.rs`

**Problem:** `handle_remove_bg_msg` step 1 accepted a photo via `msg.photo()` without checking file size. Same DoS/storage risk as Fix 1.

**Solution:**
- Added `const MAX_REMOVE_BG_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, checked `photo.file.size as u64 > MAX_REMOVE_BG_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 233 commit.

---

## Fix 3 — Externalize hardcoded model IDs in `fal.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/fal.rs`

**Problem:** `resolve_model_id` contained 11 hardcoded model identifiers (`nano-banana-pro`, `veed-fabric`, `wan-2.5-t2v`, `wan-2.5-i2v`, `latentsync`, `hummingbird`, `flux-schnell`, `flux-pro`, `flux-dev`, `minimax-video`, `kling-video`). Hardcoded IDs require a code redeploy to rotate versions, violating the "configure, don't code" principle.

**Solution:**
- Added `std::sync::LazyLock<String>` constants for each model ID:
  - `FAL_NANO_BANANA_PRO_MODEL` → env var `FAL_NANO_BANANA_PRO_MODEL`
  - `FAL_VEED_FABRIC_MODEL` → env var `FAL_VEED_FABRIC_MODEL`
  - `FAL_WAN_25_T2V_MODEL` → env var `FAL_WAN_25_T2V_MODEL`
  - `FAL_WAN_25_I2V_MODEL` → env var `FAL_WAN_25_I2V_MODEL`
  - `FAL_LATENTSYNC_MODEL` → env var `FAL_LATENTSYNC_MODEL`
  - `FAL_HUMMINGBIRD_MODEL` → env var `FAL_HUMMINGBIRD_MODEL`
  - `FAL_FLUX_SCHNELL_MODEL` → env var `FAL_FLUX_SCHNELL_MODEL`
  - `FAL_FLUX_PRO_MODEL` → env var `FAL_FLUX_PRO_MODEL`
  - `FAL_FLUX_DEV_MODEL` → env var `FAL_FLUX_DEV_MODEL`
  - `FAL_MINIMAX_VIDEO_MODEL` → env var `FAL_MINIMAX_VIDEO_MODEL`
  - `FAL_KLING_VIDEO_MODEL` → env var `FAL_KLING_VIDEO_MODEL`
- Each `LazyLock` preserves the current default value if the env var is absent or empty.
- Replaced all hardcoded strings in `resolve_model_id` with `.clone()` calls on the new constants.

**Commit:** Included in wave 233 commit.

---

## Verification

- `cargo check -p trios-mb-scenes -p trios-mb-ai` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Extend media size validation to voice handlers
Audit `voice_avatar.rs` and `voice_training.rs` (and any other voice-accepting handlers) and add file size caps for voice/audio uploads.

### Variant B — Extend media size validation to remaining photo handlers
Add size caps to `avatar_transform.rs`, `digital_avatar_body.rs`, `flux_kontext.rs`, `image_to_prompt.rs`, `image_to_video.rs`, `image_upscaler.rs`, `morphing.rs`, and `train_flux_model.rs`.

### Variant C — Provider configuration externalization sweep
Audit other providers (`elevenlabs.rs`, `heygen.rs`, `openai.rs`, `hedra.rs`, `midjourney.rs`, `kie.rs`) for hardcoded API endpoints, model names, or version strings that should be externalized to env vars.
