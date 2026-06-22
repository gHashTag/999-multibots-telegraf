# Wave 240 Security Report

**Date:** 2026-06-16
**Scope:** Provider reqwest timeout constant extraction sweep
**Fixes delivered:** 3

---

## Fix 1 — Extract named reqwest timeout constants in `elevenlabs.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`

**Problem:** `ElevenLabsProvider::new` and body-read logic used bare `Duration::from_secs(N)` literals (60, 10, 90, 30). Magic numbers duplicated across files are hard to maintain consistently.

**Solution:**
- Added named constants:
  - `REQWEST_TIMEOUT: Duration = Duration::from_secs(60);`
  - `REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
  - `REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
  - `BODY_READ_TIMEOUT: Duration = Duration::from_secs(30);`
- Replaced bare literals in `new()` and body-read with named constants.

**Commit:** Included in wave 240 commit.

---

## Fix 2 — Extract named reqwest timeout constants in `hedra.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/hedra.rs`

**Problem:** `HedraProvider::new` used bare `Duration::from_secs(N)` literals (120, 10, 90).

**Solution:**
- Added named constants:
  - `REQWEST_TIMEOUT: Duration = Duration::from_secs(120);`
  - `REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
  - `REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
- Replaced bare literals in `new()` with named constants.

**Commit:** Included in wave 240 commit.

---

## Fix 3 — Extract named reqwest timeout constants in `fal.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/fal.rs`

**Problem:** `FalProvider::new` used bare `Duration::from_secs(N)` literals (120, 10, 90).

**Solution:**
- Added named constants:
  - `REQWEST_TIMEOUT: Duration = Duration::from_secs(120);`
  - `REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
  - `REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
- Replaced bare literals in `new()` with named constants.

**Commit:** Included in wave 240 commit.

---

## Verification

- `cargo check -p trios-mb-ai` — ✅ clean, zero warnings

---

## Cooperation Variants for Next Wave

### Variant A — Finish reqwest timeout extraction sweep
Apply the same named-constant pattern to remaining providers: `kie.rs`, `replicate.rs`, `midjourney.rs`.

### Variant B — Externalize hardcoded model/voice names in openai.rs
Externalize `alloy` default voice and `tts-1` model in `openai.rs` to env vars.

### Variant C — Provider constructor consolidation
Extract the near-identical reqwest client builder blocks across all providers into a shared helper function in `providers/mod.rs`.
