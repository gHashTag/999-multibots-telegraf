# Wave 249 Security Plan

**Date:** 2026-06-16
**Theme:** Payment webhook body limit + DB error sanitization sweep in critical functions

---

## Fix 1: Add body size limit to payment webhook router (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** The payment webhook router (`/api/payment-success`) lacks an explicit body size limit. Payment callbacks could be abused with oversized payloads.

**Solution:**
- Add `.layer(axum::extract::DefaultBodyLimit::max(...))` to the payments router with a reasonable limit (e.g., 16 KB) to cover Robokassa form data.

---

## Fix 2: Sanitize DB errors in `get_user_by_telegram_id` (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `get_user_by_telegram_id` returns raw database errors via `e.to_string()` in `map_err`, leaking schema details.

**Solution:**
- Replace the raw error with `sanitize_db_error("get_user_by_telegram_id", e)`.

---

## Fix 3: Sanitize DB errors in `create_user` (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `create_user` returns raw database errors via `e.to_string()` on insert, potentially leaking constraint violations or table names.

**Solution:**
- Replace the raw error with `sanitize_db_error("create_user", e)`.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `trios-mb-server` and `trios-mb-db`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Remaining DB error sanitization sweep
Apply `sanitize_db_error` to the remaining ~35 DB error sites in `repository.rs`.

### Variant B — Webhook body limit consistency audit
Verify all webhook and payment routers have appropriate body limits.

### Variant C — Input length cap in webhook payload structs
Add `deny_unknown_fields` + serde length validation to webhook payload structs.
