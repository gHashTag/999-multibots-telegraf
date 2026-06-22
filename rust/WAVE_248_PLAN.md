# Wave 248 Security Plan

**Date:** 2026-06-16
**Theme:** CORS wildcard rejection, health check body limits, DB error message sanitization

---

## Fix 1: CORS origin wildcard rejection (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** `build_cors()` does not reject origins containing `*` (wildcards). Wildcard origins in CORS are dangerous and should never be accepted.

**Solution:**
- After the scheme check, add `if o.contains('*') { ... }` to reject wildcard origins with a warning log.

---

## Fix 2: Health check body size limit (MEDIUM)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** The health check router (`/health`, `/health/simple`) does not have an explicit body size limit. While health checks are GET requests, adding a limit provides defense-in-depth.

**Solution:**
- Add `.layer(axum::extract::DefaultBodyLimit::max(...))` to the health router with a small limit (e.g., 4 KB) to prevent abuse.

---

## Fix 3: DB error message sanitization (HIGH)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** Raw database errors (`e.to_string()` from sea_orm/sqlx) are forwarded verbatim to callers in 40+ locations. These error messages leak table names, column names, constraint names, and SQL fragments — a significant information disclosure vulnerability.

**Solution:**
- Add a helper function `sanitize_db_error(operation: &str) -> AppError` that returns a generic error message while preserving the raw error in tracing logs.
- Replace raw `e.to_string()` in the three most critical functions (`connect`, `health_check`, `complete_robokassa_payment`) with the sanitized helper.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `trios-mb-server` and `trios-mb-db`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Remaining DB error sanitization sweep
Apply the sanitized error helper to the remaining 37+ DB error sites in `repository.rs`.

### Variant B — Webhook handler input validation hardening
Add stricter input validation to webhook handlers (`replicate_webhook`, `kie_ai_webhook`).

### Variant C — Payment webhook body size limit
Add explicit body size limits to the payment webhook router.
