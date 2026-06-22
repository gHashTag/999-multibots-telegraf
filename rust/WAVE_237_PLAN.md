# Wave 237 Security Plan

**Date:** 2026-06-16
**Theme:** Media input validation and provider configuration hardening

---

## Fix 1: Add photo size validation in `train_flux_model.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/train_flux_model.rs`

**Problem:** `handle_train_flux_model_msg` step 1 accepts up to `MAX_TRAIN_IMAGES` (20) photos via `msg.photo()` without checking individual file sizes. A user could upload 20 oversized images, compounding storage risk dramatically.

**Solution:**
- Add `const MAX_TRAIN_FLUX_PHOTO_BYTES: u64 = 20 * 1024 * 1024;`
- In step 1, after extracting the photo, check `photo.file.size as u64 > MAX_TRAIN_FLUX_PHOTO_BYTES`
- Return a localized error if the limit is exceeded.

---

## Fix 2: Externalize hardcoded base URL in `heygen.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/heygen.rs`

**Problem:** `HeyGenProvider::new` hardcodes `base_url: "https://api.heygen.com".to_string()`. This prevents runtime configuration changes and requires a code redeploy to switch endpoints (e.g., for regional failover or API version migration).

**Solution:**
- Add `std::sync::LazyLock<String>` for the base URL, sourcing from `HEYGEN_BASE_URL` env var with fallback to `"https://api.heygen.com"`.
- Replace the hardcoded string in `new()` with the `LazyLock` reference.

---

## Fix 3: Externalize hardcoded base URL in `hedra.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/hedra.rs`

**Problem:** `HedraProvider::new` hardcodes `base_url: "https://api.hedra.com".to_string()`. Same configuration rigidity as Fix 2.

**Solution:**
- Add `std::sync::LazyLock<String>` for the base URL, sourcing from `HEDRA_BASE_URL` env var with fallback to `"https://api.hedra.com"`.
- Replace the hardcoded string in `new()` with the `LazyLock` reference.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00` and `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Provider base URL externalization (remaining)
Externalize hardcoded `base_url` in `elevenlabs.rs` and `openai.rs`.

### Variant B — Provider reqwest timeout constant extraction
Audit all providers for bare `Duration::from_secs(N)` in `reqwest::Client::builder()` and extract to named constants.

### Variant C — Text input guard sweep
Audit scene handlers for any `msg.text()` branches still missing `text.trim().is_empty()` validation before length checks.
