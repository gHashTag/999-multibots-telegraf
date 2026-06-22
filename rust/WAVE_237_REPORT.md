# Wave 237 Security Report

**Date:** 2026-06-16
**Scope:** Media input validation and provider configuration hardening
**Fixes delivered:** 3

---

## Fix 1 — Photo size validation in `train_flux_model.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/train_flux_model.rs`

**Problem:** `handle_train_flux_model_msg` step 1 accepted up to `MAX_TRAIN_IMAGES` (20) photos via `msg.photo()` without checking individual file sizes. A user could upload 20 oversized images, compounding storage risk dramatically.

**Solution:**
- Added `const MAX_TRAIN_FLUX_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, checked `photo.file.size as u64 > MAX_TRAIN_FLUX_PHOTO_BYTES`
- Returns a localized error (RU/EN) if the limit is exceeded.

**Commit:** Included in wave 237 commit.

---

## Fix 2 — Externalize hardcoded base URL in `heygen.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/heygen.rs`

**Problem:** `HeyGenProvider::new` hardcoded `base_url: "https://api.heygen.com".to_string()`. This prevented runtime configuration changes and required a code redeploy to switch endpoints (e.g., for regional failover or API version migration).

**Solution:**
- Added `std::sync::LazyLock<String>` constant `HEYGEN_BASE_URL` sourcing from `HEYGEN_BASE_URL` env var with fallback to `"https://api.heygen.com"`.
- Replaced the hardcoded string in `new()` with `HEYGEN_BASE_URL.clone()`.

**Commit:** Included in wave 237 commit.

---

## Fix 3 — Externalize hardcoded base URL in `hedra.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/hedra.rs`

**Problem:** `HedraProvider::new` hardcoded `base_url: "https://api.hedra.com".to_string()`. Same configuration rigidity as Fix 2.

**Solution:**
- Added `std::sync::LazyLock<String>` constant `HEDRA_BASE_URL` sourcing from `HEDRA_BASE_URL` env var with fallback to `"https://api.hedra.com"`.
- Replaced the hardcoded string in `new()` with `HEDRA_BASE_URL.clone()`.

**Commit:** Included in wave 237 commit.

---

## Verification

- `cargo check -p trios-mb-scenes -p trios-mb-ai` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Provider base URL externalization (remaining)
Externalize hardcoded `base_url` in `elevenlabs.rs` and `openai.rs`.

### Variant B — Provider reqwest timeout constant extraction
Audit all providers for bare `Duration::from_secs(N)` in `reqwest::Client::builder()` and extract to named constants.

### Variant C — Text input guard sweep
Audit scene handlers for any `msg.text()` branches still missing `text.trim().is_empty()` validation before length checks.
