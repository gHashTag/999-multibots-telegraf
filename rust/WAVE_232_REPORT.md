# Wave 232 Security Report

**Date:** 2026-06-16
**Scope:** Input validation & configuration hardening in scene handlers and AI provider
**Fixes delivered:** 3

---

## Fix 1 — Photo size validation in `ai_photoshop.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/ai_photoshop.rs`

**Problem:** `handle_ai_photoshop_msg` step 1 accepted a photo via `msg.photo()` without checking file size. A user could upload a multi-hundred-megabyte image, causing OOM, storage exhaustion, or degraded service.

**Solution:**
- Added `const MAX_AI_PHOTOSHOP_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo from `msg.photo()`, checked `photo.file.size as u64 > MAX_AI_PHOTOSHOP_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 232 commit.

---

## Fix 2 — Photo size validation in `neuro_photo.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/neuro_photo.rs`

**Problem:** `handle_neuro_photo_msg` step 1 accepted a photo via `msg.photo()` without checking file size. Same DoS/storage risk as Fix 1.

**Solution:**
- Added `const MAX_NEURO_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, checked `photo.file.size as u64 > MAX_NEURO_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 232 commit.

---

## Fix 3 — Externalize remaining hardcoded model digests in `replicate.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/replicate.rs`

**Problem:** `resolve_model_version` contained 8 hardcoded model digests (`flux`, `sd3`, `recraft`, `photon`, `haiper`, `minimax`, `kling-lip-sync`, `face-swap`). Only `sdxl` was externalized in Wave 227. Hardcoded digests require a code redeploy to rotate versions, violating the "configure, don't code" principle.

**Solution:**
- Added `std::sync::LazyLock<String>` constants for each remaining model:
  - `REPLICATE_FLUX_MODEL` → env var `REPLICATE_FLUX_MODEL`
  - `REPLICATE_SD3_MODEL` → env var `REPLICATE_SD3_MODEL`
  - `REPLICATE_RECRAFT_MODEL` → env var `REPLICATE_RECRAFT_MODEL`
  - `REPLICATE_PHOTON_MODEL` → env var `REPLICATE_PHOTON_MODEL`
  - `REPLICATE_HAIPER_MODEL` → env var `REPLICATE_HAIPER_MODEL`
  - `REPLICATE_MINIMAX_MODEL` → env var `REPLICATE_MINIMAX_MODEL`
  - `REPLICATE_KLING_LIP_SYNC_MODEL` → env var `REPLICATE_KLING_LIP_SYNC_MODEL`
  - `REPLICATE_FACE_SWAP_MODEL` → env var `REPLICATE_FACE_SWAP_MODEL`
- Each `LazyLock` preserves the current default value if the env var is absent or empty.
- Replaced all hardcoded strings in `resolve_model_version` with `.clone()` calls on the new constants.

**Commit:** Included in wave 232 commit.

---

## Verification

- `cargo check -p trios-mb-scenes -p trios-mb-ai` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Extend media size validation
Audit remaining scene handlers that receive photos (`face_swap.rs`, `avatar_transform.rs`, `image_upscaler.rs`, etc.) and add consistent size caps with per-handler constants.

### Variant B — Externalize remaining provider digests
Finish externalization in all other provider files (`fal.rs`, `heygen.rs`, `elevenlabs.rs`, `openai.rs`, etc.) that still contain hardcoded model names or API versions.

### Variant C — Tracing & timeout hygiene sweep
Check for any `pub async fn` in scene handlers or providers still missing `#[tracing::instrument(skip_all)]`, and wrap any remaining raw Telegram or DB calls without timeout helpers.
