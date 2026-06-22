# Wave 259 Plan

**Date:** 2026-06-16
**Scope:** Timeout wrapping, log sanitization, and deserialization hardening in the payment layer.

---

## Fix 1 — Wrap `gateway.verify_callback` in tokio timeout (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Line:** ~87  
**Problem:** `gateway.verify_callback(&params).await` is an external network call to Robokassa with no `tokio::time::timeout`. A slow or hung response will hold the async task indefinitely, potentially exhausting the worker pool and causing cascading failures.  
**Solution:** Wrap the call in `tokio::time::timeout(Duration::from_secs(10), ...)` with a three-arm match. On timeout, return `"ERROR: gateway timeout"`.

---

## Fix 2 — Truncate raw errors before tracing in payment_webhooks.rs (MEDIUM)

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Lines:** ~98, ~119, ~142, ~157, ~168  
**Problem:** Multiple `tracing::error!(error = %e, ...)` statements log raw DB and gateway error strings without truncation. These strings may contain internal details (table names, SQL fragments, or gateway internals) and can be arbitrarily long.  
**Solution:** Replace each `error = %e` with `error = %truncate_for_log(&e.to_string(), 1024)`.

---

## Fix 3 — Add `is_finite()` deserialization guards to `f64` fields in payment.rs (MEDIUM)

**File:** `rings/GOLD-RING-PR00/src/payment.rs`  
**Problem:** `RobokassaPaymentUrl.out_sum`, `RobokassaCallback.out_sum`, `X402PaymentRequest.amount_usd`, `DirectPaymentRequest.amount`, and `BalanceChange.before`/`after`/`difference` all deserialize `f64` without rejecting `NaN` or `Infinity`. Malicious JSON could inject non-finite values that propagate through financial calculations.  
**Solution:** Introduce a `deserialize_finite_f64` helper and annotate every affected field with `#[serde(deserialize_with = "deserialize_finite_f64")]`.

---

## Compilation target
`aarch64-apple-darwin`

## Cooperation variants for Wave 260
1. **Provider DTO deserialization hardening** — Add `is_finite()` and length-cap guards to `f64` and `String` fields in `GOLD-RING-PR00/src/fal.rs`, `kie.rs`, `providers.rs`, and `replicate.rs` DTOs that accept untrusted provider JSON.
2. **Webhook secret rotation support** — Load secondary env vars (`REPLICATE_WEBHOOK_SECRET_OLD`, `KIE_WEBHOOK_SECRET_OLD`) and accept a webhook if either secret matches, enabling zero-downtime rotation.
3. **ChatMessage.role enum validation** — Replace the raw `String` `role` field in `openai.rs` `ChatMessage` with a strongly-typed enum (`System`, `User`, `Assistant`) to prevent injection of unexpected roles.
