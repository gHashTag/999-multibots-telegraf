# Wave 245 Security Report

**Date:** 2026-06-16
**Theme:** Router middleware hardening — extract hardcoded security values to named constants

---

## Summary

Wave 245 extracts all remaining hardcoded security values in the router middleware to named constants, completing the hardening of the HTTP server stack. All changes compiled on first attempt with zero warnings.

---

## Fix 1: Extract HSTS max-age constants

**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Severity:** HIGH

The `edge_hardening` middleware and `build_sanitized_response` function both injected `Strict-Transport-Security` headers with hardcoded `max-age=63072000` and `max-age=31536000` string literals. These control HTTPS enforcement duration and should be named constants.

**Changes:**
- Added `const HSTS_MAX_AGE_MAIN: u64 = 63072000;` (2 years)
- Added `const HSTS_MAX_AGE_SANITIZED: u64 = 31536000;` (1 year)
- Replaced the hardcoded string literals with formatted constants.
- Added a fallback to the static literal in `from_str()` to ensure the header is never malformed.

---

## Fix 2: Extract body limit constants

**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Severity:** HIGH

`DefaultBodyLimit::max(256 * 1024)` (webhook body limit) and `DefaultBodyLimit::max(2 * 1024 * 1024)` (global body limit) appeared as bare expressions in both router constructors. These are DoS-prevention values.

**Changes:**
- Added `const WEBHOOK_BODY_LIMIT_BYTES: usize = 256 * 1024;`
- Added `const GLOBAL_BODY_LIMIT_BYTES: usize = 2 * 1024 * 1024;`
- Replaced the four bare expressions with the named constants.

---

## Fix 3: Extract rate limit constants

**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Severity:** MEDIUM

Rate limit parameters (`10, 20` for health, `2, 30` for webhooks, `1, 10` for payments) appeared as bare numeric literals in both router constructors. These control DoS resilience.

**Changes:**
- Added `const HEALTH_RATE_PER_SECOND: u64 = 10;` and `const HEALTH_RATE_BURST: u32 = 20;`
- Added `const WEBHOOK_RATE_PER_SECOND: u64 = 2;` and `const WEBHOOK_RATE_BURST: u32 = 30;`
- Added `const PAYMENT_RATE_PER_SECOND: u64 = 1;` and `const PAYMENT_RATE_BURST: u32 = 10;`
- Replaced all bare numeric literals with the named constants.

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-server
    Checking trios-mb-server v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.85s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — SQLx database timeout externalization
Extract the bare `Duration::from_secs(N)` in `SILVER-RING-DB00/src/repository.rs` sqlx options to named constants.

### Variant B — CORS origin validation hardening
Review `build_cors()` for additional hardening opportunities (e.g., reject wildcard origins, validate scheme).

### Variant C — Health check endpoint hardening
Add request-size limits or additional validation to the health check endpoints.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
