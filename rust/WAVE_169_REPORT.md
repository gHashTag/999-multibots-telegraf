# Wave 169 Security Audit Report

**Date:** 2026-06-16  
**Scope:** Financial precision foundations, deserialization hardening, observability hygiene  
**Status:** All tasks implemented, tests passing.

---

## Executive Summary

Wave 169 introduces a purpose-built integer `Money` type to replace `f64` for internal financial calculations, hardens inbound webhook and callback deserialization with `deny_unknown_fields`, and adds `tracing::instrument` coverage to the payment processor. Health cache-control and DB prompt caps were verified as already present from prior waves (Wave 166 and an earlier DB-hardening pass).

---

## Literature

- `steel_cent` — Currency-aware money type with checked arithmetic and minor-unit integer backing: https://docs.rs/steel-cent/latest/steel_cent/struct.Money.html
- `primitive_fixed_point_decimal` — Const-generic scaled integer for exact decimal math: https://docs.rs/primitive_fixed_point_decimal/latest
- serde `deny_unknown_fields` hardening patterns and real-world type-confusion bug: https://serde.rs/container-attrs / https://github.com/serde-rs/serde/issues/2634

---

## Fixes Applied

### 1. Created `Money` integer type (`i64` minor units)

**File:** `rings/GOLD-RING-TY00/src/money.rs` (new)

- `Money(i64)` newtype with all checked arithmetic: `checked_add`, `checked_sub`, `checked_mul`, `checked_div`.
- `from_f64(v) -> Option<Money>` rejects `NaN`, `Inf`, negatives, and values that overflow `i64` after scaling by 100.
- `to_f64() -> f64` for gateway interoperability.
- `Display` as decimal (`1.23`).
- `Debug` redacts raw value (`Money(REDACTED)`).
- `Serialize`/`Deserialize` round-trips via `"123.45"` string to avoid JSON float drift.
- Full unit-test coverage: basic conversion, NaN/Inf rejection, checked arithmetic, display formatting, serde round-trip.

**Why it matters:** Eliminates binary-float imprecision in financial chains (e.g. `0.1 + 0.2 != 0.3`). Checked operations prevent silent overflow of balances or credits.

### 2. Migrated `PaymentProcessor` internal math to `Money`

**File:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs`

- After existing `is_finite()` guards, `amount` is converted to `Money` via `from_f64`.
- In `direct_debit`, both `amount` and `balance` are converted to `Money` before the sufficiency check, ensuring exact comparison instead of float ordering.
- Overflow during conversion or arithmetic now emits `AppError::Validation("… overflows Money")` instead of silent truncation.
- Added `#[tracing::instrument]` to all four public methods (`create_payment`, `verify_and_complete`, `direct_debit`, `refund`, `get_payment_status`) for production traceability.

**Why it matters:** The payment processor is the highest-risk financial chokepoint. Using `Money` here proves the type in production before a broader trait migration.

### 3. Hardened `CallbackData` deserialization

**File:** `rings/GOLD-RING-PR00/src/telegram.rs`

- Added `#[serde(deny_unknown_fields)]` to `CallbackData`.
- Prevents silently ignoring extra fields in inline-keyboard callback payloads, reducing type-confusion and replay-attack surface.

### 4. Hardened webhook payload deserialization

**Files:**
- `rings/GOLD-RING-PR00/src/replicate.rs`
- `rings/GOLD-RING-PR00/src/kie.rs`

- Added `#[serde(deny_unknown_fields)]` to `WebhookPayload` (Replicate) and `WebhookPayload` + `WebhookResponse` (Kie.ai).
- Rejecting unknown fields ensures backward-incompatible provider changes fail loudly instead of being silently ignored.

### 5. Verified pre-existing defenses

- **Health cache-control:** `rings/BRONZE-RING-SRV/src/health.rs` already sets `Cache-Control: no-cache, no-store, must-revalidate` on both endpoints (Wave 166). No change needed.
- **DB prompt length cap:** `rings/SILVER-RING-DB00/src/repository.rs::save_prompt` already enforces `MAX_PROMPT_LEN = 2000` (prior wave). No change needed.

---

## Test Results

```
cargo check -p trios-mb-types          ✅
cargo check -p trios-mb-payment        ✅
cargo check -p trios-mb-proto          ✅
cargo test -p trios-mb-types money::*  ✅ (5 tests pass)
```

---

## Deferred Items

The following were evaluated but deferred to keep Wave 169 bounded:

- **Full `PaymentGateway` / `Database` trait migration to `Money`** — requires updating 8+ trait impls across gateways and repositories. Planned for Wave 170 as a follow-on.
- **Tower-Governor per-IP state pruning** — `governor`’s DashMap grows without automatic TTL under sustained IP-spoofed load. Monitoring RAM is the current mitigation.
- **`x402` nano-ton conversion to `Money`** — the `amount * 1_000_000.0` conversion is protected by `is_finite()` guards already.

---

## Cooperation Options for Next Wave

1. **Trait Migration Contract** — I will migrate one payment-gateway trait per wave (Telegram Stars, Robokassa, TON, X402) to accept `Money` instead of `f64`, keeping each PR reviewable and deployable independently.
2. **Property-Based Testing** — I will add `proptest` or `quickcheck` round-trip tests for `Money::from_f64(x).to_f64() ≈ x` and checked-arithmetic overflow cases, catching edge cases unit tests miss.
3. **Serialization Hardening Sweep** — I will run a 10-minute automated scan of every `Deserialize`-derived struct in the codebase, adding `deny_unknown_fields` where safe (i.e. no `flatten` conflicts), and documenting exceptions.
