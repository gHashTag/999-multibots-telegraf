# Wave 243 Security Report

**Date:** 2026-06-16
**Theme:** Extend named timeout constants to secret store and payment gateway; empty text rejection in Flux LoRA training

---

## Summary

Wave 243 extends the reqwest timeout constant extraction pattern beyond AI providers to the secret store and payment gateway, and adds empty/whitespace text rejection guards in the Flux LoRA training handler. All changes compiled on first attempt with zero warnings.

---

## Fix 1: Extract named reqwest timeout constants in `store.rs`

**File:** `rings/SILVER-RING-SC00/src/store.rs`
**Severity:** HIGH

`InfisicalStore::new` is a security-critical secrets-store HTTP client that was building a `reqwest::Client` with bare `Duration::from_secs(N)` literals for timeout (30s), connect_timeout (10s), and pool_idle_timeout (90s). All AI provider HTTP clients had already been migrated to named constants in prior waves, but the secret store was overlooked.

**Changes:**
- Added `const REQWEST_TIMEOUT: Duration = Duration::from_secs(30);`
- Added `const REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
- Added `const REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
- Replaced the three bare literals in `InfisicalStore::new()` with the named constants.

This ensures the secrets-store HTTP client follows the same maintainability and auditability patterns as all other HTTP clients.

---

## Fix 2: Extract named reqwest timeout constants in `x402.rs`

**File:** `rings/SILVER-RING-PY00/src/x402.rs`
**Severity:** HIGH

`X402Gateway::new` builds a `reqwest::Client` with bare `Duration::from_secs(N)` literals (30, 10, 90). This is a payment-gateway HTTP client handling financial transactions; it should follow the same named-constant pattern as all other HTTP clients.

**Changes:**
- Added `const REQWEST_TIMEOUT: Duration = Duration::from_secs(30);`
- Added `const REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
- Added `const REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
- Added `use std::time::Duration;` import.
- Replaced the three bare literals in `X402Gateway::new()` with the named constants.

---

## Fix 3: Empty/whitespace text rejection in `train_flux_model.rs`

**File:** `rings/SILVER-RING-SN00/src/train_flux_model.rs`
**Severity:** MEDIUM

Steps 2 and 3 of the Flux LoRA training handler accept a trigger word and model name from `msg.text()`. Both trim the input and check length against a maximum, but neither checks `trimmed.is_empty()`. A user could store an empty trigger word or model name, which would likely break downstream ML training jobs.

**Changes:**
- **Step 2 (trigger word):** Added `if trimmed.is_empty() { ... }` guard with localized error message before the length-cap check.
- **Step 3 (model name):** Added `if trimmed.is_empty() { ... }` guard with localized error message before the length-cap check.

Both guards follow the established pattern of returning a localized error and aborting early.

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-secrets -p trios-mb-payment -p trios-mb-scenes
    Checking trios-mb-secrets v0.1.0
    Checking trios-mb-payment v0.1.0
    Checking trios-mb-scenes v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 9.13s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — Router timeout layer constant extraction
Extract the bare `Duration::from_secs(30)` literals in `TimeoutLayer::new()` calls in `router.rs` to named constants.

### Variant B — Payment handler empty text guard
Add `text.trim().is_empty()` guard in `payment.rs` `handle_payment_msg` before the length-cap and parse attempt.

### Variant C — Remaining reqwest constructor hardening sweep
Audit any remaining HTTP client constructors (webhook clients, health check clients, etc.) for bare timeout literals and extract them.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
