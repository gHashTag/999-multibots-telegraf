# Wave 238 Security Report

**Date:** 2026-06-16
**Scope:** Provider configuration hardening and input validation consistency
**Fixes delivered:** 3

---

## Fix 1 — Externalize hardcoded base URL in `elevenlabs.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`

**Problem:** `ElevenLabsProvider::new` hardcoded `base_url: "https://api.elevenlabs.io".to_string()`. This prevented runtime configuration changes and required a code redeploy to switch endpoints.

**Solution:**
- Added `std::sync::LazyLock<String>` constant `ELEVENLABS_BASE_URL` sourcing from `ELEVENLABS_BASE_URL` env var with fallback to `"https://api.elevenlabs.io"`.
- Replaced the hardcoded string in `new()` with `ELEVENLABS_BASE_URL.clone()`.

**Commit:** Included in wave 238 commit.

---

## Fix 2 — Externalize hardcoded base URLs in `openai.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** Three constructors (`new()`, `deepseek()`, `grok()`) each hardcoded different base URLs (`https://api.openai.com`, `https://api.deepseek.com/v1`, `https://api.x.ai/v1`). This prevented runtime configuration changes for any of these providers.

**Solution:**
- Added three `std::sync::LazyLock<String>` constants:
  - `OPENAI_BASE_URL` → env var `OPENAI_BASE_URL` → default `"https://api.openai.com"`
  - `DEEPSEEK_BASE_URL` → env var `DEEPSEEK_BASE_URL` → default `"https://api.deepseek.com/v1"`
  - `GROK_BASE_URL` → env var `GROK_BASE_URL` → default `"https://api.x.ai/v1"`
- Replaced the hardcoded strings in each constructor with the corresponding `LazyLock` reference.

**Commit:** Included in wave 238 commit.

---

## Fix 3 — Explicit empty text guard in `image_to_video.rs` (LOW)

**File:** `rings/SILVER-RING-SN00/src/image_to_video.rs`

**Problem:** Step 3 used `text.trim().len() < 3` which technically caught empty strings, but was inconsistent with the explicit `trim().is_empty()` pattern used in all other text handlers. The error message for an empty string was "Description too short" rather than something more explicit.

**Solution:**
- Added `text.trim().is_empty()` check before the length check.
- Returns a localized "Enter a description" error if the text is empty.

**Commit:** Included in wave 238 commit.

---

## Verification

- `cargo check -p trios-mb-scenes -p trios-mb-ai` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Provider reqwest timeout constant extraction
Audit all providers for bare `Duration::from_secs(N)` in `reqwest::Client::builder()` and extract to named module-level constants.

### Variant B — Scene handler text guard sweep
Audit remaining handlers (`avatar_brain.rs`, `ai_reels.rs`, etc.) for consistency in empty-text guard ordering: ensure `trim().is_empty()` always comes before `len() > MAX` checks.

### Variant C — Hardcoded model name externalization
Externalize remaining hardcoded model names in `openai.rs` (`gpt-4o` default) and other providers to env vars.
