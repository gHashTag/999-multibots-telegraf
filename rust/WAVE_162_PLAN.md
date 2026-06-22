# Wave 162 Security Plan

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** Bot resilience, webhook idempotency, financial NaN/Inf guards, log injection prevention, AI response caps

---

## Literature Review

### Process Supervision
Armstrong, *Making Reliable Distributed Systems in the Presence of Software Errors* (PhD thesis, 2003): OTP supervisors demonstrate that letting crashed processes restart with exponential backoff is more reliable than trying to prevent all crashes. A Telegram bot dispatcher that panics on a poisoned message should restart automatically with backoff, not remain dead.

### Webhook Idempotency
Stripe API Design Guide (2024): every webhook handler must consult an idempotency journal before processing. The key is `(provider, event_id)` with a 24-hour TTL. Duplicate delivery (whether from retries, replays, or provider bugs) should be discarded at the door, not deep inside business logic.

### Financial Floating-Point Safety
Goldberg, *What Every Computer Scientist Should Know About Floating-Point Arithmetic* (1991): `f64` introduces rounding error, but more critically, `NaN` and `Infinity` break total ordering and make equality checks useless. A single `NaN` balance makes the user invisible to all comparisons (`NaN == x` is always false).

### Log Injection Prevention
OWASP Logging Cheat Sheet (2024): attacker-controlled strings embedded in logs can spoof severity levels, overflow buffers, or break structured log parsers. Tracing fields using `%` formatting should truncate strings at a conservative limit (≤ 256 chars) and strip control characters.

### Resource Bounding
*Nygard, Release It!* 2nd Ed.: every external I/O must have a hard byte cap. An unbounded `resp.bytes()` is a remote-triggered OOM vector. Workers must pre-check `Content-Length` and enforce a maximum acceptable payload size.

---

## Decomposed Tasks

### Phase 1 — CRITICAL: Bot Dispatcher Restart Loop
**File:** `rings/BRONZE-RING-APP/src/main.rs`
**Problem:** Bot dispatchers are launched with bare `tokio::spawn`. Panics are logged but the bot never restarts. A single poisoned message permanently kills that bot token.
**Fix:** Wrap each bot dispatcher in the existing `spawn_traced` helper with exponential backoff (5s → 60s cap). Track `consecutive_failures`; after 10 consecutive failures, escalate to a fatal error that shuts the entire pool. Pass a `CancellationToken::child_token()` into each loop for cooperative shutdown instead of `handle.abort()`.

### Phase 2 — HIGH: Webhook Idempotency Table
**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Problem:** Replicate/Kie.ai webhooks rely only on terminal-state guards, which do not protect against near-simultaneous duplicate delivery while the generation is still `Processing`.
**Fix:** Add `record_webhook_event(provider, event_id)` and `has_webhook_event(provider, event_id)` to the `Database` trait. Implement via a new table `webhook_events(provider TEXT, event_id TEXT, processed_at TIMESTAMPTZ, PRIMARY KEY (provider, event_id))` with `INSERT ... ON CONFLICT DO NOTHING`. Call at the top of every webhook handler; return `200 OK` immediately on conflict.

### Phase 3 — HIGH: f64 NaN/Inf Guards
**Files:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `deduct_balance` and `add_balance` reject negative/non-positive amounts but do not check `is_finite()`. A `NaN` or `Infinity` amount can corrupt the user's balance column permanently.
**Fix:** Add `!amount.is_finite()` guard to both methods, returning `AppError::Validation`. Also add `!v.is_finite()` check to `get_balance` result to detect corrupted rows.

### Phase 4 — MEDIUM: Log Injection Prevention
**Files:** `rings/SILVER-RING-SN00/src/tech_support.rs`, `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Problem:** Attacker-controlled strings (user messages, webhook URLs, provider errors) are logged with `%` formatting without truncation. Long strings can corrupt structured logs; newlines can spoof severity levels.
**Fix:** Introduce `fn truncate_for_log(s: &str, max: usize) -> &str` in `GOLD-RING-TY00/src/lib.rs` and re-export. Apply to all user-controlled strings before logging (200 char cap for messages, 256 for URLs, 128 for error strings).

### Phase 5 — MEDIUM: AI Provider Response Size Caps
**Files:** `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`, `openai.rs`, `fal.rs`, `heygen.rs`, `hedra.rs`, `replicate.rs`, `midjourney.rs`, `kie.rs`
**Problem:** `resp.bytes()` and `resp.text()` allocate memory proportional to the response body with no upper bound.
**Fix:** Before calling `resp.bytes()`, check `resp.content_length()`. If it exceeds `MAX_RESPONSE_BYTES = 50 * 1024 * 1024` (50 MiB) or is `None`, abort with `AppError::Validation("response too large")`. For streaming endpoints, read chunks and fail on cumulative overflow.

### Phase 6 — LOW: Wire *_owned Methods
**Files:** `rings/BRONZE-RING-APP/src/main.rs` (`handle_generation_job`), `rings/BRONZE-RING-SRV/src/webhooks.rs`
**Problem:** `get_generation_owned` / `update_generation_status_owned` exist but have zero call sites.
**Fix:** Replace `get_generation(id)` with `get_generation_owned(id, telegram_id)` in `handle_generation_job`. In webhooks, the generation ID is trusted from the provider payload, so the unscoped version remains appropriate there.

### Phase 7 — LOW: Provider Startup Expect Removal
**Files:** `rings/SILVER-RING-AI00/src/providers/*.rs` (8 files)
**Problem:** `.expect("Failed to build reqwest client")` in provider constructors crashes the process on startup if the TLS stack is broken.
**Fix:** Change constructors to return `Result<Self, AppError>` and skip the provider in `build_orchestrator` rather than panicking.

---

## Verification Checklist

- [ ] `cargo check --target aarch64-apple-darwin` passes
- [ ] `cargo check` for workspace passes
- [ ] CRITICAL: bot dispatcher uses `spawn_traced` with exponential backoff
- [ ] HIGH: webhook idempotency table compiles in trait, impl, and mock
- [ ] HIGH: `deduct_balance` / `add_balance` reject `!is_finite()` amounts
- [ ] MEDIUM: log truncation helper exists and is used in tech_support + webhooks
- [ ] MEDIUM: AI providers check `content_length()` before `bytes()`
- [ ] LOW: `handle_generation_job` uses `get_generation_owned`
- [ ] LOW: provider constructors return `Result` instead of panicking

## Deferred to Wave 163

1. InMemStorage → Redis migration (requires Redis infra)
2. f64 → Money(i64) full DB column migration
3. AppConfig secrets → SecretString
4. Strict `url::Url` parsing for `validate_result_url`
5. `tracing::instrument` on ~50 Telegram scene handlers
6. NavigationRouter LRU eviction
7. Router startup panic on bad rate-limit config
