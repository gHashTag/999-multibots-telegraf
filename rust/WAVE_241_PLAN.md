# Wave 241 Security Plan

**Date:** 2026-06-16
**Theme:** Provider reqwest timeout extraction (final) + model/voice name externalization

---

## Fix 1: Extract named reqwest timeout constants in `kie.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/kie.rs`

**Problem:** `KieProvider::new` uses bare `Duration::from_secs(N)` literals (60, 10, 90).

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`.
- Replace bare literals in `new()` with named constants.

---

## Fix 2: Extract named reqwest timeout constants in `replicate.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/replicate.rs`

**Problem:** `ReplicateProvider::new` uses bare `Duration::from_secs(N)` literals (120, 10, 90).

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`.
- Replace bare literals in `new()` with named constants.

---

## Fix 3: Externalize hardcoded model/voice names in `openai.rs` (LOW)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** `text_to_speech` method hardcodes `"alloy"` as default voice and `"tts-1"` as the model name. These require code redeploys to rotate.

**Solution:**
- Add `std::sync::LazyLock<String>` constants:
  - `OPENAI_DEFAULT_TTS_VOICE` → env var `OPENAI_DEFAULT_TTS_VOICE` → default `"alloy"`
  - `OPENAI_DEFAULT_TTS_MODEL` → env var `OPENAI_DEFAULT_TTS_MODEL` → default `"tts-1"`
- Replace hardcoded strings in `text_to_speech` with the constants.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Final reqwest timeout extraction
Apply the same named-constant pattern to `midjourney.rs` (the last remaining provider).

### Variant B — Provider constructor consolidation
Extract the near-identical reqwest client builder blocks across all providers into a shared helper function in `providers/mod.rs`.

### Variant C — Scene handler input validation sweep
Audit all scene handlers for any remaining missing `text.trim().is_empty()` guards or missing media size validation.
