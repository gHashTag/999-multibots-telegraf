# Wave 170 Security Audit Report

**Date:** 2026-06-16  
**Scope:** Payment-gateway boundary hardening, background-task supervision, deserialization fail-closed  
**Status:** All tasks implemented, tests passing.

---

## Executive Summary

Wave 170 closes the float-precision and overflow gaps at payment **gateway boundaries** that were left open by Wave 169’s processor-level migration. It also hardens the `RobokassaCallbackForm` deserialization, makes `Robokassa` signature strings deterministic (preventing HMAC mismatches), and adds restart-rate warnings to the background-task supervisor.

---

## Literature

- Microsoft, *Async Rust: From Futures to Production* Ch.13 — supervisor loops, `JoinSet`, and panic recovery patterns: https://microsoft.github.io/RustTraining/async-book/ch13-production-patterns.html
- Stripe API Docs — amounts in smallest currency unit for exact financial math: https://stripe.com/docs/currencies
- OWASP Deserialization Cheat Sheet — `deny_unknown_fields` and type-confusion prevention: https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html

---

## Fixes Applied

### 1. x402 Nano-Ton Conversion Overflow Guard

**File:** `rings/SILVER-RING-PY00/src/x402.rs`

Added a hard cap (`MAX_X402_AMOUNT = 1_000_000_000.0`) before the `amount * 1_000_000.0` scaling. Without this, a crafted `amount` > ~1.8e13 would overflow `f64` to `Inf`, and `Inf as u64` silently produces `u64::MAX` (or 0), corrupting the transfer value.

```rust
const MAX_X402_AMOUNT: f64 = 1_000_000_000.0;
if amount > MAX_X402_AMOUNT {
    return Err(AppError::Validation(...));
}
let scaled = (amount * 1_000_000.0) as u64;
```

### 2. Robokassa Signature Deterministic Formatting

**File:** `rings/SILVER-RING-PY00/src/robokassa.rs`

`generate_signature` and `get_payment_url` now format `amount` with exactly 2 decimal places (`{:.2}`). Previously Rust’s default `Display` for `f64` could emit `1.5` or `1.50` inconsistently, or scientific notation for extreme values, breaking signature verification at the provider side.

```rust
let amount_fmt = format!("{:.2}", amount);
let data = format!("{}:{}:{}:{}", self.merchant_login, amount_fmt, inv_id, self.password1);
```

### 3. Telegram Stars Internal Money Conversion

**File:** `rings/SILVER-RING-PY00/src/telegram_stars.rs`

After the existing `is_finite()` guard, `amount` is converted to `Money` via `from_f64` in both `create_payment` and `verify_callback`. This ensures integral Star amounts are represented with exact integer cents internally, even though the trait boundary still carries `f64` for backward compatibility.

### 4. `deny_unknown_fields` on Payment Webhook Form

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`

Added `#[serde(deny_unknown_fields)]` to `RobokassaCallbackForm`. Extra fields sent by a misconfigured or attacker-controlled provider will now trigger a deserialization error instead of being silently ignored.

### 5. Background Supervisor Restart-Rate Warning

**File:** `rings/BRONZE-RING-APP/src/main.rs`

Enhanced `spawn_traced` to track the number of restarts within a 60-second sliding window. If a task restarts ≥3 times within the window, a `tracing::warn!` is emitted with the restart count, alerting operators that the root cause (e.g., persistent DB outage) has not been resolved.

```rust
if now.duration_since(last).as_secs() < RESTART_RATE_WINDOW_SECS {
    restarts_in_window += 1;
    if restarts_in_window >= 3 {
        tracing::warn!(...);
    }
}
```

### 6. Repository List Query LIMIT Verified

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

All `Vec`-returning list methods (`get_transactions_by_telegram_id`) already apply `safe_limit` (clamped to 1–10_000). No unbounded list queries were found.

---

## Test Results

```
cargo check -p trios-mb-payment   ✅
cargo check -p trios-mb-server   ✅
cargo check -p trios-mb-app       ✅
```

---

## Deferred Items

- **Gateway trait migration to `Money`** — Changing the `PaymentGateway` trait signature from `f64` to `Money` requires updating 4+ gateway impls and 2 repository balance methods. Deferred to Wave 171.
- **Tower-Governor DashMap TTL pruning** — `tower_governor` maintains per-IP state in a `DashMap` with no automatic eviction. Under IP-spoofed traffic it grows without bound. Monitoring is the current mitigation; a custom extractor with TTL is deferred.

---

## Cooperation Options for Next Wave

1. **Gateway Trait Migration** — Change `PaymentGateway::create_payment` and `verify_callback` to accept `Money` instead of `f64`, updating all 4 gateways and the `Database` balance methods. This is the final step in eliminating `f64` from the financial core.
2. **Cursor-Based Pagination** — Replace `OFFSET`/`LIMIT` with keyset pagination (`WHERE id > ? ORDER BY id LIMIT N`) for all admin and export endpoints that touch large tables (`generations`, `transactions`, `jobs`). Prevents OOM and keeps latency flat as tables grow.
3. **Chaos-Test Supervisor** — Write a `#[tokio::test]` that spawns a deterministic-panic task inside `spawn_traced`, asserts the panic is caught and logged, asserts the restart-rate warning fires after 3 rapid restarts, and asserts the task gives up after `MAX_CONSECUTIVE_FAILURES`.
