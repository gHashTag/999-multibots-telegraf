# Wave 251 Security Report

**Date:** 2026-06-16
**Theme:** DB error sanitization batch — user update functions + transaction lookup functions

---

## Summary

Wave 251 continues the DB error sanitization sweep across user profile update functions and transaction lookup/update functions. All changes compiled on first attempt with zero warnings.

---

## Fix 1: Sanitize DB errors in user profile update functions

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** HIGH

`update_user_language`, `update_user_gender`, and `update_user_level` each had two raw DB error sites (find + update). These user-facing operations leaked schema details on failure.

**Changes:**
- Replaced all six raw errors with `sanitize_db_error("update_user_*", e)`.

---

## Fix 2: Sanitize DB errors in `update_user_voice` and `update_user_model`

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** HIGH

`update_user_voice` and `update_user_model` each had two raw DB error sites (find + update).

**Changes:**
- Replaced all four raw errors with `sanitize_db_error("update_user_*", e)`.

---

## Fix 3: Sanitize DB errors in transaction functions

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** HIGH

`get_transaction`, `get_transaction_by_external_id`, and `update_transaction_status` had raw DB error sites. These are used by the payment callback flow and should not leak schema details.

**Changes:**
- Replaced all raw errors in these three functions with `sanitize_db_error("function_name", e)`.

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-db
    Checking trios-mb-db v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.59s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — Remaining DB error sanitization sweep
Apply `sanitize_db_error` to the remaining ~20 DB error sites in `repository.rs` (subscription, prompt, generation functions).

### Variant B — Webhook payload length validation
Add max-length serde validation to webhook payload string fields.

### Variant C — Payment callback inv_id format validation
Add numeric format validation for `inv_id` in `robokassa_callback`.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
