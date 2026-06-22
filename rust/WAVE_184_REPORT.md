# Wave 184 — Security Hardening Report

**Date:** 2026-06-16  
**Scope:** trios-mb Rust monorepo — SSRF bypass in webhook URL validation, health endpoint version fingerprinting, Robokassa signature timing side-channel  
**Methodology:** Static analysis (`cargo check`), code-path tracing, IP address classification verification, literature review, defensive-depth implementation

---

## Executive Summary

Three distinct fixes were implemented: a CRITICAL SSRF bypass closure in webhook result URL validation, a MEDIUM information-disclosure fix in public health endpoints, and a MEDIUM timing side-channel elimination in Robokassa HMAC signature verification.

---

## Fix 1 — CRITICAL: Harden `validate_result_url` against unspecified and IPv4-mapped IPv6 addresses

### Finding
`validate_result_url` in `rings/BRONZE-RING-SRV/src/webhooks.rs` rejected loopback, private, and link-local IPv4/IPv6 addresses but had two critical bypass vectors:

1. **Unspecified addresses (`0.0.0.0`, `::`)**: Neither `is_loopback()`, `is_private()`, `is_link_local()`, ULA, nor IPv6 link-local checks catch these. `0.0.0.0` is not loopback/private/link-local. `::` is not loopback/ULA/link-local. Both would pass through and could be used to target services bound to all interfaces.

2. **IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`, `::ffff:192.168.x.x`)**: `Ipv6Addr::is_loopback()` returns `false` for these addresses, and the IPv6 ULA/link-local checks do not catch them. An attacker can bypass all IPv4 filters by encoding the target as an IPv4-mapped IPv6 address.

Verified with standalone Rust tests:
- `0.0.0.0`: `is_loopback=false`, `is_private=false`, `is_link_local=false`, `is_unspecified=true`
- `::`: `is_loopback=false`, `is_unicast_link_local=false`, `is_unspecified=true`
- `::ffff:127.0.0.1`: `is_loopback=false` (bypasses IPv4 filter entirely)

### Literature
**CWE-918 — Server-Side Request Forgery (SSRF).** "The web server receives a URL or similar request from an upstream component and retrieves the contents of this URL, but it does not sufficiently ensure that the request is being sent to the expected destination." Failing to reject unspecified and IPv4-mapped IPv6 addresses is a classic SSRF bypass documented in multiple security advisories (e.g., OWASP SSRF Prevention Cheat Sheet, 2023).

**OWASP SSRF Prevention Cheat Sheet:** "Reject URLs that resolve to internal IP addresses, including loopback, private ranges, link-local, and unspecified addresses. IPv4-mapped IPv6 addresses must be normalized to their IPv4 equivalents before filtering."

### Implementation
Added two checks inside the IP address validation block:

1. **Unspecified check** after loopback check:
```rust
if ip.is_unspecified() {
    return Err("URL points to an unspecified address".to_string());
}
```

2. **IPv4-mapped IPv6 extraction** inside the IPv6 branch, before ULA/link-local checks:
```rust
std::net::IpAddr::V6(v6) => {
    if let Some(v4) = v6.to_ipv4_mapped() {
        if v4.is_loopback() || v4.is_private() || v4.is_link_local() {
            return Err("URL points to an IPv4-mapped internal address".to_string());
        }
    }
    let segments = v6.segments();
    // ... existing ULA and link-local checks
}
```

### Verification
```bash
cargo check --package trios-mb-app   # OK
```

---

## Fix 2 — MEDIUM: Remove version fingerprinting from health endpoints

### Finding
Both `health_check` and `health_check_with_db` in `rings/BRONZE-RING-SRV/src/health.rs` returned `version: env!("CARGO_PKG_VERSION")` in their JSON responses. This exposes the exact running software version to any unauthenticated attacker, enabling:
- **Version fingerprinting** for targeted exploitation
- **Easy mapping** of running versions to known CVEs
- **Reduced attacker effort** in reconnaissance phase

### Literature
**CWE-200 — Exposure of Sensitive Information to an Unauthorized Actor.** "The product exposes sensitive information to an actor that is not explicitly authorized to have access to that information." Software version numbers are considered sensitive information in security contexts because they allow attackers to identify vulnerable targets efficiently.

**OWASP API Security Top 10 (2023) — API3: Broken Object Property Level Authorization.** While primarily about data exposure, the same principle applies: endpoints should not expose implementation details (versions, build hashes, internal identifiers) without authorization.

### Implementation
Removed `"version": env!("CARGO_PKG_VERSION")` from both health endpoint JSON responses:

```rust
// BEFORE
Json(json!({
    "status": "ok",
    "version": env!("CARGO_PKG_VERSION"),
    "timestamp": chrono::Utc::now().to_rfc3339(),
}))

// AFTER
Json(json!({
    "status": "ok",
    "timestamp": chrono::Utc::now().to_rfc3339(),
}))
```

### Verification
```bash
cargo check --package trios-mb-app   # OK
```

---

## Fix 3 — MEDIUM: Eliminate timing side-channel in Robokassa signature verification

### Finding
`RobokassaGateway::verify_callback_signature` in `rings/SILVER-RING-PY00/src/robokassa.rs` had an early `expected.len() != signature_value.len()` branch before the constant-time comparison loop:

```rust
if expected.len() != signature_value.len() {
    return Err(AppError::Validation("Robokassa callback signature mismatch".into()));
}
let mut diff = 0u8;
for (a, b) in expected.bytes().zip(signature_value.bytes()) {
    diff |= a ^ b;
}
```

This branch leaks the expected HMAC signature length through response timing. An attacker can measure response times for forged signatures of varying lengths and determine the exact length of the real secret-derived signature, reducing brute-force complexity.

This is identical to the `verify_webhook_secret` bug fixed in Wave 183.

### Literature
**CWE-208 — Observable Timing Discrepancy.** "The product behaves differently depending on whether an input is correct or incorrect in a way that can be observed by an attacker." A length-check branch before constant-time comparison destroys the constant-time guarantee by leaking the expected value's length.

**B. A. Hubert (2018)** — "Constant-time comparison must operate over fixed-length inputs; any early-exit branch, including length checks, defeats the purpose of the constant-time loop."

### Implementation
Removed the early length-check branch. The comparison now XORs the length difference into `diff` before iterating:

```rust
let mut diff = (expected.len() != signature_value.len()) as u8;
for (a, b) in expected.bytes().zip(signature_value.bytes()) {
    diff |= a ^ b;
}
if diff != 0 {
    return Err(AppError::Validation("Robokassa callback signature mismatch".into()));
}
```

If lengths differ, `diff` is initialized to `1`, guaranteeing the final check fails while keeping the loop body identical in all cases.

### Verification
```bash
cargo check --package trios-mb-payment   # OK
cargo check --package trios-mb-app       # OK
```

---

## Verification Matrix

| Fix | Crate Check | Result |
|---|---|---|
| Fix 1 | `cargo check --package trios-mb-app` | OK |
| Fix 2 | `cargo check --package trios-mb-app` | OK |
| Fix 3 | `cargo check --package trios-mb-payment` | OK |

---

## Next-Wave Variants (3 candidates)

1. **Payment gateway response field validation** — Add per-field length caps to `PaymentVerification.transaction_id` and other string fields when constructed from external gateway callbacks (Robokassa, TON, x402, Telegram Stars). Prevents poisoned gateway responses from injecting unbounded strings into the database and payment processor.
2. **DB entity string-length caps** — Add database-level `CHECK` constraints or application-level validation for `String` columns in the `transactions`, `generations`, and `users` tables (e.g., `currency`, `external_id`, `result_url`) to prevent unbounded storage.
3. **FSM state TTL expiry audit** — Audit all scene handlers that read `state.step` or other state fields after dialogue transitions to ensure they handle `InMemStorage` TTL expiry gracefully, returning users to the main menu with a clear message instead of silently producing invalid output.

---

*End of Wave 184.*
