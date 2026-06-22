# Wave 213 Security Plan

**Theme:** SSRF Hardening, Payment Secret Zeroization, Constant-Time Comparison Upgrade
**Date:** 2026-06-16

---

## Fix 1 — SSRF Bypass via Unspecified and IPv4-Mapped IPv6 Addresses

**Severity:** CRITICAL
**File:** `rings/GOLD-RING-TY00/src/utils.rs`
**Weakness:** The shared `validate_result_url` utility is missing `is_unspecified()` and `to_ipv4_mapped()` guards. It blocks loopback, private, link-local, and ULA addresses, but still allows:
- `http://0.0.0.0/` and `http://[::]/` (unspecified)
- `http://[::ffff:127.0.0.1]/`, `http://[::ffff:10.0.0.1]/`, etc. (IPv4-mapped)

These bypasses let attackers coerce the server into requesting internal services (localhost, private subnets, cloud metadata endpoints) when processing provider `result_url` values.

**Remediation:** Add `ip.is_unspecified()` check immediately after `ip.is_loopback()`. Inside the `IpAddr::V6` arm, call `v6.to_ipv4_mapped()` and if `Some(mapped)`, run the same guards as the V4 arm (`is_loopback`, `is_private`, `is_link_local`).

**Literature:** OWASP SSRF Prevention Cheat Sheet; GHSA-vrcj-hv2q-c58m (twenty-server IPv4-mapped bypass).

---

## Fix 2 — Robokassa Passwords Stored as Plain String

**Severity:** HIGH
**File:** `rings/SILVER-RING-PY00/src/robokassa.rs`
**Weakness:** `RobokassaGateway.password1` and `password2` are payment-signing secrets stored as plain `String`. They only have a hand-written `Debug` redaction; the backing buffers are not zeroized on drop and remain visible in core dumps / swap.

**Remediation:**
1. Change both fields to `secrecy::SecretString`.
2. Update `new()` to accept `SecretString`.
3. Adjust `generate_signature` and `verify_callback_signature` to expose the raw value only during the HMAC operation via `.expose_secret()`.
4. Add `use secrecy::{SecretString, ExposeSecret};`.

**Literature:** `zeroize` crate docs; `secrecy` crate docs (secure secret handling patterns).

---

## Fix 3 — Hand-Rolled Constant-Time Comparison is Fragile

**Severity:** HIGH
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/SILVER-RING-PY00/src/robokassa.rs`
**Weakness:** Both files use a hand-rolled XOR-and-OR loop for constant-time hex comparison. While the intent is correct, the Rust/LLVM optimizer may dead-store-eliminate or branch-simplify the accumulator pattern, weakening timing guarantees. No `black_box` or volatile barrier is used.

**Remediation:**
1. Add `subtle` to the relevant `Cargo.toml` files.
2. Replace the manual loops with `subtle::ConstantTimeEq` via byte-slice comparison.
3. Use `expected.as_bytes().ct_eq(provided.as_bytes()).into()` or a hex-decode-then-compare pattern.

**Literature:** Dalek Cryptography `subtle` crate; Hosfelt & Sprenkels, "Secret Types in Rust".

---

## Deferred Items (MEDIUM/LOW)
- Infisical `client_secret` / `access_token` SecretString migration (module appears inactive).
- Add `Strict-Transport-Security` to `build_sanitized_response` for header parity.
