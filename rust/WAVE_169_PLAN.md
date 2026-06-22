# Wave 169 Security Audit — Decomposed Plan

**Date:** 2026-06-16  
**Focus:** Financial precision foundations, deserialization hardening, observability hygiene  
**Literature:** `steel_cent` (minor-unit integer money with checked arithmetic) [^1]; `primitive_fixed_point_decimal` (const-generic scaled integer) [^2]; serde `deny_unknown_fields` hardening patterns [^3].

---

## Overview

After Waves 150–168 hardened f64 chokepoints, capped strings, fail-closed configs, and eliminated panics, the codebase still relies on `f64` for all monetary values. This is a latent precision and safety risk. Wave 169 introduces a purpose-built `Money` integer type (minor units) and applies it to the highest-risk financial processor, while also tightening deserialization boundaries and adding cache-control hygiene to observability endpoints.

---

## Phase 1: Create `Money` Integer Type (P0)

**Weakness:** All financial amounts are `f64`. Binary floating-point cannot exactly represent common decimal values (e.g., 0.1), leading to drift across chains of operations. Prior waves added `is_finite()` guards, but truncation and rounding errors remain possible.

**Fix:** Introduce `trios_mb_types::Money` backed by `i64` minor units (e.g., cents × 100), with checked arithmetic, explicit `from_f64`/`to_f64` conversions, and `Debug` redaction.

**Files:**
- `rings/GOLD-RING-TY00/src/money.rs` — new module.
- `rings/GOLD-RING-TY00/src/lib.rs` — re-export `Money`.

**Details:**
- `struct Money(i64)` newtype.
- `from_f64(v: f64) -> Option<Self>` requiring `v.is_finite() && v >= 0.0`, multiplying by 100 and rounding via `round()` to avoid floor bias.
- `to_f64(self) -> f64` dividing by 100.0.
- `checked_add`, `checked_sub`, `checked_mul`, `checked_div` returning `Option<Self>`.
- `Display` formatting as decimal (e.g., `₽123.45`).
- `Debug` redacting the raw value (e.g., `Money(REDACTED)`).
- `Serialize`/`Deserialize` as string `"123.45"` to avoid precision loss in JSON.
- Constants: `ZERO`, `MAX` (i64::MAX minor units).

---

## Phase 2: Migrate Payment Processor Internal Math to `Money` (P0)

**Weakness:** `PaymentProcessor` computes refunds, balance adjustments, and gateway verification using `f64` directly. Even with NaN/Inf guards, small rounding errors can compound.

**Fix:** Convert `amount` to `Money` at the processor boundary, perform all math with checked operations, and convert back to `f64` only when calling gateway-specific APIs that require it.

**Files:**
- `rings/SILVER-RING-PY00/src/services/payment_processor.rs`

**Details:**
- In `create_payment`, `direct_debit`, `verify_and_complete`, and refund flow: convert input `amount: f64` to `Money` immediately after the `is_finite()` guard.
- Replace manual comparisons with `Money` equality/ordering.
- Any `checked_*` returning `None` should map to `AppError::Validation("Monetary overflow")`.

---

## Phase 3: Hard Health Endpoint Cache Control (P1)

**Weakness:** Health and version responses lack `Cache-Control`. Reverse proxies or CDN edge nodes may cache a stale "healthy" response during an incident, delaying failover detection.

**Fix:** Add `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` to both `/health` and `/health/simple` responses.

**Files:**
- `rings/BRONZE-RING-SRV/src/health.rs`

---

## Phase 4: `CallbackData` Deserialization Hardening (P1)

**Weakness:** `CallbackData` is an untagged enum used for inline keyboard callbacks. By default, serde ignores unknown fields. A malformed or attacker-crafted payload with extra fields could match the wrong variant silently, causing unexpected state transitions.

**Fix:** Add `#[serde(deny_unknown_fields)]` to each struct variant inside `CallbackData`. This forces the deserializer to reject unknown fields, preventing variant mis-match attacks.

**Files:**
- `rings/SILVER-RING-SN00/src/callback_data.rs` (or wherever `CallbackData` is defined)

**Caveat:** If any variant uses `#[serde(flatten)]`, `deny_unknown_fields` is incompatible. We will verify first and skip those variants.

---

## Phase 5: DB Boundary Prompt Length Cap (P1)

**Weakness:** `save_prompt` stores user prompts as `TEXT` with no Rust-level length cap. Maliciously large prompts (megabytes) could exhaust DB storage or cause replication lag.

**Fix:** Add `MAX_PROMPT_LEN: usize = 2000` at the DB repository boundary and truncate or reject overly long prompts before insertion.

**Files:**
- `rings/SILVER-RING-DB00/src/repository.rs` (`save_prompt` method)

---

## Phase 6: Verification & Clippy (P2)

- `cargo clippy --all-targets` clean.
- `cargo test` passing.
- Verify `Money::from_f64(NaN)` returns `None`.
- Verify `Money::from_f64(1_000_000_000_000.00)` does not overflow `i64`.

---

## Cooperation Options

1. **Integration-Test Contract** — I will write `#[test]` cases for `Money` checked overflow, `from_f64` NaN/Inf rejection, and `Display`/`Serialize` round-trip, so future waves can extend the type with confidence.
2. **Gateway-Migration Roadmap** — We maintain a live checklist of which payment gateways still accept `f64` in their trait signatures. Each subsequent wave migrates one gateway (Telegram Stars, Robokassa, TON) to `Money`, keeping the scope bounded.
3. **Audit Pairing** — Every two waves, I will run a 15-minute static-analysis pass (`cargo audit`, `semgrep --config p/rust`, `cargo geiger`) and surface results before the next plan is written, so critical dependency CVEs or new `unsafe` blocks are caught early.

---

[^1]: `steel_cent` — Currency-aware money type with checked arithmetic: <https://docs.rs/steel-cent/latest/steel_cent/struct.Money.html>
[^2]: `primitive_fixed_point_decimal` — Const-generic scaled integer: <https://docs.rs/primitive_fixed_point_decimal/latest>
[^3]: serde `deny_unknown_fields` container attributes and security rationale: <https://serde.rs/container-attrs> / <https://github.com/serde-rs/serde/issues/2634>
