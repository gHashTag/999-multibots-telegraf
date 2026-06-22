# Wave 255 Plan

**Theme:** Defense-in-depth hardening — worker error truncation, payment amount re-validation, startup observability.

---

## Fix 1 — Worker error string truncation before DB write

**File:** `rings/SILVER-RING-JB00/src/worker.rs`

`err_str = e.to_string()` at line 337 is passed to `queue.update_status(job_id, status, Some(&err_str))`. Even though the DB layer truncates to `MAX_ERROR_LEN = 1024`, defense-in-depth requires truncation at the worker boundary to prevent oversized strings from traversing the async boundary.

Replace with:
```rust
let err_str = trios_mb_types::truncate_for_log(&e.to_string(), 1024);
```

---

## Fix 2 — Payment processor amount re-validation in `verify_and_complete`

**File:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs`

`verify_and_complete` loads `tx.amount` from the DB and passes it directly to `add_balance` without re-validating it. While the transaction was created with validation, a corrupted DB record could contain non-finite values.

Add `is_finite()` guard on `tx.amount` before `add_balance`, matching the pattern already used in `refund` and `direct_debit`.

---

## Fix 3 — Webhook secret loader instrumentation

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

`load_webhook_secret` is a startup-critical function that currently lacks `#[tracing::instrument]`. Adding `#[tracing::instrument(skip_all)]` improves observability during startup failures.

---

**Verification:**
- `cargo check -p trios-mb-jobs --target aarch64-apple-darwin`
- `cargo check -p trios-mb-payment --target aarch64-apple-darwin`
- `cargo check -p trios-mb-server --target aarch64-apple-darwin`

**Commit:** `security: worker error truncation, payment amount re-validation, webhook loader instrumentation (Wave 255)`
