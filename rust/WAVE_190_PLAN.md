# Wave 190 Plan — App Supervisor Resilience, Telegram API Timeouts, Tracing Instrumentation

**Date:** 2026-06-16
**Target:** trios-mb Rust monorepo — BRONZE-RING-APP, SILVER-RING-SN00, SILVER-RING-AI00, SILVER-RING-PY00

---

## Research Findings

### Weakness 1: `BRONZE-RING-APP/src/main.rs` `spawn_traced` lacks time-decay reset
The app's `spawn_traced` (lines 14-91) has the same monotonic `consecutive_failures` counter as the one fixed in Wave 189 for `SILVER-RING-JB00/src/worker.rs`. After 10 total panics, the supervisor permanently gives up, affecting the HTTP server, retry maintenance, and all bot dispatchers.

**Literature:** Same as Wave 189 — Erlang OTP `intensity` + `period`, Akka `withinTimeRange`.

### Weakness 2: `generation_utils.rs` Telegram API calls without timeout
`return_to_menu` (94 call sites) and `dispatch_and_reply` (56 call sites) contain raw `bot.send_message` and `dialogue.update` without `tokio::time::timeout`. A stalled Telegram API call hangs the dispatcher worker indefinitely.

**Literature:** python-telegram-bot docs confirm indefinite hangs are real; explicit timeouts (connect/read/write/pool) are essential for production bots.

### Weakness 3: Missing `tracing::instrument` on AI providers and payment gateways
40+ async functions across AI providers and payment gateways lack `#[tracing::instrument]`. Without distributed tracing spans, security incident response cannot reconstruct attack timelines from provider calls and payment processing.

**Literature:** OneUptime shows OpenTelemetry trace correlation enables incident timeline reconstruction. SystemsHardening recommends instrumenting security-relevant operations.

---

## Implementation

### Fix 1 — Add time-decay reset to `main.rs` `spawn_traced`
- Add `last_failure: Option<Instant>` and `FAILURE_RESET_SECS = 300`.
- Reset `consecutive_failures = 0` before each factory invocation if `> 300s` since last failure.

### Fix 2 — Wrap Telegram API calls in `generation_utils.rs`
- `return_to_menu`: wrap `bot.send_message(...).reply_markup(...)` and `dialogue.update(...)` with `tokio::time::timeout(30s)`.
- `dispatch_and_reply`: replace 4 plain `bot.send_message` with `send_message_timeout`; wrap 2 `dialogue.update` with timeout.

### Fix 3 — Add `#[tracing::instrument(skip_all)]` to provider/payment async methods
- AI providers: `generate`, `check_status`, `get_result` methods in all 8 provider files.
- Payment gateways: `create_payment`, `verify_callback`, `refund`, `get_payment_url` in all 4 gateway files.

---

## Verification
1. `cargo check --package trios-mb-app --target aarch64-apple-darwin`
2. `cargo check --package trios-mb-scenes --target aarch64-apple-darwin`
3. `cargo check --package trios-mb-ai --target aarch64-apple-darwin`
4. `cargo check --package trios-mb-payment --target aarch64-apple-darwin`

---

## Deferred
- Dialogue timeout helper in `trios_mb_tg::utils` (reusable across all scene handlers).
- Per-chat outbound rate limiting for Telegram API calls.
- `InMemStorage` TTL eviction / Redis migration.
