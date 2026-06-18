# Wave 184 — Implementation Plan

**Date:** 2026-06-16

## Research Summary

### Weaknesses Identified
1. **CRITICAL — SSRF bypass via unspecified and IPv4-mapped IPv6 addresses:** `validate_result_url` in `BRONZE-RING-SRV/src/webhooks.rs` rejects loopback, private, and link-local addresses but does NOT reject:
   - `0.0.0.0` and `::` (unspecified addresses) — `is_unspecified()` returns true, but the code only checks `is_loopback()`, `is_private()`, `is_link_local()`, ULA, and IPv6 link-local
   - `::ffff:127.0.0.1` and `::ffff:192.168.x.x` (IPv4-mapped IPv6) — `Ipv6Addr::is_loopback()` returns false for these, and the IPv6 ULA/link-local checks don't catch them
   This allows webhook result URLs to target services bound to all interfaces or bypass IPv4 filters via IPv6 mapping.
2. **MEDIUM — Health endpoint version fingerprinting:** Both `health_check` and `health_check_with_db` return `version: env!("CARGO_PKG_VERSION")`. This exposes the exact running version to unauthenticated attackers, enabling targeted exploitation of known vulnerabilities.
3. **MEDIUM — Robokassa signature verification timing side-channel:** `RobokassaGateway::verify_callback_signature` in `SILVER-RING-PY00/src/robokassa.rs` has an early `expected.len() != signature_value.len()` branch before the constant-time comparison loop. This leaks the expected HMAC signature length through response timing, identical to the `verify_webhook_secret` bug fixed in Wave 183.

### Literature Review
- **CWE-918 — Server-Side Request Forgery (SSRF).** "The web server receives a URL or similar request from an upstream component and retrieves the contents of this URL, but it does not sufficiently ensure that the request is being sent to the expected destination." Failing to reject unspecified and IPv4-mapped IPv6 addresses is a classic SSRF bypass technique.
- **CWE-200 — Exposure of Sensitive Information to an Unauthorized Actor.** Returning software version numbers in unauthenticated health endpoints enables fingerprinting and targeted attacks.
- **CWE-208 — Observable Timing Discrepancy.** The length-check branch before constant-time comparison creates a timing oracle. As noted in Hubert (2018), any early-exit branch destroys the constant-time guarantee.

## Decomposed Fixes

### Fix 1 — Harden `validate_result_url` against unspecified and IPv4-mapped IPv6 addresses
- **File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
- **Action:**
  - Add `is_unspecified()` check for both IPv4 and IPv6 after the loopback check
  - Add IPv4-mapped IPv6 handling: if `v6.to_ipv4_mapped()` returns `Some(v4)`, run the full IPv4 checks (`is_loopback()`, `is_private()`, `is_link_local()`) on the mapped address
- **Verification:** `cargo check --package trios-mb-app` passes

### Fix 2 — Remove version fingerprinting from health endpoints
- **File:** `rings/BRONZE-RING-SRV/src/health.rs`
- **Action:** Remove `"version": env!("CARGO_PKG_VERSION")` from both `health_check` and `health_check_with_db` JSON responses
- **Verification:** `cargo check --package trios-mb-app` passes

### Fix 3 — Eliminate timing side-channel in Robokassa signature verification
- **File:** `rings/SILVER-RING-PY00/src/robokassa.rs`
- **Action:** Remove the early `expected.len() != signature_value.len()` check in `verify_callback_signature`. XOR the length difference into `diff` before the byte loop, identical to the `verify_webhook_secret` fix in Wave 183.
- **Verification:** `cargo check --package trios-mb-payment` passes

## Rollback Criteria
- Any fix that causes `cargo check` to fail will be reverted and re-implemented
- SSRF fix must not break legitimate webhook result URLs from public providers

## Verification Matrix

| Fix | Crate Check | Expected Result |
|---|---|---|
| Fix 1 | `cargo check --package trios-mb-app` | OK |
| Fix 2 | `cargo check --package trios-mb-app` | OK |
| Fix 3 | `cargo check --package trios-mb-payment` | OK |
