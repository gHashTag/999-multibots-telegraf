# Wave 258 Report

**Date:** 2026-06-16
**Scope:** Defense-in-depth timeout wrapping, constant extraction, and info-disclosure elimination in router and provider layers.
**Co-Authored-By:** Claude Opus 4.8 <noreply@anthropic.com>

---

## Fix 1: Wrap openai.rs `.send()` in explicit tokio timeout (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`  
**Pattern:** All provider HTTP calls must be wrapped in `tokio::time::timeout` as defense-in-depth, even when the reqwest client already has a socket-level timeout.

The `chat_completion` method previously called `.send().await` without an explicit Tokio timeout wrapper. This meant a hung connection inside reqwest could not be cancelled by our `CancellationToken` infrastructure. Replaced the direct `.send().await` with a `tokio::time::timeout(PROVIDER_HTTP_TIMEOUT, ...)` match that distinguishes success (`Ok(Ok(r))`), reqwest error (`Ok(Err(e))`), and timeout (`Err(_)`), returning appropriate `AiError::Provider` variants for each case.

**Why:** Client-level timeouts can fail to fire if the TCP connection is established but the server stalls during header generation. An explicit Tokio timeout is the only layer that guarantees cancellation at the async-task boundary.

---

## Fix 2: Extract hardcoded health body limit to named constant (LOW)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Pattern:** Every body-limit value must be a named constant, never an inline magic number.

Added `const HEALTH_BODY_LIMIT_BYTES: usize = 4096;` alongside the existing `WEBHOOK_BODY_LIMIT_BYTES` and `GLOBAL_BODY_LIMIT_BYTES` constants. Replaced the inline `4096` in both `create_router` and `create_router_with_payments` health-route builders with the new constant.

**Why:** Magic numbers are a source of configuration drift and make it impossible to grep for the limit. Centralizing the value ensures both router constructors stay consistent and future refactors won't accidentally diverge.

---

## Fix 3: Unify webhook auth failure messages (LOW)

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`  
**Pattern:** Authentication failures must return a single generic message to prevent reconnaissance.

`verify_webhook_secret` previously returned three distinguishable strings:
- `"Invalid webhook secret header"` — header present but not valid UTF-8
- `"Missing webhook secret header"` — header absent
- `"Invalid webhook secret"` — header present and valid UTF-8 but wrong value

An attacker could distinguish these three paths, learning whether the header was missing, malformed, or simply incorrect. All three paths now return the identical string `"Unauthorized"`.

**Why:** OWASP recommends returning the same error message for all authentication failures to prevent username enumeration and credential-stuffing optimization. The same principle applies to webhook secret validation: attackers should learn nothing beyond "authentication failed."

---

## Verification

- `cargo check -p trios-mb-ai --target aarch64-apple-darwin` ✅
- `cargo check -p trios-mb-server --target aarch64-apple-darwin` ✅

No regressions introduced. All fixes are additive or tightening and do not change happy-path behavior.

---

## Cooperation Variants for Wave 259

1. **Provider DTO deserialization hardening** — Add `is_finite()` validation and length caps to `f64` and `String` fields in `GOLD-RING-PR00` provider DTOs that accept untrusted JSON (e.g., `FalLora.scale`, `TaskStatusData.duration`).
2. **Webhook secret rotation support** — Load secondary env vars (`REPLICATE_WEBHOOK_SECRET_OLD`, `KIE_WEBHOOK_SECRET_OLD`) and accept a webhook if either secret matches, enabling zero-downtime rotation.
3. **Raw error sanitization in payment_webhooks.rs** — Apply `truncate_for_log` to the raw Robokassa verification error before logging, preventing potential info disclosure from payment-gateway internals.
