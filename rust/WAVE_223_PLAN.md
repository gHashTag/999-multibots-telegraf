# WAVE 223 PLAN

## Objective
Close three reliability/observability gaps identified in the post-Wave 222 sweep:
1. Unbounded DB calls in `generation_utils.rs` that can stall bot handlers indefinitely.
2. Missing application-level HTTP timeout around `.send().await` in OpenAI provider internal methods.
3. Missing `#[tracing::instrument]` on OpenAI provider internal helpers, creating observability blind spots.

## Literature
- **CWE-1088** — *Synchronous Access of Remote Resource without Timeout*: Without explicit timeouts, a slow or unresponsive remote resource blocks the caller indefinitely, causing thread pool exhaustion and cascading failures.
- **OWASP ASVS V14.7** — Requires documented connection timeouts for every external service; synchronous flows should "fail fast."
- **OWASP Logging Cheat Sheet** — Distributed tracing requires unique interaction/correlation IDs propagated across spans. `tracing::instrument` on every `pub async fn` handler is the mechanism that enables this propagation in Rust/Tokio ecosystems.

## Fixes

### Fix 1 — DB timeout wrapping in `generation_utils.rs`
**File:** `rings/SILVER-RING-SN00/src/generation_utils.rs`

**Change:** Add `const DB_TIMEOUT: Duration = Duration::from_secs(10);` at module scope. Wrap every `await`ed DB call in `tokio::time::timeout`:
- `db.get_user_by_telegram_id()` in `load_lang_by_id`
- `db.get_user_by_telegram_id()` in `load_lang_cb`
- `db.deduct_balance()` in `deduct_balance`
- `db.get_balance()` in `deduct_balance`
- `db.create_generation()` in `dispatch_and_reply`
- `db.add_balance()` in `dispatch_and_reply` (both refund paths)

On timeout, log `tracing::warn!` and return a localized/fallback error so the user sees a clear message instead of an indefinite hang.

### Fix 2 — Provider HTTP `.send().await` timeout in `openai.rs`
**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Change:** Add `const PROVIDER_HTTP_TIMEOUT: Duration = Duration::from_secs(60);`. In `generate_image` and `text_to_speech`, wrap the `.send().await` chain:
```rust
let resp = match tokio::time::timeout(PROVIDER_HTTP_TIMEOUT, self.http.post(...).send()).await {
    Ok(Ok(resp)) => resp,
    Ok(Err(e)) => { /* existing provider error */ }
    Err(_) => { return Err(AiError::Provider { provider: "openai".into(), message: "request timed out".into() }.into()); }
};
```
The reqwest client already has a 60s builder timeout, but an outer `tokio::time::timeout` is an additional defense-in-depth layer that aborts the future cleanly even if reqwest's internal timer fails.

### Fix 3 — `#[tracing::instrument]` on OpenAI internal helpers
**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Change:** Add `#[tracing::instrument(skip_all)]` to:
- `generate_image` (line ~202)
- `text_to_speech` (line ~262)

These are called by the already-instrumented `generate()` method, but without their own spans their internal latency is invisible in distributed traces.

## Verification
- `cargo check -p trios-mb-ai -p trios-mb-scenes` must pass.
- `cargo test -p trios-mb-ai` must pass.

## Cooperation Variants for Wave 224
- **Variant A**: Extend `tokio::time::timeout` to DB calls in other scene handlers (`handlers.rs`, `invite.rs`, `payment.rs`) beyond `generation_utils.rs`.
- **Variant B**: Add `#[tracing::instrument]` to all provider `generate()` and internal method entrypoints across KIE, Fal, Replicate, Hedra, ElevenLabs, HeyGen.
- **Variant C**: Wrap all provider `.send().await` calls in all providers with `tokio::time::timeout` to ensure uniform defense against unbounded HTTP hangs.
