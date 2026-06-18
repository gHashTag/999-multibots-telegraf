# Wave 167 Security Hardening Plan

**Date:** 2026-06-16  
**Focus:** Financial input validation chain, bot dispatcher resilience, input length caps, edge-case unwrap elimination.

## Literature Summary

- **OWASP Input Validation Cheat Sheet (2024)** — All user-supplied numeric values must be validated for type, range, and sanity (finite, non-negative, within bounds) before reaching business logic.
- **"Race Conditions in Money Paths" (vibe-eval.com)** — Financial entry points (`create_payment`, `direct_debit`) are chokepoints: a single centralized guard prevents propagation of bad values to downstream gateways.
- **Stripe API Security Guide** — Gateway callback amounts must be validated independently of signature verification; signature proves origin, not semantic correctness.
- **Rust Float-to-Int Cast Safety (RFC 2484)** — Casting `Inf` to `u64` yields `u64::MAX`; casting `NaN` yields `0`. Explicit `is_finite()` checks before arithmetic-to-integer casts are mandatory.

## Findings

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | **High** | `payment.rs` accepts `Inf` as valid top-up amount (`Inf > 0.0` is true). | `SILVER-RING-SN00/src/payment.rs:55` |
| 2 | **High** | `payment_processor.rs:create_payment` does not centralize `is_finite()` validation, relying on individual gateways. | `SILVER-RING-PY00/src/services/payment_processor.rs:22` |
| 3 | **Medium** | `ton.rs` lacks `is_finite()` guard and casts `amount * 1_000_000_000.0` to `u64`. `Inf` → `u64::MAX`. | `SILVER-RING-PY00/src/ton.rs:55` |
| 4 | **Medium** | `telegram_stars.rs` `create_payment` lacks `is_finite()` guard. | `SILVER-RING-PY00/src/telegram_stars.rs:22` |
| 5 | **Medium** | `robokassa.rs` `create_payment` and `verify_callback` lack `is_finite()` guards. | `SILVER-RING-PY00/src/robokassa.rs:70,88` |
| 6 | **Medium** | Bot dispatcher inner loop restarts forever on normal exit; no max restart count. | `BRONZE-RING-APP/src/main.rs:223` |
| 7 | **Low** | `flux_kontext.rs` step 3 sends `msg.text()` to job queue without length cap. | `SILVER-RING-SN00/src/flux_kontext.rs:95` |
| 8 | **Low** | `email.rs` stores `msg.text()` in dialogue state without length cap. | `SILVER-RING-SN00/src/email.rs:33` |
| 9 | **Low** | `router.rs` edge-hardening uses `.unwrap()` on `Response::builder()`. | `BRONZE-RING-SRV/src/router.rs:93` |

## Tasks

### Task 1 — Centralize f64 amount validation in payment processor
Add an `is_finite()` + `> 0.0` guard at the top of `PaymentProcessor::create_payment` and `PaymentProcessor::direct_debit`. Fail fast with `AppError::Validation`.

### Task 2 — f64 guards in remaining payment gateways
- `ton.rs`: add `is_finite()` + `> 0.0` guard in `create_payment`.
- `telegram_stars.rs`: add guard in `create_payment`.
- `robokassa.rs`: add guard in `create_payment` and `verify_callback`.

### Task 3 — Fix `payment.rs` top-up handler
Replace `if amount > 0.0` with `if amount.is_finite() && amount > 0.0` to reject `Inf`.

### Task 4 — Bot dispatcher restart limit
Track `restart_count` inside the bot dispatcher inner loop in `main.rs`. After `MAX_RESTARTS` (e.g., 20) normal exits, log an error and break out of the loop, letting `spawn_traced` handle the consequence.

### Task 5 — Input length cap gaps
Add `MAX_DIALOGUE_TEXT_LEN` checks to `flux_kontext.rs` step 3 and `email.rs`.

### Task 6 — Eliminate `unwrap()` in `router.rs` edge hardening
Replace `Response::builder()...unwrap()` with `match` or `expect` with a comment, or better yet use `?` if the function returns `Result`. Since it's inside an async middleware returning `Response`, convert the builder result via `.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)` or use `let response = Response::builder()...body(...)?;` but that requires the function to return a Result. Simpler: replace `.unwrap()` with a safe fallback using `Response::new(Body::from(...))`.

---
*Plan version: 167.1*
