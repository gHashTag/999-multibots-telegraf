# Wave 247 Security Report

**Date:** 2026-06-16
**Theme:** CORS scheme validation, health check fingerprinting removal, balance sentinel constant

---

## Summary

Wave 247 hardens CORS origin validation, removes server-time fingerprinting from the health endpoint, and adds a named sentinel constant for missing-user balance lookups. All changes compiled on first attempt with zero warnings.

---

## Fix 1: CORS origin scheme validation

**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Severity:** HIGH

`build_cors()` accepted origins from `FRONTEND_URL` without validating that they have a proper scheme (`http://` or `https://`). A value like `example.com` without a scheme would be accepted as-is, which could lead to unexpected CORS behavior or origin spoofing.

**Changes:**
- Added a scheme check before adding each origin: `if !(o.starts_with("http://") || o.starts_with("https://")) { ... }`
- Logs a warning and skips origins that lack a valid scheme.

---

## Fix 2: Health check timestamp fingerprinting removal

**File:** `rings/BRONZE-RING-SRV/src/health.rs`
**Severity:** MEDIUM

`health_check()` returned a precise timestamp (`chrono::Utc::now().to_rfc3339()`) in the JSON body. This leaked the exact server time, which is a form of information disclosure and can aid timing attacks or version fingerprinting.

**Changes:**
- Removed the `timestamp` field from the health check response.
- Kept only the `status` field, which is sufficient for health monitoring.

---

## Fix 3: Missing user balance sentinel constant

**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Severity:** MEDIUM

`get_balance` returned a bare `0.0` sentinel value for non-existent users. This magic number appeared in both the warning log and the return value but lacked a named constant, making it unclear whether this was a real balance or a sentinel.

**Changes:**
- Added `const MISSING_USER_BALANCE_SENTINEL: f64 = 0.0;`
- Replaced the bare `0.0` in the warning log and return value with the named constant.
- Updated the warning log message to say "returning sentinel" instead of "returning 0.0 sentinel".

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-server -p trios-mb-db
    Checking trios-mb-server v0.1.0
    Checking trios-mb-db v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 8.69s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — CORS origin wildcard rejection
Reject origins containing `*` (wildcards) in `build_cors()`.

### Variant B — Health check response size limit
Add a `DefaultBodyLimit` or response-size cap to the health check endpoints.

### Variant C — DB repository error message sanitization
Audit `repository.rs` error messages returned to callers for potential info disclosure.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
