# Wave 239 Security Report

**Date:** 2026-06-16
**Scope:** Provider configuration hardening — reqwest timeout constants and model name externalization
**Fixes delivered:** 3

---

## Fix 1 — Extract named reqwest timeout constants in `openai.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** Three constructors (`new()`, `deepseek()`, `grok()`) each repeated bare `std::time::Duration::from_secs(N)` literals for `.timeout(60)`, `.connect_timeout(10)`, and `.pool_idle_timeout(90)`. These magic numbers were duplicated across constructors, making them hard to maintain consistently.

**Solution:**
- Added named constants:
  - `REQWEST_TIMEOUT: Duration = Duration::from_secs(60);`
  - `REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
  - `REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
- Replaced all 9 bare literals (3 per constructor) with the named constants.

**Commit:** Included in wave 239 commit.

---

## Fix 2 — Extract named reqwest timeout constants in `heygen.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/heygen.rs`

**Problem:** `HeyGenProvider::new` used bare `std::time::Duration::from_secs(N)` literals for `.timeout(60)`, `.connect_timeout(10)`, and `.pool_idle_timeout(90)`. Same maintainability issue as Fix 1.

**Solution:**
- Added the same named constants as Fix 1.
- Replaced bare literals in `new()` with named constants.

**Commit:** Included in wave 239 commit.

---

## Fix 3 — Externalize hardcoded default model name in `openai.rs` (LOW)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** The `chat_completion` method used `.unwrap_or("gpt-4o")` as the default model name. This hardcoded string required a code redeploy to switch the default model.

**Solution:**
- Added `std::sync::LazyLock<String>` constant `OPENAI_DEFAULT_MODEL` sourcing from `OPENAI_DEFAULT_MODEL` env var with fallback to `"gpt-4o"`.
- Replaced the hardcoded `"gpt-4o"` in `chat_completion` with `OPENAI_DEFAULT_MODEL`.

**Commit:** Included in wave 239 commit.

---

## Verification

- `cargo check -p trios-mb-ai` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Finish reqwest timeout extraction sweep
Apply the same named-constant pattern to remaining providers: `elevenlabs.rs`, `hedra.rs`, `fal.rs`, `kie.rs`, `replicate.rs`, `midjourney.rs`.

### Variant B — Externalize remaining hardcoded model/voice names
Externalize `alloy` default voice in `openai.rs` and any other hardcoded model identifiers still present in providers.

### Variant C — Provider constructor consolidation
Audit if the near-identical reqwest client builder blocks across providers can be extracted to a shared helper function to reduce duplication.
