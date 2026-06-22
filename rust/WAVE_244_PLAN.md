# Wave 244 Security Plan

**Date:** 2026-06-16
**Theme:** Router timeout layer constants + empty text rejection in payment and email handlers

---

## Fix 1: Extract router timeout layer constant in `router.rs` (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** Both `create_router` and `create_router_with_payments` apply `TimeoutLayer::new(std::time::Duration::from_secs(30))` as a bare literal. This is the last remaining timeout literal in the HTTP server stack; all other HTTP clients already use named constants.

**Solution:**
- Add `const ROUTER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);` at module level.
- Replace both bare literals in `create_router` and `create_router_with_payments` with the named constant.

---

## Fix 2: Empty/whitespace text guard in `payment.rs` (MEDIUM)

**File:** `rings/SILVER-RING-SN00/src/payment.rs`

**Problem:** `handle_payment_msg` accepts `msg.text()` and checks `text.len() > MAX_PAYMENT_TEXT_LEN`, but does not check `text.trim().is_empty()`. Whitespace-only input silently falls through to the generic re-prompt instead of being explicitly rejected with a localized error.

**Solution:**
- Add `if text.trim().is_empty() { ... }` guard before the length-cap check, with a localized error message.

---

## Fix 3: Empty text guard in `email.rs` (MEDIUM)

**File:** `rings/SILVER-RING-SN00/src/email.rs`

**Problem:** `handle_email_msg` step 1 extracts `msg.text()`, trims it, and passes to `validate_email()`, but never checks if the trimmed result is empty. An empty or whitespace-only string could be stored or displayed.

**Solution:**
- After trimming, add `if email.is_empty() { ... }` guard with a localized error message before calling `validate_email`.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `BRONZE-RING-SRV` and `trios-mb-scenes`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Webhook client timeout hardening
Audit webhook and health check HTTP clients for bare timeout literals and extract them to named constants.

### Variant B — Remaining text input validation sweep
Audit all remaining scene handlers that accept `msg.text()` for missing empty/whitespace guards before storage or downstream use.

### Variant C — Router middleware hardening
Review router middleware layers (body limits, CORS, rate limits) for hardcoded values that should be extracted to named constants.
