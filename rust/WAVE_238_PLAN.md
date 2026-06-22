# Wave 238 Security Plan

**Date:** 2026-06-16
**Theme:** Provider configuration hardening and input validation consistency

---

## Fix 1: Externalize hardcoded base URL in `elevenlabs.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`

**Problem:** `ElevenLabsProvider::new` hardcodes `base_url: "https://api.elevenlabs.io".to_string()`. This prevents runtime configuration changes and requires a code redeploy to switch endpoints.

**Solution:**
- Add `std::sync::LazyLock<String>` for the base URL, sourcing from `ELEVENLABS_BASE_URL` env var with fallback to `"https://api.elevenlabs.io"`.
- Replace the hardcoded string in `new()` with the `LazyLock` reference.

---

## Fix 2: Externalize hardcoded base URLs in `openai.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** Three constructors (`new()`, `deepseek()`, `grok()`) each hardcode different base URLs (`https://api.openai.com`, `https://api.deepseek.com/v1`, `https://api.x.ai/v1`). This prevents runtime configuration changes for any of these providers.

**Solution:**
- Add three `std::sync::LazyLock<String>` constants for the base URLs:
  - `OPENAI_BASE_URL` → env var `OPENAI_BASE_URL`
  - `DEEPSEEK_BASE_URL` → env var `DEEPSEEK_BASE_URL`
  - `GROK_BASE_URL` → env var `GROK_BASE_URL`
- Replace the hardcoded strings in each constructor with the corresponding `LazyLock` reference.

---

## Fix 3: Add explicit empty text guard in `image_to_video.rs` (LOW)

**File:** `rings/SILVER-RING-SN00/src/image_to_video.rs`

**Problem:** Step 3 uses `text.trim().len() < 3` which technically catches empty strings, but is inconsistent with the explicit `trim().is_empty()` pattern used in all other text handlers. The error message for an empty string would be "Description too short" rather than something more explicit.

**Solution:**
- Add `text.trim().is_empty()` check before the length check.
- Return a localized "empty text not allowed" error if the text is empty.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00` and `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Provider reqwest timeout constant extraction
Audit all providers for bare `Duration::from_secs(N)` in `reqwest::Client::builder()` and extract to named module-level constants.

### Variant B — Scene handler text guard sweep
Audit remaining handlers (`avatar_brain.rs`, `ai_reels.rs`, etc.) for consistency in empty-text guard ordering: ensure `trim().is_empty()` always comes before `len() > MAX` checks.

### Variant C — Hardcoded model name externalization
Externalize remaining hardcoded model names in `openai.rs` (`gpt-4o` default) and other providers to env vars.
