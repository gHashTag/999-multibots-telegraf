# Wave 240 Security Plan

**Date:** 2026-06-16
**Theme:** Provider reqwest timeout constant extraction sweep

---

## Fix 1: Extract named reqwest timeout constants in `elevenlabs.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`

**Problem:** `ElevenLabsProvider::new` and body-read logic use bare `Duration::from_secs(N)` literals (60, 10, 90, 30). Magic numbers duplicated across files are hard to maintain consistently.

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`, `BODY_READ_TIMEOUT`.
- Replace bare literals in `new()` and body-read with named constants.

---

## Fix 2: Extract named reqwest timeout constants in `hedra.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/hedra.rs`

**Problem:** `HedraProvider::new` uses bare `Duration::from_secs(N)` literals (120, 10, 90).

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`.
- Replace bare literals in `new()` with named constants.

---

## Fix 3: Extract named reqwest timeout constants in `fal.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/fal.rs`

**Problem:** `FalProvider::new` uses bare `Duration::from_secs(N)` literals (120, 10, 90).

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`.
- Replace bare literals in `new()` with named constants.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Finish reqwest timeout extraction sweep
Apply the same named-constant pattern to remaining providers: `kie.rs`, `replicate.rs`, `midjourney.rs`.

### Variant B — Externalize hardcoded model/voice names in openai.rs
Externalize `alloy` default voice and `tts-1` model in `openai.rs` to env vars.

### Variant C — Provider constructor consolidation
Extract the near-identical reqwest client builder blocks across all providers into a shared helper function in `providers/mod.rs`.
