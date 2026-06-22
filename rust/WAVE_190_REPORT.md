# Wave 190 Security Report

| Item | Value |
|------|-------|
| Date | 2026-06-16 |
| Branch | master |
| Commit | `TBD` |

## Fix 1 — spawn_traced time-decay reset in BRONZE-RING-APP (HIGH)

**File:** `rings/BRONZE-RING-APP/src/main.rs`

**Problem:** The `spawn_traced` helper in the main application entry point used a monotonic `consecutive_failures` counter without a time-decay reset. A transient failure followed by hours of healthy operation could still cause an immediate supervisor panic on the next error.

**Change:** Added `last_failure: Option<Instant>` and `FAILURE_RESET_SECS: u64 = 300`. Before each factory invocation, if `>= 300s` elapsed since the last recorded failure, reset `consecutive_failures = 0`. This matches the same pattern already applied to `worker.rs` in Wave 189.

## Fix 2 — Telegram API timeout wrappers in generation handlers (HIGH)

**File:** `rings/SILVER-RING-SN00/src/generation_utils.rs`

**Problem:** `return_to_menu` and `dispatch_and_reply` performed unbounded `bot.send_message(...)` and `dialogue.update(...)` calls. Under Telegram API congestion or network partition these futures could hang indefinitely, causing the entire handler to stall and the FSM dialogue state to remain stuck in a transient scene.

**Change:**
- Wrapped `bot.send_message(...).reply_markup(...)` and `dialogue.update(Scene::MainMenu)` in `return_to_menu` with `tokio::time::timeout(Duration::from_secs(30), ...)`.
- Replaced 4 plain `bot.send_message` calls in `dispatch_and_reply` with `send_message_timeout`.
- Wrapped 2 `dialogue.update(...)` calls in `dispatch_and_reply` with `tokio::time::timeout(Duration::from_secs(30), ...)`.
- On timeout, log a warning and return `Ok(())` instead of hanging.

## Fix 3 — Distributed tracing on provider and payment methods (MEDIUM)

**Files:**
- `rings/SILVER-RING-AI00/src/providers/{elevenlabs,fal,hedra,heygen,kie,midjourney,openai,replicate}.rs`
- `rings/SILVER-RING-AI00/src/orchestrator.rs`
- `rings/SILVER-RING-PY00/src/{ton,x402,telegram_stars,robokassa}.rs`

**Problem:** Critical async methods (generation dispatch, status checks, result retrieval, payment creation, webhook verification, refunds) lacked `tracing::instrument`. In production incidents, missing spans made it impossible to correlate latency spikes or errors with specific providers, payment gateways, or user requests.

**Change:** Added `#[tracing::instrument(skip_all)]` before:
- `generate`, `check_status`, `get_result` in all 8 AI provider implementations.
- `dispatch`, `check_status`, `get_result` in the orchestrator trait implementation.
- `create_payment`, `verify_callback`, `refund`, `get_payment_url` in all 4 payment gateway implementations.

This gives full span coverage for the AI generation and payment lifecycle without capturing sensitive request payloads in trace attributes.

## Verification

- `cargo check --target aarch64-apple-darwin -p trios-mb-ai -p trios-mb-payment -p trios-mb-app -p trios-mb-scenes` passes cleanly (pre-existing warnings in `trios-mb-scenes` unchanged).

## Patterns for Next Waves

1. **spawn_traced time-decay** — any background task supervisor using a monotonic failure counter should reset after a healthy interval.
2. **Telegram API timeout wrapping** — any unbounded `bot.send_message` or `dialogue.update` in a handler should use `tokio::time::timeout` with a 30s ceiling.
3. **tracing::instrument coverage** — any async service method that participates in a request-response lifecycle should have a span to maintain observability during incidents.
