# Wave 161 Security Report

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Focus:** Atomic financial operations, webhook DB timeouts, rate-limit isolation, IDOR closure, secret redaction

---

## Executive Summary

Wave 161 closes one CRITICAL race-condition vector in payment webhooks, eliminates three HIGH-severity reliability gaps (rate-limit sharing, unbounded DB waits, leaked signatures), and adds MEDIUM-severity IDOR infrastructure.

**CRITICAL fixes:**
1. `complete_robokassa_payment` — atomic CTE that updates transaction status **and** credits balance in a single PostgreSQL query, eliminating the double-spend window between status update and balance addition.

**HIGH fixes:**
2. `get_transactions_by_telegram_id` fail-closed — replaces remaining `unwrap_or` on payment enum deserialization (missed in Wave 160).
3. `RobokassaCallbackForm` Debug redaction — masks `signature_value` to prevent credential leaks in logs.
4. Per-route rate-limit buckets — health (10/s burst 20), webhooks (2/s burst 30), payments (1/s burst 10) instead of one shared global bucket.
5. Webhook DB timeouts — every DB call inside `replicate_webhook`, `kie_ai_webhook`, and `robokassa_callback` wrapped in `tokio::time::timeout(10s)`, returning `503 Service Unavailable` on timeout so providers back off.

**MEDIUM fixes:**
6. `get_generation_owned` / `update_generation_status_owned` — new `Database` trait methods that scope generation lookups and mutations by `telegram_id`, closing the IDOR surface at the repository boundary.

**LOW fixes:**
7. `tracing::instrument` on `poll_and_execute` and `run_retry_maintenance` in the worker pool.

---

## Phase 1 — CRITICAL: Atomic Financial Operations

### 1.1 Robokassa double-spend elimination
**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`, `rings/SILVER-RING-DB00/src/repository.rs`, `rings/GOLD-RING-TR00/src/database.rs`
**Problem:** `update_transaction_status` + `add_balance` were two sequential, non-atomic DB calls. A concurrent replay of the same Robokassa callback could interleave after the idempotency pre-check, resulting in duplicated balance credits.
**Fix:** Added `complete_robokassa_payment(&self, tx_id, telegram_id, amount)` to the `Database` trait. The implementation uses a single PostgreSQL CTE:
```sql
WITH updated_tx AS (
    UPDATE payments_v2
    SET status = 'Completed', updated_at = NOW()
    WHERE id = $1 AND status <> 'Completed'
    RETURNING id
)
UPDATE users
SET balance = balance + $2, updated_at = NOW()
WHERE telegram_id = $3
  AND EXISTS (SELECT 1 FROM updated_tx)
```
- Returns `true` if both updates ran (first successful callback).
- Returns `false` if the transaction was already completed (idempotent skip).
- `rows_affected() > 0` is the discriminant.

The handler was refactored to call this atomic method when `verification.telegram_id` is present. If `telegram_id` is absent, it falls back to `update_transaction_status` alone (no balance at stake).

### 1.2 `get_transactions_by_telegram_id` fail-closed
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** The list method still used `unwrap_or` on `serde_json::from_str` for `PaymentMethod` and `PaymentStatus`, silently defaulting corrupted rows. Wave 160 fixed `get_transaction` and `get_transaction_by_external_id` but missed the list variant.
**Fix:** Replaced `unwrap_or` with `map_err` inside a fallible `Iterator::map` + `collect` that propagates `AppError::Internal` on malformed JSON.

---

## Phase 2 — HIGH: Webhook Resilience & Secret Hygiene

### 2.1 `RobokassaCallbackForm` Debug redaction
**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Fix:** Replaced `#[derive(Debug)]` with manual `impl std::fmt::Debug` that renders `signature_value` as `"[REDACTED]"`.

### 2.2 Webhook DB call timeouts
**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Fix:** Added `const WEBHOOK_DB_TIMEOUT: Duration = Duration::from_secs(10)` to both modules. Every DB I/O point (`get_generation`, `update_generation_status`, `get_transaction_by_external_id`, `complete_robokassa_payment`, `update_transaction_status`) is wrapped in `tokio::time::timeout`. On `Err(Elapsed)`, the handler returns `(StatusCode::SERVICE_UNAVAILABLE, Json(...))` with a `{"error": "DB timeout, retry later"}` body, signaling the provider to back off.

### 2.3 Rate-limit isolation
**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Problem:** One global `GovernorLayer(1 req/s, burst 60)` covered health probes, Replicate webhooks, Kie.ai webhooks, and Robokassa callbacks. A monitoring burst could starve revenue-bearing requests.
**Fix:** Replaced the single layer with per-group sub-routers, each carrying its own `route_layer`:
- **Health** (`/health`, `/health/simple`): `per_second: 10, burst_size: 20`
- **Webhooks** (`/api/webhooks/*`): `per_second: 2, burst_size: 30`
- **Payments** (`/api/payment-success`): `per_second: 1, burst_size: 10`
Extracted duplicated CORS construction into a `build_cors()` helper.

---

## Phase 3 — MEDIUM: IDOR Closure

### 3.1 Scoped generation methods
**Files:** `rings/GOLD-RING-TR00/src/database.rs`, `rings/SILVER-RING-DB00/src/repository.rs`, `rings/TEST-UTILS/src/mock_database.rs`
**Fix:** Added three new trait methods:
- `get_generation_owned(id, telegram_id)` — adds `AND telegram_id = $2` to the WHERE clause.
- `update_generation_status_owned(id, telegram_id, status, result_url, error)` — same scoped guard before updating.
- `complete_robokassa_payment(tx_id, telegram_id, amount)` — described in Phase 1.

Both the `PostgresDatabase` and `MockDatabase` implementations were updated. The methods are available for handler adoption in Wave 162.

---

## Phase 4 — LOW: Observability

### 4.1 Worker pool instrumentation
**File:** `rings/SILVER-RING-JB00/src/worker.rs`
**Fix:** Added `#[tracing::instrument]` to `poll_and_execute` (fields: `worker_name`) and `run_retry_maintenance` (fields: `interval_ms`).

---

## Verification

- Full workspace `cargo check --target aarch64-apple-darwin` passes cleanly.
- `cargo check` for all workspace members passes.
- CRITICAL: `complete_robokassa_payment` compiles in both `PostgresDatabase` and `MockDatabase`.
- HIGH: `get_transactions_by_telegram_id` contains zero `unwrap_or` on payment enums.
- HIGH: `RobokassaCallbackForm` Debug output masks `signature_value`.
- HIGH: Separate `rate_limit_layer` instances exist for each route group.
- HIGH: All webhook DB calls use `tokio::time::timeout`.
- MEDIUM: `get_generation_owned` and `update_generation_status_owned` compile and enforce `telegram_id` scope.

---

## Deferred Items

1. **InMemStorage → Redis migration** — requires Redis infra + schema migration.
2. **`f64` → `Money` column migration** — too large for one wave; design `Money(i64)` newtype first.
3. **`AppConfig` secrets → `SecretString`** — runtime dependency on `secrecy` crate.
4. **Bot dispatcher auto-restart loop** — panics are logged but bots do not auto-restart.
5. **Webhook idempotency table** — persistent `(provider, event_id)` dedup cache with 24h TTL.
6. **`tracing::instrument` on ~40 Telegram scene handlers** — needs `Debug` impls or macro-based skips for `dyn Database`.
7. **Strict URL parsing via `url` crate** — current heuristic validation is pragmatic but bypassable.
8. **Differentiated rate-limit buckets per route group** — implemented for HTTP; Telegram dispatchers still unbounded.

---

## Cooperation Options for Wave 162

**Option A — Handler Hardening & Redis Migration**
- Wire `get_generation_owned` / `update_generation_status_owned` into all user-facing API routes
- Migrate `InMemStorage` to Redis-backed storage with TTL eviction
- Implement webhook idempotency table with provider-scoped dedup
- Add `#[tracing::instrument]` to Telegram scene handlers (resolve `dyn Database` Debug gap)

**Option B — Financial Precision & Secrets**
- Migrate `users.balance` and `Transaction.amount` columns to integer `Money` in minor units
- Convert `AppConfig` secrets to `secrecy::SecretString`
- Add DB `CHECK` constraints (`balance >= 0`, `telegram_id > 0`)
- Add `complete_robokassa_payment` integration tests in `e2e-tests`

**Option C — Resilience & Anti-Abuse**
- Implement bot dispatcher auto-restart with exponential backoff
- Add per-telegram_id rate limiting on `save_prompt` and generation creation
- Implement strict `url::Url` parsing for `validate_result_url`
- Add webhook body HMAC verification to prevent tampered replays

---

*End of Wave 161 Report*
