# Wave 244 Security Report

**Date:** 2026-06-16
**Theme:** Router timeout layer constants + empty text rejection in payment and email handlers

---

## Summary

Wave 244 extracts the last remaining bare timeout literals in the HTTP server stack to named constants, and adds empty/whitespace text rejection guards in the payment and email handlers. All changes compiled on first attempt with zero warnings.

---

## Fix 1: Extract router timeout layer constant in `router.rs`

**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Severity:** HIGH

Both `create_router` and `create_router_with_payments` applied `TimeoutLayer::new(std::time::Duration::from_secs(30))` as a bare literal. This was the last remaining timeout literal in the HTTP server stack; all other HTTP clients had already been migrated to named constants in prior waves.

**Changes:**
- Added `use std::time::Duration;` import.
- Added `const ROUTER_TIMEOUT: Duration = Duration::from_secs(30);` at module level.
- Replaced both bare literals in `create_router` and `create_router_with_payments` with `ROUTER_TIMEOUT`.

This ensures the router timeout is a single-line change away and follows the same auditability pattern as all HTTP clients.

---

## Fix 2: Empty/whitespace text guard in `payment.rs`

**File:** `rings/SILVER-RING-SN00/src/payment.rs`
**Severity:** MEDIUM

`handle_payment_msg` accepted `msg.text()` and checked `text.len() > MAX_PAYMENT_TEXT_LEN`, but did not check `text.trim().is_empty()`. Whitespace-only input silently fell through to the generic re-prompt instead of being explicitly rejected with a localized error.

**Changes:**
- Added `if text.trim().is_empty() { ... }` guard before the length-cap check.
- Returns a localized error message asking the user to enter a valid amount.

---

## Fix 3: Empty text guard in `email.rs`

**File:** `rings/SILVER-RING-SN00/src/email.rs`
**Severity:** MEDIUM

`handle_email_msg` step 1 extracted `msg.text()`, trimmed it, and passed to `validate_email()`, but never checked if the trimmed result was empty. An empty or whitespace-only string could pass through and be displayed in the confirmation message.

**Changes:**
- After trimming, added `if email.is_empty() { ... }` guard with a localized error message before calling `validate_email`.

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-scenes -p trios-mb-server
    Checking trios-mb-server v0.1.0
    Checking trios-mb-scenes v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 6.26s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — Webhook client timeout hardening
Audit webhook and health check HTTP clients for bare timeout literals and extract them to named constants.

### Variant B — Remaining text input validation sweep
Audit all remaining scene handlers that accept `msg.text()` for missing empty/whitespace guards before storage or downstream use.

### Variant C — Router middleware hardening
Review router middleware layers (body limits, CORS, rate limits) for hardcoded values that should be extracted to named constants.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
