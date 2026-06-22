# Wave 247 Security Plan

**Date:** 2026-06-16
**Theme:** CORS scheme validation, health check fingerprinting removal, balance sentinel constant

---

## Fix 1: CORS origin scheme validation (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** `build_cors()` accepts origins from `FRONTEND_URL` without validating that they have a proper scheme (`http://` or `https://`). A value like `example.com` without a scheme would be accepted as-is, which could lead to unexpected CORS behavior or origin spoofing.

**Solution:**
- Before adding an origin to the allowed list, validate that it starts with `http://` or `https://`.
- Log a warning and skip origins that lack a valid scheme.

---

## Fix 2: Health check timestamp fingerprinting removal (MEDIUM)

**File:** `rings/BRONZE-RING-SRV/src/health.rs`

**Problem:** `health_check()` returns a precise timestamp (`chrono::Utc::now().to_rfc3339()`) in the JSON body. This leaks the exact server time, which is a form of information disclosure and can aid timing attacks or version fingerprinting.

**Solution:**
- Remove the `timestamp` field from the health check response.
- Keep only the `status` field.

---

## Fix 3: Missing user balance sentinel constant (MEDIUM)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

**Problem:** `get_balance` returns a bare `0.0` sentinel value for non-existent users. This magic number is used in the warning log and the return value but lacks a named constant, making it unclear whether this is a real balance or a sentinel.

**Solution:**
- Add `const MISSING_USER_BALANCE_SENTINEL: f64 = 0.0;`
- Replace the bare `0.0` in the warning log and return value with the named constant.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `trios-mb-server` and `trios-mb-db`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — CORS origin wildcard rejection
Reject origins containing `*` (wildcards) in `build_cors()`.

### Variant B — Health check response size limit
Add a `DefaultBodyLimit` or response-size cap to the health check endpoints.

### Variant C — DB repository error message sanitization
Audit `repository.rs` error messages returned to callers for potential info disclosure.
