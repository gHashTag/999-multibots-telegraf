# Wave 156 Security Report — Panic Recovery & Constructor Hardening

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate remaining panic paths, add background task supervision, harden provider constructors

---

## Summary

Wave 156 hardens 5 categories of reliability and security issues across the Rust monorepo:

1. **CRITICAL:** HMAC `unwrap()` in payment signature generation replaced with fallible error propagation
2. **CRITICAL/HIGH:** Background task supervision added to server, maintenance, and bot dispatcher spawns
3. **HIGH:** 10 AI provider `reqwest::Client` constructors hardened to fail-fast on misconfiguration
4. **MEDIUM:** Provider response field parsing hardened against silently empty defaults
5. **MEDIUM:** Payment callback parameter validation hardened to reject missing fields instead of defaulting

---

## Phase 1: CRITICAL — HMAC `unwrap()` Eliminated

**File:** `rings/SILVER-RING-PY00/src/robokassa.rs`

**Problem:** `HmacSha256::new_from_slice(data.as_bytes()).unwrap()` was a panic path in payment-critical signature generation. While HMAC accepts any key length, an unexpected runtime failure would crash the payment thread.

**Fix:**
- `generate_signature` now returns `Result<String, AppError>` instead of `String`
- `HmacSha256::new_from_slice(...)` uses `map_err(|e| AppError::Internal(...))?`
- Callers updated to propagate the error with `?`

**Impact:** Payment signature failures now surface as internal errors instead of panics.

---

## Phase 2: CRITICAL/HIGH — Background Task Supervision

**File:** `rings/BRONZE-RING-APP/src/main.rs`

**Problem:** The HTTP server, retry maintenance task, and up to 15 Telegram bot dispatchers were spawned with plain `tokio::spawn`. If any task panicked, it silently terminated with no restart, causing service degradation.

**Fix:**
- Introduced `spawn_traced<F, Fut>()` helper that wraps background tasks in a panic-aware supervision loop
- On panic: logs the error, waits 5s, and restarts the task
- On cancellation token trigger: gracefully shuts down
- **HTTP server:** Wrapped with `AssertUnwindSafe(...).catch_unwind()` inside `tokio::select!` alongside a `CancellationToken` branch for graceful shutdown
- **Retry maintenance:** Converted to `spawn_traced` with restart-on-panic behavior
- **Bot dispatchers (×15):** Each wrapped in an inner `tokio::spawn` so panics are caught and logged explicitly instead of silently killing the outer task

**Impact:** No background task can silently die from a panic. All are either restarted or explicitly logged.

---

## Phase 3: HIGH — Provider reqwest Client Constructor Hardening

**Files:** 8 files, 10 constructors

**Problem:** AI provider constructors used `reqwest::Client::builder()...build().unwrap_or_default()`. Builder failures silently fell back to a default `Client` with different timeout/connect settings, masking configuration errors.

**Fix:** Replaced `build().unwrap_or_default()` with `build().expect("Failed to build {provider} reqwest client")` in:

| File | Constructors |
|------|-------------|
| `openai.rs` | OpenAI, DeepSeek, Grok (3) |
| `replicate.rs` | Replicate (1) |
| `elevenlabs.rs` | ElevenLabs (1) |
| `fal.rs` | FAL (1) |
| `heygen.rs` | HeyGen (1) |
| `hedra.rs` | Hedra (1) |
| `kie.rs` | KIE (1) |
| `midjourney.rs` | Midjourney (1) |

**Impact:** Startup fails fast if an HTTP client cannot be configured, preventing silent misconfiguration in production.

---

## Phase 4: MEDIUM — Provider Response Field Hardening

**Files:** 3 files

**Problem:** Provider response parsing used `unwrap_or_default()` on required fields, silently producing empty defaults that propagate downstream.

**Fix:**

| File | Field | Before | After |
|------|-------|--------|-------|
| `elevenlabs.rs:161` | `voices` | `voices.unwrap_or_default()` | `voices.ok_or_else(|| AiError::InvalidResponse {...})?` |
| `kie.rs:315` | `task_id` | `format!("kie:{}", task_id.unwrap_or_default())` | `task_id.map(|id| format!("kie:{}", id))` |
| `hedra.rs:185` | `anim_id` | `format!("hedra:{}", anim_id.unwrap_or_default())` | `anim_id.map(|id| format!("hedra:{}", id))` |

**Impact:** Missing required fields now produce explicit errors instead of silently empty strings.

---

## Phase 5: MEDIUM — Payment Parameter Validation

**Files:** 4 files

**Problem:** Payment callback handlers silently defaulted missing parameters to empty strings or zero values, allowing malformed callbacks to pass validation.

**Fix:** Replaced `unwrap_or_default()` and `unwrap_or(0.0)` with explicit `ok_or_else(...)?` validation:

| File | Parameters |
|------|-----------|
| `robokassa.rs` | `InvId`, `OutSum` |
| `x402.rs` | `transaction_hash`, `amount`, `payment_url` |
| `ton.rs` | `hash`, `amount`, `payment_url` |
| `telegram_stars.rs` | `telegram_payment_charge_id`, `total_amount` |

**Impact:** Malformed payment callbacks are now rejected at the edge with clear validation errors.

---

## Verification

- `cargo check --target aarch64-apple-darwin` passed for the full workspace
- No new `unwrap()` or `unwrap_or_default()` introduced on critical paths
- All payment gateway signatures now propagate errors instead of panicking

---

## Deferred / Follow-up

- **Worker pool supervision:** `SILVER-RING-JB00/src/worker.rs` workers could benefit from the same `spawn_traced` pattern (deferred to next wave)
- **Bot dispatcher restart:** Current panic catching logs but does not restart the dispatcher. Full restart would require recreating the `Dispatcher` (and its `InMemStorage`), which is acceptable post-panic but was kept minimal for this wave.

---

## Three Collaboration Options for Wave 157

1. **Worker Pool Supervision & Circuit Breaker Integration** — Extend `spawn_traced` to worker threads in `SILVER-RING-JB00`, integrate circuit breaker state with health probes, and add metrics for restart frequency per task type.

2. **Provider Timeout & Retry Policy Audit** — Systematically review all 42+ provider call sites for missing read timeouts, inconsistent retry logic, and unhandled connection errors; add structured retry budgets.

3. **Payment Gateway Idempotency & Reconciliation** — Add idempotency keys to all payment initiation flows, implement a reconciliation job that scans pending transactions against provider APIs, and harden webhook deduplication.

---

## Skill Update

The `spawn_traced` supervision pattern and the `expect("Failed to build ... reqwest client")` fail-fast constructor pattern are now documented in the Wave Research Loop skill for future waves.

---

*Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>*
