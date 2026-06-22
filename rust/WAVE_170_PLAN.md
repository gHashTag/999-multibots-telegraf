# Wave 170 Security Audit — Decomposed Plan

**Date:** 2026-06-16  
**Focus:** Financial precision at gateway boundaries, deserialization hardening, background task supervision, batch query safety  
**Literature:** Microsoft *Async Rust: From Futures to Production* Ch.13 (supervisor loops, `JoinSet`), Stripe API precision docs (minor units), OWASP Deserialization Cheat Sheet.

---

## Overview

Wave 170 continues the precision and resilience work started in Wave 169. Where Wave 169 introduced the `Money` type and instrumented the payment processor, Wave 170 tightens the **gateway boundaries** (x402, Robokassa, Telegram Stars) so that float-to-integer conversions are overflow-safe, signature strings are deterministic, and inbound callback forms are fail-closed. It also strengthens background-task supervision and caps unbounded list queries.

---

## Phase 1: x402 Nano-Ton Conversion Overflow Guard (P0)

**Weakness:** `x402.rs` converts `amount` to nano-tons with `(amount * 1_000_000.0) as u64`. A large `amount` (e.g. > 1.8e13) causes `f64` overflow to `Inf`, and `Inf as u64` is `u64::MAX` (or 0 depending on platform), silently corrupting the transfer value.

**Fix:** Clamp `amount` to a reasonable ceiling (e.g. 1 billion) **before** scaling, and verify the scaled value fits in `u64`.

**Files:** `rings/SILVER-RING-PY00/src/x402.rs`

---

## Phase 2: Robokassa Signature Deterministic Formatting (P0)

**Weakness:** `generate_signature` formats `amount: f64` via `{}` into the HMAC payload. Rust’s default `Display` for `f64` may render `1.5` as `1.5` or `1.50` inconsistently depending on trailing zeros, and `OutSum={}` in the URL may use scientific notation for tiny or huge values, breaking signature verification on the provider side.

**Fix:** Round `amount` to exactly 2 decimal places with `format!("{:.2}", amount)` in both `generate_signature` and `get_payment_url`.

**Files:** `rings/SILVER-RING-PY00/src/robokassa.rs`

---

## Phase 3: Telegram Stars Internal Money Conversion (P1)

**Weakness:** `TelegramStarsGateway` stores raw `f64` in `PaymentInit` and `PaymentVerification` without converting to `Money`. Star values are integral but the code treats them as float.

**Fix:** Inside `create_payment` and `verify_callback`, convert `amount` to `Money` after the `is_finite()` guard as a canonicalization step. Pass the original `f64` into the struct for backward compatibility but log the `Money` representation for trace consistency.

**Files:** `rings/SILVER-RING-PY00/src/telegram_stars.rs`

---

## Phase 4: Payment Webhook Form `deny_unknown_fields` (P1)

**Weakness:** `RobokassaCallbackForm` deserializes form fields without rejecting unknown ones. A provider sending extra parameters could cause silent truncation if we later flatten the struct.

**Fix:** Add `#[serde(deny_unknown_fields)]` to `RobokassaCallbackForm`.

**Files:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`

---

## Phase 5: Background Supervision Logging (P1)

**Weakness:** `spawn_traced` in `main.rs` logs panics but does not log normal task completion or escalate repeated consecutive failures. Under load, a task completing silently and immediately restarting may mask a root cause (e.g., database connection exhaustion).

**Fix:** Add structured logging for normal completions and a restart-rate warning when a task completes 3+ times within 60 seconds.

**Files:** `rings/BRONZE-RING-APP/src/main.rs`

---

## Phase 6: Repository List Query LIMIT Audit (P2)

**Weakness:** Some repository list methods may omit `.limit()` when translating SeaORM queries, allowing an unbounded result set if the table grows large.

**Fix:** Audit every list/query method in `repository.rs` that returns `Vec<_>` and ensure it calls `.limit(Some(safe_limit(...)))`.

**Files:** `rings/SILVER-RING-DB00/src/repository.rs`

---

## Verification

- `cargo check --all` passing.
- `cargo test -p trios-mb-payment` passing.
- `cargo test -p trios-mb-server` passing.

---

## Cooperation Options

1. **Gateway-by-Gateway Money Migration** — Migrate the remaining payment gateways (`TON`, `Stripe`, `X402`) to use `Money` internally in Wave 171, keeping the trait `f64` boundary.
2. **Repository List Pagination Sweep** — Add cursor-based pagination (`WHERE id > ? LIMIT N`) to all large list endpoints (`generations`, `transactions`, `jobs`) so that admin dashboards and exports are O(1) regardless of table size.
3. **Supervisor Loop Stress-Test** — Write a small `#[tokio::test]` that spawns a poisoned background task (deterministic panic), verifies that `spawn_traced` restarts it with backoff, and asserts the restart-rate warning fires after the threshold.
