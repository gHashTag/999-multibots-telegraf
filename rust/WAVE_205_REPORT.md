# Wave 205 Security Report — Connection Pool Hardening, Tracing Observability on Critical Paths

## Summary
This wave closes three operational blind spots: unbounded reqwest connection pools, untraced Telegram API timeout helpers, and missing distributed-tracing spans on security middleware and outbound provider calls.

## Fix 1 — Cap idle connections per host on all reqwest clients
**Files:** 11 files across SILVER-RING-AI00 (9 providers), SILVER-RING-PY00 (x402), and SILVER-RING-SC00 (store)
**Threat model:** reqwest’s default `pool_max_idle_per_host` is unbounded (`usize::MAX`). Under sustained load or connection churn, idle connections accumulate indefinitely, exhausting file descriptors and causing service-wide DoS (CWE-770, CWE-400).
**Change:** Added `.pool_max_idle_per_host(10)` to every `reqwest::Client::builder()` chain:
- `elevenlabs.rs`, `fal.rs`, `hedra.rs`, `heygen.rs`, `kie.rs`, `midjourney.rs`, `openai.rs` (3 builders), `replicate.rs`, `x402.rs`, `store.rs`
**Verification:** `cargo check --target aarch64-apple-darwin` passes with zero warnings.

## Fix 2 — `tracing::instrument` on SILVER-RING-TG00 timeout helpers
**File:** `rings/SILVER-RING-TG00/src/utils.rs`
**Threat model:** The 4 centralized Telegram timeout helpers (`send_message_timeout`, `answer_callback_query_timeout`, `dialogue_update_timeout`, `dialogue_exit_timeout`) are called from ~100 handler sites. Without tracing spans, API stalls, timeouts, and retries are invisible in distributed traces, making incident response impossible.
**Change:** Added `#[tracing::instrument(skip_all)]` to all 4 helpers, with targeted fields (`chat_id`, `query_id`) where appropriate.
**Scientific basis:** Google SRE book — “Observability is a prerequisite for reliability.” Untraced critical paths create blind spots during outages.

## Fix 3 — `tracing::instrument` on edge hardening middleware and untraced provider methods
**Files:**
- `rings/BRONZE-RING-SRV/src/router.rs` — `edge_hardening`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs` — `text_to_speech_raw`, `list_voices`, `voice_exists`, `add_voice`, `get_character_balance`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs` — `create_avatar_video`, `check_video_status`, `list_avatars`
- `rings/SILVER-RING-AI00/src/providers/openai.rs` — `chat_completion`, `upgrade_prompt`
**Threat model:** The `edge_hardening` middleware injects security headers and sanitizes error bodies for every HTTP request. Provider methods make live outbound API calls. Without spans, debugging security-header misconfigurations or provider latency spikes requires manual log correlation.
**Change:** Added `#[tracing::instrument(skip_all)]` to the middleware and all targeted provider methods, with selective fields (`voice_id`, `avatar_id`, `video_id`, `model`, `prompt_len`, `audio_len`) for context.
**Verification:** `cargo check --target aarch64-apple-darwin` passes with zero warnings.

## Scientific Literature
- **CWE-770: Allocation of Resources Without Limits or Throttling** — Unbounded connection pools violate resource-throttling principles.
- **CWE-400: Uncontrolled Resource Consumption** — File-descriptor exhaustion from unbounded idle connections is a classic DoS vector.
- **Google SRE Book (Beyer et al.)** — Observability is a prerequisite for reliability. Distributed tracing must cover every tier of the request path.

## Impact
- All 13 reqwest client builders now enforce a hard cap of 10 idle connections per host.
- Every Telegram API timeout helper now emits tracing spans.
- Security middleware and all non-trait provider methods are now traceable.

## Files Modified
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs`
- `rings/SILVER-RING-AI00/src/providers/kie.rs`
- `rings/SILVER-RING-AI00/src/providers/midjourney.rs`
- `rings/SILVER-RING-AI00/src/providers/openai.rs`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`
- `rings/SILVER-RING-PY00/src/x402.rs`
- `rings/SILVER-RING-SC00/src/store.rs`
- `rings/SILVER-RING-TG00/src/utils.rs`
- `rings/BRONZE-RING-SRV/src/router.rs`

## Compilation
```
cargo check --target aarch64-apple-darwin
```
Result: **PASS** (zero warnings, zero errors).
