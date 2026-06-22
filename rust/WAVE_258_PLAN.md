# Wave 258 Plan

**Date:** 2026-06-16
**Scope:** Defense-in-depth timeout wrapping, constant extraction, and info-disclosure elimination in router and provider layers.

---

## Fix 1 — Wrap openai.rs `.send()` in explicit tokio timeout (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`  
**Line:** ~202  
**Problem:** The `chat_completion` method calls `.send().await` without an explicit `tokio::time::timeout` wrapper. All other provider methods in the codebase wrap the reqwest call in a Tokio timeout as defense-in-depth. Relying solely on the reqwest client-level timeout means a hung connection inside reqwest may not be cancellable by our `CancellationToken` infrastructure.  
**Solution:** Wrap the `.send()` call in `tokio::time::timeout(PROVIDER_HTTP_TIMEOUT, ...)`. Map the `Elapsed` variant to `AiError::Provider` with a clear timeout message.

---

## Fix 2 — Extract hardcoded health body limit to named constant (LOW)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Line:** ~196  
**Problem:** `.layer(axum::extract::DefaultBodyLimit::max(4096))` uses an inline magic number. Every other limit in the file (e.g., `WEBHOOK_BODY_LIMIT_BYTES`, `GLOBAL_BODY_LIMIT_BYTES`) is already a named constant. Inconsistent extraction makes the limit hard to discover and risks drift during future refactors.  
**Solution:** Add `const HEALTH_BODY_LIMIT_BYTES: usize = 4096;` near the other body-limit constants and replace the inline `4096`.

---

## Fix 3 — Unify webhook auth failure messages (LOW)

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`  
**Lines:** ~106, ~108, ~118  
**Problem:** `verify_webhook_secret` returns three distinguishable error strings: `"Invalid webhook secret header"`, `"Missing webhook secret header"`, and `"Invalid webhook secret"`. An attacker can probe which failure path was taken, slightly aiding reconnaissance.  
**Solution:** Return a single generic message (`"Unauthorized"`) for all three failure paths. This is consistent with security best practice: authentication failures should not reveal whether the header was missing, malformed, or simply wrong.

---

## Compilation target
`aarch64-apple-darwin`

## Cooperation variants for Wave 259
1. **Provider DTO deserialization hardening** — Add `is_finite()` validation and length caps to `f64` and `String` fields in `GOLD-RING-PR00` provider DTOs that accept untrusted JSON (e.g., `FalLora.scale`, `TaskStatusData.duration`).
2. **Webhook secret rotation support** — Load secondary env vars (`REPLICATE_WEBHOOK_SECRET_OLD`, `KIE_WEBHOOK_SECRET_OLD`) and accept a webhook if either secret matches, enabling zero-downtime rotation.
3. **Raw error sanitization in payment_webhooks.rs** — Apply `truncate_for_log` to the raw Robokassa verification error before logging, preventing potential info disclosure from payment-gateway internals.
