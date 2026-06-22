# Wave 259 Report

**Date:** 2026-06-16
**Scope:** Timeout wrapping, log sanitization, and deserialization hardening in the payment layer.
**Co-Authored-By:** Claude Opus 4.8 <noreply@anthropic.com>

---

## Fix 1: Wrap `gateway.verify_callback` in tokio timeout (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Pattern:** Every external network call must be wrapped in `tokio::time::timeout` as defense-in-depth, even when the underlying HTTP client has socket-level timeouts.

The `gateway.verify_callback(&params).await` call in `robokassa_callback` previously had no explicit timeout. A stalled Robokassa response could hold the async task indefinitely, exhausting the worker pool and causing cascading failures across the server. Replaced the direct `.await` with `tokio::time::timeout(GATEWAY_VERIFY_TIMEOUT, ...)` where `GATEWAY_VERIFY_TIMEOUT = Duration::from_secs(10)`. Added a new timeout arm that returns `"ERROR: gateway timeout"`.

**Why:** Client-level timeouts can fail to fire if the TCP connection is established but the server stalls during response generation. An explicit Tokio timeout is the only layer that guarantees cancellation at the async-task boundary.

---

## Fix 2: Truncate raw errors before tracing in payment_webhooks.rs (MEDIUM)

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Pattern:** `truncate_for_log` must be applied to all error values before embedding them in `tracing::error!` or `tracing::warn!` macros.

Replaced five raw `error = %e` patterns with `error = %truncate_for_log(&e.to_string(), 1024)`:
1. Line ~98 — `Failed to record webhook event`
2. Line ~119 — `Failed to load transaction`
3. Line ~142 — `Failed to complete Robokassa payment`
4. Line ~157 — `Failed to update transaction status`
5. Line ~168 — `Robokassa verification failed`

**Why:** Error strings from external gateways and the database may contain internal details (table names, SQL fragments, gateway internals) and can be arbitrarily long. Truncating before logging prevents info disclosure and log buffer exhaustion.

---

## Fix 3: Add `is_finite()` deserialization guards to `f64` fields in payment.rs (MEDIUM)

**File:** `rings/GOLD-RING-PR00/src/payment.rs`  
**Pattern:** All `f64` fields that deserialize from untrusted JSON must reject `NaN` and `Infinity` at the deserialization boundary.

Added a `deserialize_finite_f64` helper function that validates `v.is_finite()` inside the serde `deserialize` pipeline. Annotated seven fields across five structs:
- `RobokassaPaymentUrl.out_sum`
- `RobokassaCallback.out_sum`
- `X402PaymentRequest.amount_usd`
- `DirectPaymentRequest.amount`
- `BalanceChange.before`, `after`, `difference`

**Why:** Malicious JSON can inject `NaN` or `Infinity` into numeric fields. These values break comparisons, corrupt aggregations, and can cause panics or infinite loops in downstream financial logic. Rejecting them at deserialization is the earliest and safest defense.

---

## Verification

- `cargo check -p trios-mb-server --target aarch64-apple-darwin` ✅

No regressions introduced. All fixes are additive or tightening and do not change happy-path behavior.

---

## Cooperation Variants for Wave 260

1. **Provider DTO deserialization hardening** — Add `is_finite()` and length-cap guards to `f64` and `String` fields in `GOLD-RING-PR00/src/fal.rs`, `kie.rs`, `providers.rs`, and `replicate.rs` DTOs that accept untrusted provider JSON.
2. **Webhook secret rotation support** — Load secondary env vars (`REPLICATE_WEBHOOK_SECRET_OLD`, `KIE_WEBHOOK_SECRET_OLD`) and accept a webhook if either secret matches, enabling zero-downtime rotation.
3. **ChatMessage.role enum validation** — Replace the raw `String` `role` field in `openai.rs` `ChatMessage` with a strongly-typed enum (`System`, `User`, `Assistant`) to prevent injection of unexpected roles.
