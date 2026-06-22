# Wave 152 Security Audit Report

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo (`/Users/playra/999-multibots-telegraf/rust/`)
**Theme:** Eliminate silent failures, harden provider response parsing, add observability, fix circuit breaker poison safety

---

## Executive Summary

Wave 152 addresses 19 silent DB error drops across SILVER-RING-SN00 handlers, hardens HTTP error response parsing in 7 AI providers, fixes circuit breaker mutex poisoning, adds distributed tracing to health endpoints, and wraps the AI orchestrator dispatch in a global timeout. All changes compile cleanly (`cargo check` passes with zero errors).

---

## Phase 1: Silent DB Error Elimination (SN00)

**Files:** 14 files in `SILVER-RING-SN00/src/` + `SILVER-RING-PY00/src/services/payment_processor.rs`

**Problem:** 19 `let _ =` patterns silently dropped DB errors for balance deductions, language updates, model selection, subscription renewals, and refund operations. Users could be charged without service delivery, or refunds could fail without any log signal.

**Fix:**
- Replaced all `let _ = db.deduct_balance(...)` with `if !deduct_balance(...)` + user-facing error message + return to menu.
- Replaced `let _ = db.update_user_language(...)` with `if let Err(e)` + `tracing::error!`.
- Replaced `let _ = db.add_balance(...)` in refund paths with `if let Err(e)` + `tracing::error!` at CRITICAL level.
- Replaced `let _ = self.db.renew_subscription(...)` with `if let Err(e)` + `tracing::error!`.

**Impact:** Every DB failure now emits an error-level log and the user receives a localized error message instead of a silent no-op.

---

## Phase 2: Provider Response Parsing Hardening

**Files:** `SILVER-RING-AI00/src/providers/{fal,hedra,kie,replicate,openai,elevenlabs,heygen}.rs`

**Problem:** Providers used `resp.text().await.unwrap_or_default()` on non-2xx responses, silently turning unreadable bodies into empty strings. A 500 HTML error page became `""`, losing the actual error message.

**Fix:** Replaced `unwrap_or_default()` with `unwrap_or_else(|e| { ... })` that logs the body-read failure and returns a descriptive placeholder like `"[body unreadable: {e}]"`.

**Impact:** Provider error messages now contain either the actual response body or a clear indication that the body could not be read, improving incident response time.

---

## Phase 3: Circuit Breaker Poisoned-Mutex Safety

**File:** `SILVER-RING-AI00/src/circuit_breaker.rs`

**Problem:** `allow_request()` and `record_failure()` called `.lock().unwrap()` on a `std::sync::Mutex`. If any thread panicked while holding the lock, all subsequent calls would panic, permanently disabling circuit-breaker protection.

**Fix:** Replaced `lock().unwrap()` with `match self.last_failure.lock()`:
- `Ok(guard)` — normal path.
- `Err(poisoned)` — log an error, recover the inner data with `into_inner()`, reset the circuit breaker state to closed, and allow the request.

**Impact:** A poisoned mutex no longer crashes the circuit breaker; instead it self-heals and emits an error log.

---

## Phase 4: Health Endpoint Observability

**File:** `BRONZE-RING-SRV/src/health.rs`

**Problem:** `health_check()` and `health_check_with_db()` lacked `#[tracing::instrument]`, making health probe requests invisible to distributed tracing.

**Fix:** Added `#[tracing::instrument]` to both handlers.

**Impact:** Health checks now participate in distributed trace correlation.

---

## Phase 5: Orchestrator Global Timeout

**File:** `SILVER-RING-AI00/src/orchestrator.rs`

**Problem:** `AiOrchestrator::dispatch()` had no global timeout. If all providers were slow but not failing (e.g., hung TCP connections), the retry loop could run indefinitely, starving Tokio worker threads.

**Fix:**
- Wrapped the dispatch retry logic into a new private `dispatch_inner()` method.
- Wrapped the call in `tokio::time::timeout(Duration::from_secs(120), ...)` inside the trait `dispatch()` method.
- On timeout, returns `AiError::AllProvidersFailed`.

**Impact:** No single dispatch can exceed 120 seconds total, preventing unbounded thread starvation.

---

## Phase 6: Base64 Encode Infallibility

**File:** `SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** `base64_encode()` used `result.write_char(...).unwrap()` on a pre-allocated `String`. While theoretically infallible, panics in crypto-adjacent code are unacceptable.

**Fix:** Replaced `unwrap()` with `let _ = result.write_char(...)` and added a comment explaining the infallibility.

**Impact:** Eliminates a potential panic path in audio payload encoding.

---

## Verification

```bash
cd /Users/playra/999-multibots-telegraf/rust
cargo check --target aarch64-apple-darwin
# Finished dev profile [unoptimized + debuginfo] target(s) in 3.36s
```

---

## New Patterns Added to Skill Library

1. **`deduct_balance-result-handling`** — Balance deduction returns `bool`, not `Result`. Never silently ignore a `false` return; always notify the user and abort the operation.
2. **`provider-error-body-logging`** — On non-2xx responses, use `resp.text().await.unwrap_or_else(|e| format!("[body unreadable: {}]", e))` instead of `unwrap_or_default()`.
3. **`circuit-breaker-mutex-poison-recovery`** — Never `.unwrap()` a mutex lock in production. Match `Ok(guard)` / `Err(poisoned)` and recover with `into_inner()`.
4. **`orchestrator-global-timeout`** — Wrap provider dispatch retry loops in `tokio::time::timeout` to prevent unbounded latency accumulation.
5. **`critical-refund-logging`** — When refunding balance after a failure, log at `error!` level if the refund itself fails. This is a double-fault condition.

---

## Cooperation Variants for Wave 153

**Variant A: Deep Defence**
- Add `#[tracing::instrument]` to all remaining async HTTP handlers in BRONZE-RING-SRV.
- Replace remaining `unwrap_or_default()` on `telegram_id` extractions with early-return guards.
- Add `tokio::time::timeout` to all provider `check_status` and `get_result` trait methods.

**Variant B: Observability First**
- Add Prometheus counters for: circuit breaker state transitions, provider error body read failures, balance deduction failures, orchestrator timeouts.
- Build a Grafana dashboard JSON with panels for each metric.

**Variant C: Penetration Simulation**
- Write a chaos binary that simulates: DB connection drops during balance deduction, poisoned mutex scenarios, hung provider responses to test the 120s orchestrator timeout, and malformed webhook payloads.
- Integrate the chaos binary into CI with `cargo test`.

Reply **A**, **B**, or **C** (or a custom direction) to start Wave 153.
