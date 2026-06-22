# WAVE 222 PLAN

## Objective
Close three remaining security gaps identified in the post-Wave 221 codebase sweep:
1. Empty/whitespace-only text bypassing length checks in six Telegram scene handlers.
2. Missing empty-prompt validation in four AI providers (KIE, Fal, Replicate, Hedra).
3. Infrastructure-configuration leakage in webhook error responses.

## Literature
- OWASP AISVS C2.2 — *Pre-tokenization input normalization*: mandates rejecting empty-equivalent payloads (zero-width characters, bidirectional overrides) before reaching downstream APIs.
- CWE-209 (MITRE) — *Generation of Error Message Containing Sensitive Information*: error responses must not reveal internal configuration state (missing secrets, uninitialized gateways) to unauthenticated callers.
- OWASP Error Handling Cheat Sheet — recommends RFC 7807 generic error bodies; log full diagnostics server-side only.

## Fixes

### Fix 1 — Empty/whitespace text rejection in scene handlers
**Files:**
- `rings/SILVER-RING-SN00/src/chat_with_avatar.rs`
- `rings/SILVER-RING-SN00/src/improve_prompt.rs`
- `rings/SILVER-RING-SN00/src/neuro_coder.rs`
- `rings/SILVER-RING-SN00/src/tech_support.rs`
- `rings/SILVER-RING-SN00/src/avatar_transform.rs`
- `rings/SILVER-RING-SN00/src/flux_kontext.rs`

**Change:** After extracting `msg.text()`, add `let trimmed = text.trim(); if trimmed.is_empty() { ... }` before the length-cap check. Return a localized error and abort the handler. This prevents paying for empty prompts and wasting API credits.

### Fix 2 — Empty-prompt validation in remaining AI providers
**Files:**
- `rings/SILVER-RING-AI00/src/providers/kie.rs`
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs`

**Change:** In each `generate()` method, after extracting `request.prompt`, add:
```rust
let prompt = request.prompt.as_deref().unwrap_or("").trim();
if prompt.is_empty() {
    return Err(AppError::Validation("Empty prompt is not allowed".to_string()));
}
```
This brings KIE, Fal, Replicate, and Hedra in line with OpenAI/ElevenLabs/HeyGen (Wave 221).

### Fix 3 — Sanitize webhook error responses
**Files:**
- `rings/BRONZE-RING-SRV/src/webhooks.rs`
- `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`

**Change:** Replace literal diagnostic strings (`"Webhook secret not configured"`, `"ERROR: no payment gateway"`) with generic `"Internal server error"` in HTTP response bodies. Retain the detailed messages in `tracing::error!` server-side logs. This closes CWE-209 info-disclosure.

## Verification
- `cargo check -p trios-mb-ai -p trios-mb-scenes -p trios-mb-server -p trios-mb-app` must pass.
- `cargo test -p trios-mb-ai` must pass (existing tests).

## Cooperation Variants for Wave 223
- **Variant A**: DB timeout wrapping in `generation_utils.rs` and `handlers.rs` helpers.
- **Variant B**: Provider HTTP `.send().await` wrapped in `tokio::time::timeout` (KIE, Fal, Replicate, Hedra, OpenAI, HeyGen).
- **Variant C**: `tracing::instrument` gap closure in `health.rs`, `openai.rs`, and other uninstrumented async entrypoints.
