# Wave 243 Security Plan

**Date:** 2026-06-16
**Theme:** Extend named timeout constants to secret store and payment gateway; empty text rejection in Flux LoRA training

---

## Fix 1: Extract named reqwest timeout constants in `store.rs` (HIGH)

**File:** `rings/SILVER-RING-SC00/src/store.rs`

**Problem:** `InfisicalStore::new` is a security-critical secrets-store HTTP client that builds a `reqwest::Client` with bare `Duration::from_secs(N)` literals (30, 10, 90). All provider HTTP clients have been migrated to named constants; the secret store should follow the same pattern.

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`.
- Replace bare literals in `InfisicalStore::new()` with named constants.

---

## Fix 2: Extract named reqwest timeout constants in `x402.rs` (HIGH)

**File:** `rings/SILVER-RING-PY00/src/x402.rs`

**Problem:** `X402Gateway::new` builds a `reqwest::Client` with bare `Duration::from_secs(N)` literals (30, 10, 90). This is a payment-gateway HTTP client; it should follow the same named-constant pattern as all other HTTP clients in the codebase.

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`.
- Replace bare literals in `X402Gateway::new()` with named constants.

---

## Fix 3: Empty/whitespace text rejection in `train_flux_model.rs` (MEDIUM)

**File:** `rings/SILVER-RING-SN00/src/train_flux_model.rs`

**Problem:** Steps 2 and 3 accept trigger words and model names from `msg.text()`. Both trim the input and check length against `MAX_TRIGGER_WORD_LEN` / `MAX_MODEL_NAME_LEN`, but neither checks `trimmed.is_empty()`. A user can store an empty trigger word or model name, which will likely break downstream ML training jobs.

**Solution:**
- In step 2, after trimming, add `if trimmed.is_empty() { ... }` guard with a localized error.
- In step 3, after trimming, add `if trimmed.is_empty() { ... }` guard with a localized error.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SC00`, `SILVER-RING-PY00`, and `trios-mb-scenes`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Router timeout layer constant extraction
Extract the bare `Duration::from_secs(30)` literals in `TimeoutLayer::new()` calls in `router.rs` to named constants.

### Variant B — Payment handler empty text guard
Add `text.trim().is_empty()` guard in `payment.rs` `handle_payment_msg` before the length-cap and parse attempt.

### Variant C — Remaining reqwest constructor hardening sweep
Audit any remaining HTTP client constructors (webhook clients, health check clients, etc.) for bare timeout literals and extract them.
