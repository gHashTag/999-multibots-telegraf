# Wave 232 Security Plan

**Date:** 2026-06-16
**Theme:** Input validation & configuration hardening — media size caps in photo handlers, provider model digest externalization

---

## Fix 1: Add photo size validation in `ai_photoshop.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/ai_photoshop.rs`

**Problem:** `handle_ai_photoshop_msg` step 1 accepts a photo via `msg.photo()` without checking file size. A user can upload a multi-hundred-megabyte image, causing OOM, storage exhaustion, or degraded service.

**Solution:**
- Add `const MAX_AI_PHOTOSHOP_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- After extracting `file_id`, check `photo.file.size as u64 > MAX_AI_PHOTOSHOP_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 2: Add photo size validation in `neuro_photo.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/neuro_photo.rs`

**Problem:** `handle_neuro_photo_msg` step 1 accepts a photo via `msg.photo()` without checking file size. Same DoS/storage risk as Fix 1.

**Solution:**
- Add `const MAX_NEURO_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- After extracting `file_id`, check `photo.file.size as u64 > MAX_NEURO_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 3: Externalize remaining hardcoded model digests in `replicate.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/replicate.rs`

**Problem:** `resolve_model_version` still contains 8 hardcoded model digests (`flux`, `sd3`, `recraft`, `photon`, `haiper`, `minimax`, `kling-lip-sync`, `face-swap`). Only `sdxl` was externalized in Wave 227. Hardcoded digests require a code redeploy to rotate versions, violating the "configure, don't code" principle.

**Solution:**
- Add `std::sync::LazyLock<String>` constants for each model digest, sourcing from environment variables with sensible defaults preserving current values.
- Replace hardcoded strings in `resolve_model_version` with the new `LazyLock` references.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00` and `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Each fix is isolated in its own commit (or all in one wave commit)
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Extend media size validation
Audit remaining scene handlers that receive photos (`face_swap.rs`, `avatar_transform.rs`, `image_upscaler.rs`, etc.) and add consistent size caps with per-handler constants.

### Variant B — Externalize remaining provider digests
Finish externalization in all other provider files (`fal.rs`, `heygen.rs`, `elevenlabs.rs`, `openai.rs`, etc.) that still contain hardcoded model names or API versions.

### Variant C — Tracing & timeout hygiene sweep
Check for any `pub async fn` in scene handlers or providers still missing `#[tracing::instrument(skip_all)]`, and wrap any remaining raw Telegram or DB calls without timeout helpers.
