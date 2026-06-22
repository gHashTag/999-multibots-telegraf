# Wave 245 Security Plan

**Date:** 2026-06-16
**Theme:** Router middleware hardening — extract hardcoded security values to named constants

---

## Fix 1: Extract HSTS max-age constants (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** The `edge_hardening` middleware and `build_sanitized_response` function both inject `Strict-Transport-Security` headers with hardcoded `max-age=63072000` and `max-age=31536000` literals. These are security-critical values that control HTTPS enforcement duration.

**Solution:**
- Add `const HSTS_MAX_AGE_MAIN: u64 = 63072000;` (2 years)
- Add `const HSTS_MAX_AGE_SANITIZED: u64 = 31536000;` (1 year)
- Replace the hardcoded string literals with formatted constants.

---

## Fix 2: Extract body limit constants (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** `DefaultBodyLimit::max(256 * 1024)` (webhook body limit) and `DefaultBodyLimit::max(2 * 1024 * 1024)` (global body limit) appear as bare expressions in both `create_router` and `create_router_with_payments`. These are DoS-prevention values that should be named constants.

**Solution:**
- Add `const WEBHOOK_BODY_LIMIT_BYTES: usize = 256 * 1024;`
- Add `const GLOBAL_BODY_LIMIT_BYTES: usize = 2 * 1024 * 1024;`
- Replace the four bare expressions with the named constants.

---

## Fix 3: Extract rate limit constants (MEDIUM)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** Rate limit parameters (`10, 20` for health, `2, 30` for webhooks, `1, 10` for payments) appear as bare numeric literals in both router constructors. These control DoS resilience and should be named constants.

**Solution:**
- Add `const HEALTH_RATE_PER_SECOND: u64 = 10;` and `const HEALTH_RATE_BURST: u32 = 20;`
- Add `const WEBHOOK_RATE_PER_SECOND: u64 = 2;` and `const WEBHOOK_RATE_BURST: u32 = 30;`
- Add `const PAYMENT_RATE_PER_SECOND: u64 = 1;` and `const PAYMENT_RATE_BURST: u32 = 10;`
- Replace all bare numeric literals with the named constants.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `trios-mb-server`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — SQLx database timeout externalization
Extract the bare `Duration::from_secs(N)` in `SILVER-RING-DB00/src/repository.rs` sqlx options to named constants.

### Variant B — CORS origin validation hardening
Review `build_cors()` for additional hardening opportunities (e.g., reject wildcard origins, validate scheme).

### Variant C — Health check endpoint hardening
Add request-size limits or additional validation to the health check endpoints.
