# Wave 250 Security Plan

**Date:** 2026-06-16
**Theme:** DB error sanitization batch — migration, add_balance, create_transaction

---

## Fix 1: Sanitize DB error in `run_migrations` (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `run_migrations` returns raw database migration errors via `e.to_string()`, potentially leaking schema details at startup.

**Solution:**
- Replace the raw error with `sanitize_db_error("run_migrations", e)`.

---

## Fix 2: Sanitize DB error in `add_balance` (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `add_balance` executes raw SQL to update user balances. On failure, the raw Postgres error is forwarded to callers, potentially leaking table and column names.

**Solution:**
- Replace the raw error with `sanitize_db_error("add_balance", e)`.

---

## Fix 3: Sanitize DB error in `create_transaction` (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `create_transaction` inserts payment records. On failure, raw constraint violation errors are forwarded to callers, potentially leaking table structure and constraint names.

**Solution:**
- Replace the raw error with `sanitize_db_error("create_transaction", e)`.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `trios-mb-db`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Remaining DB error sanitization sweep
Apply `sanitize_db_error` to the remaining ~30 DB error sites in `repository.rs`.

### Variant B — Webhook payload status validation
Add explicit validation for unexpected `status` values in Replicate webhook payloads.

### Variant C — Payment callback input hardening
Add additional input validation (e.g., regex for inv_id format) in `robokassa_callback`.
