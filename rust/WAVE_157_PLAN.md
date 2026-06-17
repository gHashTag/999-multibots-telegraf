# Wave 157 Security Plan — SQL Injection, Payment Integrity & Race Condition Elimination

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** Close SQL injection vectors, enforce payment signature verification, eliminate race conditions in balance operations

---

## Phase 1: CRITICAL — SQL Injection in Job Queue

**File:** `rings/SILVER-RING-JB00/src/queue.rs`

**Problem:** Raw SQL string interpolation with manual single-quote escaping for `job_types`, `error` messages, `status`, and `id` in `dequeue()`, `update_status()`, and `retry_stuck()`. Manual escaping is insufficient against SQL injection.

**Fix:** Refactor to parameterized queries using `sqlx::query_as!` or `Statement::from_sql_and_values` with `$N` placeholders. For dynamic `IN` clauses, generate placeholder list dynamically.

**Reference:** OWASP SQL Injection Cheat Sheet; PostgreSQL parameterized query documentation

---

## Phase 2: CRITICAL — Robokassa Signature Verification Missing

**File:** `rings/SILVER-RING-PY00/src/robokassa.rs`

**Problem:** `verify_callback` extracts fields from the callback but never calls `generate_signature` with `password2` to verify the `SignatureValue`. Anyone can forge payment completion callbacks.

**Fix:** In `verify_callback`, reconstruct the signature using `password2` and compare against the provided `SignatureValue`. Reject mismatches with `AppError::Validation`.

**Reference:** Robokassa API documentation — ResultURL signature verification

---

## Phase 3: CRITICAL — Duplicate Payment Processing (Idempotency)

**Files:**
- `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
- `rings/SILVER-RING-PY00/src/services/payment_processor.rs`

**Problem:** Both payment completion paths update transaction status and credit balance without checking if the transaction was already completed. Duplicate callbacks from payment providers will credit users multiple times.

**Fix:** Load the transaction first. If `status == Completed`, return success early without modifying balance. Log as security event.

**Reference:** NIST SP 800-63B — Digital Identity Guidelines; Stripe Idempotency documentation

---

## Phase 4: CRITICAL — TOCTOU in Balance Deduction

**Files:**
- `rings/SILVER-RING-DB00/src/repository.rs` (`deduct_balance`)
- `rings/SILVER-RING-SN00/src/generation_utils.rs` (`dispatch_and_reply`)
- `rings/SILVER-RING-SN00/src/face_swap.rs`, `hedra_render.rs`, `music_generation.rs`, `ai_reels.rs`

**Problem:** Balance is read, checked in application code, then updated in separate DB calls. Concurrent requests can interleave and cause overdrafts.

**Fix:** Replace with atomic `UPDATE users SET balance = balance - $1 WHERE telegram_id = $2 AND balance >= $1`, then check `rows_affected()`. Remove separate `check_balance` + `deduct_balance` pattern from handlers.

**Reference:** ACID transaction isolation; PostgreSQL `UPDATE ... RETURNING`

---

## Phase 5: HIGH — Secret Store Error Body Silencing

**File:** `rings/SILVER-RING-SC00/src/store.rs:82,116`

**Problem:** `resp.text().await.unwrap_or_default()` on non-success HTTP responses silently masks Infisical API errors, making auth failures impossible to debug.

**Fix:** Replace with `map_err` that propagates the body-read error with context.

---

## Phase 6: MEDIUM — Information Disclosure in Payment Errors

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs:33,37,64`

**Problem:** Raw parse errors and gateway verification errors are returned directly in HTTP response bodies, leaking internal details to external callers.

**Fix:** Return generic error messages to the caller; log actual errors internally with `tracing::warn!`.

---

## Phase 7: MEDIUM — std::sync::Mutex in Async Context

**File:** `rings/SILVER-RING-AI00/src/circuit_breaker.rs`

**Problem:** `last_failure` uses `std::sync::Mutex` inside async code, blocking the Tokio runtime worker thread when contended.

**Fix:** Replace with `tokio::sync::Mutex` or use `AtomicU64` for timestamp storage to avoid locking entirely.

---

## Verification

- `cargo check --target aarch64-apple-darwin`
- Run existing integration tests
- Confirm no new SQL injection vectors introduced

---

## Commit Message Template

```
feat: Wave 157 security hardening (rust)

- CRITICAL: SQL injection vectors eliminated in job queue (parameterized queries)
- CRITICAL: Robokassa signature verification implemented
- CRITICAL: Duplicate payment processing protected with idempotency guard
- CRITICAL: TOCTOU race eliminated in balance deduction (atomic UPDATE)
- HIGH: Secret store error body silencing fixed
- MEDIUM: Information disclosure in payment webhooks fixed
- MEDIUM: std::sync::Mutex replaced in async circuit breaker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
