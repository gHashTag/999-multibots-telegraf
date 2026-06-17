# Wave 159 Security Report

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Focus:** Silent failures, data integrity, input validation, secret hygiene, CORS hardening, worker supervision, SSRF defense

---

## Executive Summary

Wave 159 fixes four CRITICAL bugs that caused silent operational failures or data corruption, plus seven HIGH-severity weaknesses around input validation, secrets, CORS, and worker supervision.

**CRITICAL fixes:**
1. PostgreSQL parameterized interval syntax in `retry_stuck`
2. `str_to_media_type` / `str_to_generation_status` silent defaulting
3. Worker using wrong UUID for generation status updates
4. Robokassa webhook parsing transaction ID as UUID (always failing)

**HIGH fixes:**
5. `add_balance` accepts negative amounts
6. `create_user` accepts `telegram_id <= 0`
7. `get_transactions_by_telegram_id` unbounded limit
8. `handle_generation_job` missing `telegram_id > 0` guard
9. `AppConfig` Debug leaks secrets
10. CORS falls back to `Any` when origins missing
11. Worker panics are invisible / no restart
12. Provider reqwest clients allow redirects (SSRF bypass)
13. `update_transaction_status` silently defaults on serialization failure

---

## Phase 1 — CRITICAL: Silent Failures & Data Integrity

### 1.1 `retry_stuck` SQL Syntax Fix
**File:** `rings/SILVER-RING-JB00/src/queue.rs`
**Problem:** `INTERVAL '$1 seconds'` is invalid PostgreSQL syntax — parameters are not substituted inside string literals. The query would either error or treat `$1` as literal text, breaking stuck-job retry.
**Fix:** Changed to `NOW() - INTERVAL '1 second' * $1`, which evaluates `$1` as an integer expression outside the string literal.

### 1.2 Enum Mapping Fail-Closed
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `str_to_media_type` and `str_to_generation_status` returned safe defaults (`Image`, `Queued`) for unrecognized DB strings. Data corruption or injection would be silently hidden.
**Fix:** Both now return `Result<..., AppError>` with an explicit error for unknown values. `get_generation` propagates the error instead of defaulting.

### 1.3 Worker UUID Mismatch
**File:** `rings/BRONZE-RING-APP/src/main.rs`, `rings/SILVER-RING-SN00/src/generation_utils.rs`
**Problem:** `create_generation` generates a UUID for the `generations` table, but the job payload did not include it. The worker used `job.id` (the job-queue UUID) in `update_generation_status`, which never matched any generation row. All completions/failures silently no-opped.
**Fix:** After `create_generation`, the generation UUID is now embedded in `request.params["generation_id"]`. The worker extracts it and passes the correct UUID to `update_generation_status`.

### 1.4 Robokassa Webhook Transaction Lookup
**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`, `rings/SILVER-RING-PY00/src/robokassa.rs`
**Problem:** `verify_callback` returns `transaction_id` = Robokassa `InvId` (a timestamp string). The handler tried `uuid::Uuid::parse_str()` on it, which always failed, skipping the entire balance-credit block. Users paid but were never credited.
**Fix:** Added `get_transaction_by_external_id(&self, external_id: &str)` to the `Database` trait and repository. The webhook now looks up the transaction by `external_id` instead of parsing as UUID.

---

## Phase 2 — HIGH: Input Validation at Repository Boundary

### 2.1 `add_balance` Negative Amount Guard
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Fix:** Rejects `amount < 0.0` with `AppError::Validation` before executing the SQL UPDATE.

### 2.2 `create_user` Sentinel Guard
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Fix:** Rejects `telegram_id <= 0` with `AppError::Validation` before inserting.

### 2.3 `get_transactions_by_telegram_id` Limit Cap
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Fix:** Added `safe_limit` clamp: `1 <= limit <= 10_000`. Prevents OOM from `i64::MAX`.

### 2.4 `handle_generation_job` Telegram ID Guard
**File:** `rings/BRONZE-RING-APP/src/main.rs`
**Fix:** Added `if request.telegram_id <= 0 { return Err(...); }` before any Bot API or DB call.

---

## Phase 3 — HIGH: Secret Hygiene & CORS Hardening

### 3.1 `AppConfig` Debug Redaction
**File:** `rings/GOLD-RING-TY00/src/config.rs`
**Fix:** Removed `#[derive(Debug)]` and implemented `std::fmt::Debug` manually, redacting `infisical_client_secret` and `database_url` as `"[REDACTED]"`.

### 3.2 CORS Fallback Removal
**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Fix:** When `FRONTEND_URL` is unset or all origins are invalid, CORS now denies cross-origin requests instead of falling back to `allow_origin(Any)`.

---

## Phase 4 — HIGH: Worker Supervision

### 4.1 Worker Panic Monitoring
**File:** `rings/SILVER-RING-JB00/src/worker.rs`
**Fix:** Each poll cycle now spawns the actual work as a nested `tokio::spawn` and `await`s the `JoinHandle`. On `Err(e)` from the handle (panic), logs at `error!` level and waits 5s before restarting the loop.

---

## Phase 5 — MEDIUM: SSRF Defense & Serialization Safety

### 5.1 Provider Redirect Policy
**File:** `rings/SILVER-RING-AI00/src/providers/{elevenlabs,fal,hedra,heygen,kie,midjourney,openai,replicate}.rs`
**Fix:** Added `.redirect(reqwest::redirect::Policy::none())` to all 8 provider reqwest client builders. Prevents SSRF bypass via HTTP 302 redirects to internal/metadata endpoints.

### 5.2 `update_transaction_status` Serialization Safety
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Fix:** Replaced `serde_json::to_string(&status).unwrap_or_default()` with `map_err(|e| AppError::Internal(...))?`. Prevents silent empty-string corruption in the status column.

---

## Verification

- Full workspace `cargo check --target aarch64-apple-darwin` passes cleanly.
- `cargo check` for all workspace members passes.
- All CRITICAL items verified by code inspection.
- Compilation includes `trios-mb-e2e-tests` without regression.

---

## Deferred Items

1. **InMemStorage migration** — Dialogue state is still in-memory; migrate to Redis for persistence across restarts.
2. **Tracing instrumentation** — Telegram scene handlers still lack `#[tracing::instrument]`.
3. **Generation ownership validation** — `get_generation` / `update_generation_status` still accept only a UUID; add `telegram_id`-scoped overloads for IDOR prevention.
4. **Strict URL parsing** — `validate_result_url` in webhooks.rs still uses substring matching; replace with `url::Url` parse.
5. **Differentiated rate-limit buckets** — All routes share one `1 req/s, burst 60` config.
6. **Balance DB column migration** — `users.balance` and `Transaction.amount` remain `f64`.
7. **Webhook replay protection** — No idempotency key or HMAC over payload body.
8. **Secrets as `SecretString`** — Only `AppConfig::Debug` was hardened; actual fields are still `String`.

---

## Cooperation Options for Wave 160

**Option A — Deep Data Integrity**
- Migrate `InMemStorage` to Redis-backed dialogue storage
- Add `telegram_id`-scoped generation methods (IDOR fix)
- Implement strict `url::Url` parsing for webhook result URLs
- Add DB-level CHECK constraints for `balance >= 0`, `telegram_id > 0`

**Option B — Observability & Tracing**
- Add `#[tracing::instrument]` to all 50+ Telegram scene handlers
- Add Prometheus metrics for generation success/failure rates per provider
- Build health endpoint that checks actual provider liveness (not just env var presence)
- Add structured security-event logging for every validation failure

**Option C — API Abuse Hardening**
- Implement differentiated rate-limit buckets (webhooks vs health vs payments)
- Add webhook replay protection with HMAC payload signatures
- Migrate sensitive `AppConfig` fields to `secrecy::SecretString`
- Add API-key or JWT middleware to protect non-webhook routes

---

*End of Wave 159 Report*
