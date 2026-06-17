# Wave 152 Security Plan — Defensive Depth & Silent Failure Elimination

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate silent failures, harden provider response parsing, add observability, fix monetary precision gaps

---

## Phase 1: Silent DB Error Elimination (SN00)

**Problem:** 19 `let _ =` patterns in `SILVER-RING-SN00` silently drop DB errors for balance deductions, language updates, and model selection. Users may be charged without the service being delivered, or refunds may fail silently.

**Files:**
- `SILVER-RING-SN00/src/change_language.rs:25`
- `SILVER-RING-SN00/src/select_model.rs:75`
- `SILVER-RING-SN00/src/voice_training.rs:103`
- `SILVER-RING-SN00/src/ai_reels.rs:104`
- `SILVER-RING-SN00/src/face_swap.rs:66`
- `SILVER-RING-SN00/src/hedra_render.rs:70,93`
- `SILVER-RING-SN00/src/remove_bg.rs:49`
- `SILVER-RING-SN00/src/music_generation.rs:85`
- `SILVER-RING-SN00/src/avatar_transform.rs:81`
- `SILVER-RING-SN00/src/train_flux_model.rs:100`
- `SILVER-RING-SN00/src/ai_photoshop.rs:70`
- `SILVER-RING-SN00/src/fal_render.rs:53`
- `SILVER-RING-SN00/src/ai_cover.rs:102`
- `SILVER-RING-SN00/src/heygen_render.rs:74`
- `SILVER-RING-SN00/src/text_to_speech.rs:56`
- `SILVER-RING-SN00/src/generation_utils.rs:158,170`
- `SILVER-RING-PY00/src/services/payment_processor.rs:122`

**Fix:** Replace `let _ =` with `if let Err(e)` + `tracing::error!` for all DB calls.

---

## Phase 2: Provider Response Parsing Hardening

**Problem:** AI providers use `resp.text().await.unwrap_or_default()` and `.json().await.unwrap_or_default()` which silently mask HTTP body read errors and deserialization failures. A 500 HTML response becomes an empty string that propagates downstream.

**Files:**
- `SILVER-RING-AI00/src/providers/fal.rs:153,181,209`
- `SILVER-RING-AI00/src/providers/hedra.rs:95,123`
- `SILVER-RING-AI00/src/providers/kie.rs:203,231`
- `SILVER-RING-AI00/src/providers/replicate.rs:178,209,312`
- `SILVER-RING-AI00/src/providers/openai.rs:147,214,275`
- `SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `SILVER-RING-AI00/src/providers/heygen.rs`
- `SILVER-RING-AI00/src/providers/midjourney.rs`

**Fix:** Replace `unwrap_or_default()` on `resp.text()` and `resp.json()` with explicit `match` that logs the error and returns a structured `AppError`.

---

## Phase 3: Circuit Breaker Poisoned-Mutex Safety

**Problem:** `CircuitBreaker::allow_request()` and `record_failure()` call `.lock().unwrap()` on a `std::sync::Mutex`. If a thread panics while holding the lock, subsequent calls will panic too, permanently disabling circuit-breaker protection.

**File:** `SILVER-RING-AI00/src/circuit_breaker.rs:30,50`

**Fix:** Replace `lock().unwrap()` with `lock()` + `match` that logs an error and returns a safe default (allow request / record failure) when the mutex is poisoned.

---

## Phase 4: Health Endpoint Observability

**Problem:** `health_check()` and `health_check_with_db()` lack `#[tracing::instrument]`, so health probe floods in load-balancer logs are invisible to distributed tracing.

**File:** `BRONZE-RING-SRV/src/health.rs`

**Fix:** Add `#[tracing::instrument]` to both handlers.

---

## Phase 5: Orchestrator Global Timeout

**Problem:** `AiOrchestrator::dispatch()` has no global timeout. If all providers are slow but not failing, the retry loop can run indefinitely, exhausting Tokio worker threads.

**File:** `SILVER-RING-AI00/src/orchestrator.rs:44`

**Fix:** Wrap the dispatch retry loop in `tokio::time::timeout(Duration::from_secs(120), ...)`.

---

## Phase 6: Base64 Encode Infallibility

**Problem:** `base64_encode()` in openai.rs uses `write_char(...).unwrap()` on a pre-allocated `String`. While theoretically infallible, panics in crypto-adjacent code are unacceptable.

**File:** `SILVER-RING-AI00/src/providers/openai.rs:313,316`

**Fix:** Replace `unwrap()` with `expect("write to pre-allocated string")` or `unwrap_or_else` that returns an error.

---

## Phase 7: Balance & Telegram ID Default Guard

**Problem:** Multiple SN00 handlers use `unwrap_or(0)` for `telegram_id` and `unwrap_or(0.0)` for balance. A `telegram_id == 0` is a sentinel that should never proceed with chargeable operations.

**Files:** ~20 files in `SILVER-RING-SN00/src/`

**Fix:** Add an early guard:
```rust
if tid == 0 {
    tracing::warn!("Missing telegram_id, skipping operation");
    return Ok(());
}
```

---

## Verification

- `cargo check --target aarch64-apple-darwin`
- Review all changed files for compilation errors
- Confirm no new `let _ =` patterns introduced

---

## Commit Message Template

```
feat: Wave 152 security hardening (rust)

- Eliminated 19 silent DB error drops in SN00 handlers
- Hardened provider response parsing (removed unwrap_or_default on text/json)
- Circuit breaker poisoned-mutex safety (no more unwrap on lock)
- Added tracing::instrument to health endpoints
- Added global timeout to AI orchestrator dispatch
- Added telegram_id == 0 guard across SN00 handlers
- Base64 encode infallibility documentation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
