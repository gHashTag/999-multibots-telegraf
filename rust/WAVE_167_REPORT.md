# Wave 167 Security Hardening Report

**Date:** 2026-06-16  
**Scope:** trios-mb Rust monorepo — financial input validation chain, bot dispatcher resilience, input length caps, edge-case `unwrap` elimination.

---

## Executive Summary

This wave closes a **high-severity vulnerability chain** where an attacker could submit `Inf` (infinity) as a top-up amount, bypassing the existing `> 0.0` check and propagating an unbounded value through the payment processor to multiple gateways. The fixes centralize `f64.is_finite()` validation at all payment entry points, add defense-in-depth guards to every gateway, cap unvalidated user text in two scene handlers, limit bot dispatcher restart loops, and eliminate a panic-path `.unwrap()` in the edge-hardening middleware.

---

## Literature Review

- **OWASP Input Validation Cheat Sheet (2024)** — Numeric inputs must be checked for type, range, and sanity (finite, non-negative, within bounds) before reaching business logic.
- **"Race Conditions in Money Paths" (vibe-eval.com)** — Centralizing validation at chokepoints (`create_payment`, `direct_debit`) is more robust than relying on downstream components.
- **Stripe API Security Guide** — Callback payload signatures prove origin, not semantic correctness; amount fields must be validated independently.
- **Rust RFC 2484 (Float-to-Int Cast Safety)** — Casting `Inf` to `u64` yields `u64::MAX`; explicit `is_finite()` checks before such casts are mandatory.

---

## Findings & Fixes

### #1 — HIGH: `payment.rs` accepted `Inf` as valid top-up amount
- **Location:** `rings/SILVER-RING-SN00/src/payment.rs:55`
- **Root Cause:** `text.parse::<f64>()` returns `Inf` for input `"inf"`; `Inf > 0.0` evaluates to `true`, allowing the value to propagate.
- **Fix:** Changed `if amount > 0.0` to `if amount.is_finite() && amount > 0.0`.

### #2 — HIGH: `payment_processor.rs` lacked centralized amount validation
- **Location:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs:22`
- **Root Cause:** `create_payment` and `direct_debit` trusted upstream callers and downstream gateways to validate; this created a bypass window.
- **Fix:** Added `!amount.is_finite() || amount <= 0.0` guard at the top of both `create_payment` and `direct_debit`, returning `AppError::Validation` immediately.

### #3 — MEDIUM: `verify_and_complete` did not validate callback amount
- **Location:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs:67`
- **Root Cause:** Gateway callback amounts were passed directly to `add_balance` (which has its own guard), but a malformed callback could cause confusing error logs.
- **Fix:** Added `!verification.amount.is_finite() || verification.amount < 0.0` guard right after `verify_callback`, failing fast with a clear error message.

### #4 — MEDIUM: `ton.rs` lacked `is_finite()` guard before float-to-int cast
- **Location:** `rings/SILVER-RING-PY00/src/ton.rs:55`
- **Root Cause:** `(amount * 1_000_000_000.0) as u64` with `amount = Inf` yields `u64::MAX`.
- **Fix:** Added `is_finite()` + `> 0.0` guard in `create_payment`.

### #5 — MEDIUM: `telegram_stars.rs` lacked `is_finite()` guard
- **Location:** `rings/SILVER-RING-PY00/src/telegram_stars.rs:22`
- **Fix:** Added guard in `create_payment` and `verify_callback`.

### #6 — MEDIUM: `robokassa.rs` lacked `is_finite()` guard
- **Location:** `rings/SILVER-RING-PY00/src/robokassa.rs:70,88`
- **Fix:** Added guard in `create_payment` and `verify_callback`.

### #7 — MEDIUM: Bot dispatcher could restart indefinitely on persistent errors
- **Location:** `rings/BRONZE-RING-APP/src/main.rs:223`
- **Root Cause:** The inner dispatcher loop (`dp.dispatch()`) had exponential backoff capped at 60s but no maximum restart count. A persistent non-panic failure (e.g., network partition) would spin forever.
- **Fix:** Added `restart_count` tracker and `MAX_RESTARTS = 20`. After 20 normal restarts, the loop breaks and `spawn_traced` handles the consequence.

### #8 — LOW: `flux_kontext.rs` step 3 sent uncapped text to job queue
- **Location:** `rings/SILVER-RING-SN00/src/flux_kontext.rs:95`
- **Fix:** Added `MAX_DIALOGUE_TEXT_LEN = 2000` constant and length check before `dispatch_and_reply`.

### #9 — LOW: `email.rs` stored uncapped text in dialogue state
- **Location:** `rings/SILVER-RING-SN00/src/email.rs:33`
- **Fix:** Added `MAX_EMAIL_LEN = 254` (RFC 5321 limit) and length check before validation.

### #10 — LOW: `router.rs` edge-hardening used `.unwrap()` on `Response::builder()`
- **Location:** `rings/BRONZE-RING-SRV/src/router.rs:93`
- **Fix:** Extracted `build_sanitized_response` helper that uses `.unwrap_or_else` to fall back to a manually constructed response, eliminating the panic path entirely.

---

## Verification

```bash
$ cargo check --target $(rustc -vV | sed -n 's|host: ||p')
   Compiling trios-mb-payment v0.1.0
   Compiling trios-mb-scenes v0.1.0
   Compiling trios-mb-server v0.1.0
   Compiling trios-mb-app v0.1.0
   Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.90s
```

All crates compiled successfully with zero warnings from the changed code.

---

## Files Modified

| File | Change |
|------|--------|
| `rings/SILVER-RING-PY00/src/services/payment_processor.rs` | Centralized `is_finite()` guards in `create_payment`, `direct_debit`, `verify_and_complete` |
| `rings/SILVER-RING-PY00/src/ton.rs` | Added `is_finite()` guard in `create_payment` |
| `rings/SILVER-RING-PY00/src/telegram_stars.rs` | Added `is_finite()` guards in `create_payment` and `verify_callback` |
| `rings/SILVER-RING-PY00/src/robokassa.rs` | Added `is_finite()` guards in `create_payment` and `verify_callback` |
| `rings/SILVER-RING-SN00/src/payment.rs` | Fixed top-up handler to reject `Inf` |
| `rings/BRONZE-RING-APP/src/main.rs` | Added `MAX_RESTARTS` limit to bot dispatcher loop |
| `rings/SILVER-RING-SN00/src/flux_kontext.rs` | Added `MAX_DIALOGUE_TEXT_LEN` cap |
| `rings/SILVER-RING-SN00/src/email.rs` | Added `MAX_EMAIL_LEN` cap |
| `rings/BRONZE-RING-SRV/src/router.rs` | Replaced `.unwrap()` with safe fallback helper |

---

## Three Cooperation Options for Next Wave

1. **Wallet Integration Hardening** — Audit TON / USDT / X402 wallet interactions: validate blockchain addresses, add nonce/replay protection on callbacks, and harden transaction-id derivation.
2. **Generation Pipeline Integrity** — Add checksums / HMACs to job payloads so workers can detect tampered requests, and implement per-user generation rate limits to prevent queue flooding.
3. **Secrets Management Upgrade** — Migrate remaining plaintext secrets (webhook env vars, gateway passwords) from `std::env::var` reads-on-each-request to a cached `SecretString` loader with TTL refresh, reducing exposure surface and improving performance.

---

*Wave 167 complete. All tasks implemented, compiled, and documented.*
