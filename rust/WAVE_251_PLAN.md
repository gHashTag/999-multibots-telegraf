# Wave 251 Security Plan

**Date:** 2026-06-16
**Theme:** DB error sanitization batch — user update functions + transaction lookup functions

---

## Fix 1: Sanitize DB errors in user profile update functions (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `update_user_language`, `update_user_gender`, and `update_user_level` each have two raw DB error sites (find + update). These user-facing operations leak schema details on failure.

**Solution:**
- Replace all six raw errors with `sanitize_db_error("update_user_*", e)`.

---

## Fix 2: Sanitize DB errors in `update_user_voice` and `update_user_model` (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `update_user_voice` and `update_user_model` each have two raw DB error sites (find + update).

**Solution:**
- Replace all four raw errors with `sanitize_db_error("update_user_*", e)`.

---

## Fix 3: Sanitize DB errors in transaction lookup and update functions (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `get_transaction`, `get_transaction_by_external_id`, and `update_transaction_status` have raw DB error sites. These are used by the payment callback flow and should not leak schema details.

**Solution:**
- Replace all raw errors in these three functions with `sanitize_db_error("function_name", e)`.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `trios-mb-db`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Remaining DB error sanitization sweep
Apply `sanitize_db_error` to the remaining ~20 DB error sites in `repository.rs` (subscription, prompt, generation functions).

### Variant B — Webhook payload length validation
Add max-length serde validation to webhook payload string fields.

### Variant C — Payment callback inv_id format validation
Add numeric format validation for `inv_id` in `robokassa_callback`.
