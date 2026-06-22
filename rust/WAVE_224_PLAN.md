# WAVE 224 PLAN

## Objective
Close three remaining reliability and observability gaps identified in the post-Wave 223 sweep: unbounded provider HTTP calls, unbounded DB calls in remaining scene handlers, and missing tracing spans on provider helpers.

## Literature
- **CWE-1088** — *Synchronous Access of Remote Resource without Timeout*: Without explicit timeouts, a slow remote resource blocks the caller indefinitely, causing thread pool exhaustion and cascading failures.
- **CWE-410** — *Insufficient Resource Pool*: Connection pools that are too small or lack timeouts can be exhausted by peak traffic or an attacker.
- **OWASP Logging Cheat Sheet** — Distributed tracing requires unique interaction identifiers propagated across all related events. `tracing::instrument` on every async handler creates the spans that enable this propagation.

## Fixes

### Fix 1 — Provider HTTP `.send()` timeout across all remaining AI providers
**Files:**
- `rings/SILVER-RING-AI00/src/providers/heygen.rs`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `rings/SILVER-RING-AI00/src/providers/kie.rs`
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs`

**Change:** Add `const PROVIDER_HTTP_TIMEOUT: Duration = Duration::from_secs(60);` to each file (or reuse if already present). Wrap every `.send().await` call in `tokio::time::timeout`. On timeout, return `AiError::Provider` with a `"request timed out"` message. This brings all providers in line with the OpenAI hardening from Wave 223 Fix 2.

### Fix 2 — DB timeout wrapping in `handlers.rs` and `invite.rs`
**Files:**
- `rings/SILVER-RING-SN00/src/handlers.rs`
- `rings/SILVER-RING-SN00/src/invite.rs`

**Change:** Reuse `DB_TIMEOUT: Duration = Duration::from_secs(10)` from `generation_utils.rs` (or add locally). Wrap:
- `handlers.rs` line ~421: `db.get_balance(telegram_id).await`
- `handlers.rs` line ~518: `db.get_referral_count(telegram_id).await`
- `invite.rs` line ~27: `db.get_referral_count(tid).await`

On timeout, log `tracing::warn!` and return a localized fallback message.

### Fix 3 — `#[tracing::instrument]` on KIE submit helpers
**File:** `rings/SILVER-RING-AI00/src/providers/kie.rs`

**Change:** Add `#[tracing::instrument(skip_all)]` to:
- `submit_sora`
- `submit_video`
- `submit_image`

These helpers are called from the already-instrumented `generate()` method but lack their own spans, making their internal latency invisible in distributed traces.

## Verification
- `cargo check -p trios-mb-ai -p trios-mb-scenes -p trios-mb-server -p trios-mb-app` must pass.
- `cargo test -p trios-mb-ai` must pass.

## Cooperation Variants for Wave 225
- **Variant A**: Add `#[tracing::instrument]` to all remaining provider helpers across ElevenLabs, Fal, Replicate, Hedra, HeyGen that still lack it.
- **Variant B**: Wrap `tokio::time::timeout` around DB calls in `payment.rs` and other remaining scene handler modules that still use bare `.await` on DB methods.
- **Variant C**: Replace `std::env::var("FRONTEND_URL").map(...).unwrap_or_default()` in `router.rs` with explicit error logging so a missing `FRONTEND_URL` is visible to operators.
