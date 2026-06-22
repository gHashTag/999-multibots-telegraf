# Wave 250 Security Report

**Date:** 2026-06-16
**Theme:** DB error sanitization batch — migration, add_balance, create_transaction

---

## Summary

Wave 250 continues the DB error sanitization sweep, focusing on three critical operations: migration execution, balance addition, and transaction creation. All changes compiled on first attempt with zero warnings.

---

## Fix 1: Sanitize DB error in `run_migrations`

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** HIGH

`run_migrations` returned raw database migration errors via `e.to_string()`, potentially leaking schema details at startup. Startup errors are particularly dangerous because they may be exposed in logs or crash reports before the application is fully initialized.

**Changes:**
- Replaced the raw error with `sanitize_db_error("run_migrations", e)`.

---

## Fix 2: Sanitize DB error in `add_balance`

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** HIGH

`add_balance` executes raw SQL to update user balances. On failure, the raw Postgres error was forwarded to callers, potentially leaking table names (`users`), column names (`balance`, `updated_at`), and SQL fragments.

**Changes:**
- Replaced the raw error with `sanitize_db_error("add_balance", e)`.

---

## Fix 3: Sanitize DB error in `create_transaction`

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** HIGH

`create_transaction` inserts payment records into the database. On failure, raw constraint violation errors were forwarded to callers, potentially leaking table structure, constraint names, and column information.

**Changes:**
- Replaced the raw error with `sanitize_db_error("create_transaction", e)`.

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-db
    Checking trios-mb-db v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.06s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — Remaining DB error sanitization sweep
Apply `sanitize_db_error` to the remaining ~30 DB error sites in `repository.rs`.

### Variant B — Webhook payload status validation
Add explicit validation for unexpected `status` values in Replicate webhook payloads.

### Variant C — Payment callback input hardening
Add additional input validation (e.g., regex for inv_id format) in `robokassa_callback`.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
