# Wave 191 Security Report

| Item | Value |
|------|-------|
| Date | 2026-06-16 |
| Branch | master |
| Commit | `TBD` |

## Fix 1 — Provider success-path response body caps (HIGH)

**Files:** `rings/SILVER-RING-AI00/src/providers/{fal,heygen,hedra,kie,openai,elevenlabs,replicate}.rs`, `rings/SILVER-RING-AI00/src/providers/mod.rs`

**Problem:** All 7 active AI providers read successful HTTP responses via `.json()` / `.json::<T>()` without first checking `resp.content_length()` against a cap. A compromised or misconfigured provider could stream a multi-gigabyte payload and cause an out-of-memory crash. Error bodies were already capped at 64 KB via `read_error_body`; only the success path was unprotected.

**Change:**
- Added `check_json_body_size(resp: &reqwest::Response, provider: &str, max_bytes: u64)` helper to `providers/mod.rs`.
- Applied the check before all 17 `.json()` call sites across 7 provider files.
- Cap set to 64 MB (`64_000_000` bytes). On exceed, returns `AppError::Ai(AiError::Provider { message: "response body too large: ..." })`.

## Fix 2 — Silent DB error elimination in webhook handlers (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

**Problem:** `replicate_webhook` and `kie_ai_webhook` both used `let _ = state.db.update_generation_status(...)` on DB error branches, logging the error but then falling through to return HTTP 200 OK. Because the idempotency table was written **before** the DB update, a retry from the provider would be deduplicated and skipped, permanently leaving the generation in an inconsistent state (e.g., stuck as "running" when it actually completed or failed).

**Change:**
- Reordered idempotency recording to **after** the DB update succeeds. This ensures that if the DB update fails, the provider receives a 503 and retries; on retry, the generation status is updated because no idempotency record exists yet.
- Changed all 4 silent `Ok(Err(e))` branches in the completed/failure paths of both handlers to return `StatusCode::SERVICE_UNAVAILABLE` with a clear error message, so the provider retries instead of assuming success.
- Added idempotency recording at the end of each handler with graceful handling of `Ok(false)` (duplicate after processing), `Ok(Err(e))`, and timeout.

## Fix 3 — Balance deduction state-validation guards (HIGH)

**Files:** `rings/SILVER-RING-SN00/src/{ai_cover.rs,voice_training.rs,ai_reels.rs,music_generation.rs}`

**Problem:** Four callback handlers (`ac:confirm`, `vt:confirm`, `reels:*`, `mus:suno/udio`) called `deduct_balance` before validating that the prerequisite state field was present. If a user triggered the confirm callback without completing the prerequisite step (e.g., stale inline keyboard after session timeout), balance was deducted but no generation job was created, causing direct financial loss.

**Change:**
- Added explicit state-field guards before each `deduct_balance` call:
  - `ai_cover.rs`: check `state.audio_url` is `Some` and non-empty.
  - `voice_training.rs`: check `state.audio_url` is `Some` and non-empty.
  - `ai_reels.rs`: check `state.prompt` is `Some` and non-empty.
  - `music_generation.rs`: check `state.prompt` is `Some` and non-empty.
- On missing state, send a user-facing error message and return early without deducting balance.
- Renamed `_state` to `state` in `ai_cover.rs` and `voice_training.rs` callback handlers so the guard can access the field.

## Literature Review

| Topic | Reference | Key Insight |
|-------|-----------|-------------|
| Webhook security | OWASP Webhook Security Guidelines Cheat Sheet | Mandates body size limits, constant-time HMAC, atomic idempotency after side effects |
| Signature brute-forcing | Svix Blog, "Securely Verifying Signature Hashes" | Non-constant-time string comparison allows byte-by-byte brute-forcing across millions of requests |
| Telegram API stalls | StepCodex, "Telegram delivery reliability" | Documents production polling stalls; proposes stateful outbox with failure classification |
| Distributed tracing | tokio-rs/tracing Issue #3453 / docs | `#[instrument]` on `async fn` adds adapter frames; use `skip_all` with lightweight fields in production |
| Async backpressure | Microsoft, "Async Rust: From Futures to Production" Ch.13 | Bounded `mpsc` and `Semaphore` are core primitives; unbounded growth is a primary failure mode |

## Verification

- `cargo check --target aarch64-apple-darwin -p trios-mb-ai -p trios-mb-server -p trios-mb-scenes` passes cleanly.
- Pre-existing warnings in `trios-mb-scenes` unchanged.

## Patterns for Next Waves

1. **Provider response body caps** — any `.json()` or `.bytes()` on external HTTP responses must have a `content_length()` cap to prevent OOM.
2. **Webhook idempotency ordering** — idempotency must be recorded **after** state mutation succeeds, never before, to prevent stuck retries.
3. **Balance deduction guards** — never deduct balance before validating that all prerequisite state fields are present and non-empty.
