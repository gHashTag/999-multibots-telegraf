# Wave 213 Security Report

**Theme:** SSRF Hardening, Payment Secret Zeroization, Constant-Time Comparison Upgrade
**Date:** 2026-06-16
**Scope:** Shared URL validator, Robokassa payment gateway, webhook signature verification.

---

## Executive Summary

Three cryptographic and network-boundary gaps were closed.  The canonical `validate_result_url` utility now rejects unspecified and IPv4-mapped IPv6 addresses that previously bypassed SSRF filters.  Robokassa payment signing secrets are stored in `SecretString` containers that zeroise on drop.  Hand-rolled constant-time comparison loops in webhook and payment verification were replaced with the vetted `subtle` crate.

---

## Fix 1 — SSRF Bypass via Unspecified and IPv4-Mapped IPv6

**File:** `rings/GOLD-RING-TY00/src/utils.rs`

**Weakness:** The shared `validate_result_url` blocked loopback, private, link-local, and ULA addresses, but omitted two critical checks:
1. `ip.is_unspecified()` — allowed `http://0.0.0.0/` and `http://[::]/`.
2. `v6.to_ipv4_mapped()` — allowed `http://[::ffff:127.0.0.1]/`, `http://[::ffff:10.0.0.1]/`, etc., bypassing IPv4 filters entirely.

An attacker who influenced a provider result URL or reused this validator in a new endpoint could coerce the server into requesting internal services.

**Remediation:** Added `ip.is_unspecified()` alongside `ip.is_loopback()`.  Inside the `IpAddr::V6` arm, added a `v6.to_ipv4_mapped()` guard: if a mapped IPv4 is present, it is checked for loopback, private, link-local, and unspecified the same way native IPv4 addresses are.

**Impact:** Closes the SSRF bypass vector completely.

**Literature:** OWASP SSRF Prevention Cheat Sheet; GHSA-vrcj-hv2q-c58m (twenty-server IPv4-mapped bypass).

---

## Fix 2 — Robokassa Passwords Stored in Plain Strings

**File:** `rings/SILVER-RING-PY00/src/robokassa.rs`

**Weakness:** `RobokassaGateway.password1` and `password2` are MD5/HMAC signing secrets for a live payment gateway.  They were stored as plain `String`, relying only on a hand-written `Debug` redaction.  A core dump, swap file, or memory-scraping incident could recover these credentials.

**Remediation:**
1. Added `secrecy = "0.8"` and `subtle = "2.6"` to `SILVER-RING-PY00/Cargo.toml`.
2. Changed both fields to `secrecy::SecretString`.
3. Updated `generate_signature` to call `.expose_secret()` only at the HMAC boundary.
4. Updated `verify_callback_signature` to call `.expose_secret()` only at the HMAC boundary.

**Impact:** Signing-key buffers are zeroised when `RobokassaGateway` is dropped.

**Literature:** `zeroize` crate documentation; `secrecy` crate documentation (secure secret handling patterns).

---

## Fix 3 — Hand-Rolled Constant-Time Comparison is Fragile

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/SILVER-RING-PY00/src/robokassa.rs`

**Weakness:** Both files used a manual XOR-and-OR accumulator loop for constant-time hex comparison.  While the intent is correct, the Rust/LLVM optimizer may dead-store-eliminate or branch-simplify the accumulator pattern, weakening timing guarantees.  No `black_box` or volatile barrier was used.

**Remediation:**
1. Added `subtle = "2.6"` to `BRONZE-RING-SRV/Cargo.toml`.
2. Replaced both manual loops with `subtle::ConstantTimeEq::ct_eq`:
   ```rust
   let eq = expected.as_bytes().ct_eq(provided.as_bytes());
   if eq.unwrap_u8() == 0 { /* mismatch */ }
   ```

**Impact:** Signature comparison now uses a vetted constant-time primitive from the Dalek Cryptography project, resistant to compiler optimization.

**Literature:** Dalek Cryptography `subtle` crate; Hosfelt & Sprenkels, "Secret Types in Rust".

---

## Metrics

- SSRF bypasses closed: 2 (unspecified, IPv4-mapped)
- Secret-hardening sites: 2 (Robokassa password1, password2)
- Constant-time comparison upgrades: 2 (webhook, Robokassa)
- New dependencies: 1 (`subtle`)
- Compilation warnings: 0

---

## Cooperation Variants for Wave 214

1. **HSTS Header Consistency** — Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to `build_sanitized_response` so error responses carry the same transport-security guarantee as success responses, closing a potential downgrade window.

2. **Infisical Secret Store SecretString Migration** — Migrate `AuthRequest.client_secret` and `AuthResponse.access_token` in `rings/GOLD-RING-PR00/src/infisical.rs` to `secrecy::SecretString`, extending the zeroisation pattern to the secret-management subsystem.

3. **XSS-Protection Audit (Log Sanitization)** — Audit every `tracing` statement that interpolates user-controlled strings (URLs, usernames, prompt text) and ensure they pass through `truncate_for_log` with a consistent 256-char cap, preventing log-injection DoS and audit-trail corruption.
