# Wave 246 Security Plan

**Date:** 2026-06-16
**Theme:** Database layer hardening — connection pool constants + duplicate constant consolidation

---

## Fix 1: Extract DB connection pool constants (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `PostgresDatabase::connect` configures the connection pool with bare literals: `connect_timeout(Duration::from_secs(5))`, `idle_timeout(Duration::from_secs(60))`, and `max_connections(20)`. These control connection resilience and resource limits.

**Solution:**
- Add `const DB_CONNECT_TIMEOUT_SECS: u64 = 5;`
- Add `const DB_IDLE_TIMEOUT_SECS: u64 = 60;`
- Add `const DB_MAX_CONNECTIONS: u32 = 20;`
- Replace bare literals with named constants.

---

## Fix 2: Consolidate duplicate function-level string length constants (MEDIUM)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `MAX_PROMPT_LEN` (2000) is defined identically in `save_prompt` and `create_generation`. `MAX_RESULT_URL_LEN` (4096) is defined identically in `save_prompt`, `update_generation_status`, and `update_generation_status_owned`. `MAX_ERROR_LEN` (1024) is defined identically in `update_generation_status` and `update_generation_status_owned`. Duplicate function-level constants are a maintenance risk.

**Solution:**
- Move `MAX_PROMPT_LEN` to module level.
- Move `MAX_RESULT_URL_LEN` to module level.
- Move `MAX_ERROR_LEN` to module level.
- Remove the duplicate definitions from inside functions.

---

## Fix 3: Extract transaction page size limit and default user constants (MEDIUM)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `get_transactions_by_telegram_id` hardcodes `100` as the maximum page size. `create_user` hardcodes `level: 1` and `balance: 0.0` as default values for new users.

**Solution:**
- Add `const MAX_TRANSACTION_PAGE_SIZE: i64 = 100;`
- Add `const DEFAULT_USER_LEVEL: i32 = 1;`
- Add `const DEFAULT_USER_BALANCE: f64 = 0.0;`
- Replace bare literals with named constants.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `trios-mb-db`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — CORS origin scheme validation
Add `http://` or `https://` scheme validation in `build_cors()` before accepting origins.

### Variant B — Health check endpoint hardening
Remove timestamp fingerprinting from `health_check()` or add request-size limits.

### Variant C — Missing user balance sentinel constant
Extract the `0.0` sentinel in `get_balance` to a named constant.
