# Wave 248 Security Report

**Date:** 2026-06-16
**Theme:** CORS wildcard rejection, health check body limits, DB error message sanitization

---

## Summary

Wave 248 adds CORS wildcard rejection, body size limits on health endpoints, and begins sanitizing raw database error messages that leak internal schema details. All changes compiled on first attempt with zero warnings.

---

## Fix 1: CORS origin wildcard rejection

**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Severity:** HIGH

`build_cors()` did not reject origins containing `*` (wildcards). Wildcard origins in CORS are dangerous and should never be accepted, as they effectively allow any origin.

**Changes:**
- Added `if o.contains('*') { ... }` check before the scheme validation.
- Logs a warning and skips origins that contain wildcards.

---

## Fix 2: Health check body size limit

**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Severity:** MEDIUM

The health check router (`/health`, `/health/simple`) lacked an explicit body size limit. While health checks are typically GET requests, adding a limit provides defense-in-depth against potential abuse.

**Changes:**
- Added `.layer(axum::extract::DefaultBodyLimit::max(4096))` to the health router in both `create_router` and `create_router_with_payments`.

---

## Fix 3: DB error message sanitization

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** HIGH

Raw database errors (`e.to_string()` from sea_orm/sqlx) were forwarded verbatim to callers in 40+ locations. These messages leak table names, column names, constraint names, and SQL fragments — a significant information disclosure vulnerability.

**Changes:**
- Added `sanitize_db_error()` helper that logs the raw error via `tracing::error!()` and returns a generic message to callers.
- Applied the helper to the three most critical functions: `connect`, `health_check`, and `complete_robokassa_payment`.

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-server -p trios-mb-db
    Checking trios-mb-server v0.1.0
    Checking trios-mb-db v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.96s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — Remaining DB error sanitization sweep
Apply the `sanitize_db_error` helper to the remaining 37+ DB error sites in `repository.rs`.

### Variant B — Webhook handler input validation hardening
Add stricter input validation to webhook handlers (`replicate_webhook`, `kie_ai_webhook`).

### Variant C — Payment webhook body size limit
Add explicit body size limits to the payment webhook router.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
