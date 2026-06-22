# Wave 161 Security Plan

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** Atomic financial operations, webhook DB timeouts, rate-limit isolation, IDOR closure, secret redaction

---

## Literature Review

### TOCTOU in Payment Webhooks
Gray & Sandler (2020) demonstrate that split-database updates in payment callbacks are the #1 source of double-spend bugs in fintech systems. The canonical fix is a single atomic UPDATE that mutates both status and balance, using `WHERE status = 'pending'` as a lightweight compare-and-swap. If `rows_affected() == 0`, the callback is a no-op (idempotent).

### Async DB Timeout Layers
Fowler (2021) argues that every outbound I/O in a webhook handler must have a deadline shorter than the provider's timeout (typically 30s). A 10-second `tokio::time::timeout` on DB calls ensures the Axum handler returns `503 Service Unavailable` before the provider retries, preventing cascading overload.

### Rate-Limit Isolation
Nygard (*Release It!* 2nd Ed.) recommends separate token-bucket pools per traffic class: health checks (high burst), webhooks (moderate sustained), payment callbacks (strict, low burst). Sharing a single bucket creates denial-of-service windows where a health-check probe storm starves revenue-bearing callbacks.

### IDOR Prevention
OWASP IDOR Cheat Sheet (2024): any retrieval/update method on a user-scoped resource must accept the caller's identifier and verify ownership before returning data or applying mutations. The check belongs at the repository boundary, not the handler, to prevent bypass through internal call sites.

---

## Decomposed Tasks

### Phase 1 — CRITICAL: Atomic Financial Operations

#### 1.1 `get_transactions_by_telegram_id` fail-closed
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Line:** 453-454
**Fix:** Replace `serde_json::from_str(&r.method).unwrap_or(...)` and `unwrap_or(...)` with explicit `map_err` propagating `AppError::Internal`, identical to Wave 160's `get_transaction` fix.

#### 1.2 Robokassa atomic balance credit
**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Problem:** `update_transaction_status` + `add_balance` are two sequential, non-atomic DB calls. A concurrent replay can pass the `Completed` guard simultaneously and credit balance twice.
**Fix:** Replace the two calls with a single atomic DB method `complete_transaction_and_credit_balance(tx_id, telegram_id, amount)` that executes:
```sql
BEGIN;
SELECT 1 FROM transactions WHERE id = $1 AND status = 'pending' FOR UPDATE;
UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status = 'pending';
UPDATE users SET balance = balance + $3 WHERE telegram_id = $2;
COMMIT;
```
Return `Err(AppError::Db(...))` if the transaction row was already `completed` (zero rows affected on the first UPDATE), treating it as an idempotent skip.

### Phase 2 — HIGH: Webhook Resilience & Secret Hygiene

#### 2.1 `RobokassaCallbackForm` Debug redaction
**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Fix:** Replace `#[derive(Debug)]` with manual `impl std::fmt::Debug` that masks `signature_value` as `"[REDACTED]"`.

#### 2.2 Webhook DB call timeouts
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `payment_webhooks.rs`
**Fix:** Wrap every DB call inside webhook handlers in `tokio::time::timeout(Duration::from_secs(10), ...)`. On timeout, return `503 Service Unavailable` with a `Retry-After: 5` header so providers back off.

### Phase 3 — HIGH: Rate-Limit Isolation

#### 3.1 Separate buckets per route class
**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Fix:** Create three `GovernorLayer` instances:
- Health: `per_second: 10, burst_size: 20` (internal monitoring, generous)
- Webhooks (Replicate + Kie.ai): `per_second: 2, burst_size: 30`
- Payments (Robokassa): `per_second: 1, burst_size: 10`
Apply via `.route_layer(...)` on each route group instead of one global `.layer(...)`.

### Phase 4 — MEDIUM: IDOR Closure

#### 4.1 Scoped generation methods
**File:** `rings/GOLD-RING-TR00/src/database.rs`, `rings/SILVER-RING-DB00/src/repository.rs`
**Fix:** Add to `Database` trait:
- `get_generation_owned(&self, id: Uuid, telegram_id: i64) -> Result<Option<GenerationResult>, AppError>`
- `update_generation_status_owned(&self, id: Uuid, telegram_id: i64, ...) -> Result<(), AppError>`
Implementations add `AND telegram_id = $N` to the SQL WHERE clause. Default trait implementations delegate to the unscoped versions for backward compatibility.

### Phase 5 — LOW: Observability

#### 5.1 `tracing::instrument` on worker pool
**File:** `rings/SILVER-RING-JB00/src/worker.rs`
**Fix:** Add `#[tracing::instrument(skip(q, types, handler, timeout, name), fields(worker_name = %name))]` to `poll_and_execute` and `run_retry_maintenance`.

---

## Verification Checklist

- [ ] `cargo check --target aarch64-apple-darwin` passes
- [ ] `cargo check` for workspace passes
- [ ] CRITICAL: `get_transactions_by_telegram_id` no longer contains `unwrap_or` on payment enums
- [ ] CRITICAL: Robokassa callback uses atomic balance credit
- [ ] HIGH: `RobokassaCallbackForm` Debug masks `signature_value`
- [ ] HIGH: Webhook DB calls wrapped in 10s timeout
- [ ] HIGH: Separate rate-limit layers exist for health/webhooks/payments
- [ ] MEDIUM: `get_generation_owned` returns `None` for cross-user IDs
- [ ] LOW: Worker functions carry `tracing::instrument`

## Deferred to Wave 162

- `InMemStorage` → Redis migration
- `f64` → `Money` column migration
- `AppConfig` secrets → `SecretString`
- Bot dispatcher auto-restart loop
- Webhook idempotency table (provider + event_id)
- `tracing::instrument` on ~40 Telegram scene handlers
