# Wave 191 Security Plan

| Item | Value |
|------|-------|
| Date | 2026-06-16 |
| Branch | master |

## Literature Review

1. **OWASP Webhook Security Guidelines Cheat Sheet** — Mandates constant-time HMAC comparison, body size limits (100 KB–1 MB), and atomic idempotency tables before downstream side effects.
2. **Svix Blog, "Securely Verifying Signature Hashes"** — Non-constant-time string comparison allows byte-by-byte brute-forcing across millions of webhook requests.
3. **StepCodex, "Telegram delivery reliability: polling stalls"** — Documents production Telegram Bot API polling stalls and proposes a stateful delivery outbox with failure classification and runtime recovery.
4. **tokio-rs/tracing Issue #3453 / docs** — `#[instrument]` on `async fn` adds `Instrumented` adapter frames; production code should use `skip_all` with lightweight `fields(...)` to avoid stack bloat.
5. **Microsoft, "Async Rust: From Futures to Production" Ch.13** — Bounded `mpsc` channels and `tokio::sync::Semaphore` are core backpressure primitives; unbounded growth under burst load is a primary failure mode.

## Selected Fixes (exactly 3)

### Fix 1 — Provider success-path response body caps (HIGH)
**Files:** `rings/SILVER-RING-AI00/src/providers/{fal,heygen,hedra,kie,openai,elevenlabs,replicate}.rs`

**Problem:** All 8 AI providers read successful HTTP responses via `.json()` / `.json::<T>()` without first checking `resp.content_length()` against a cap. A compromised or misconfigured provider could stream a multi-gigabyte payload and cause an out-of-memory crash. Error bodies are already capped (64 KB); only the success path is unprotected.

**Approach:**
- Define `const MAX_PROVIDER_JSON_BYTES: u64 = 64_000_000` (64 MB) in `rings/SILVER-RING-AI00/src/lib.rs`.
- Add a helper `check_content_length(resp: &Response, max: u64) -> Result<(), AppError>`.
- Before every `.json()` call on a successful response, call the helper.
- On `content_length() > max`, return `AppError::Ai(AiError::Provider { ... })` with a clear message.

### Fix 2 — Silent DB error elimination in webhook handlers (HIGH)
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

**Problem:** `replicate_webhook` and `kie_ai_webhook` both have success and failure paths that use `let _ = state.db.update_generation_status(...).await`. If the DB is temporarily unavailable, the webhook event is not persisted. Because the idempotency table was already written earlier in the same handler, a retry from the provider will be deduplicated and skipped, permanently leaving the generation in an inconsistent state.

**Approach:**
- Replace all 4 `let _ = state.db.update_generation_status(...)` patterns with explicit `if let Err(e) = ...` blocks.
- Log at `error!` level with the webhook ID and generation ID.
- Return HTTP 503 (or 500) on DB failure so the provider will retry. The idempotency check must happen **after** the DB update succeeds, or the idempotency record must be rolled back on DB failure.
- Reorder: verify signature → parse payload → update generation status → record idempotency → return 200 OK.

### Fix 3 — Balance deduction state-validation guards (HIGH)
**Files:** `rings/SILVER-RING-SN00/src/{ai_cover.rs,voice_training.rs,ai_reels.rs,music_generation.rs}`

**Problem:** Four callback handlers (`ac:confirm`, `vt:confirm`, `ar:generate`, `mg:generate`) call `deduct_balance` before validating that the required state field is present:
- `ai_cover.rs` — deducts without checking `state.audio_url`.
- `voice_training.rs` — deducts without checking `state.audio_url`.
- `ai_reels.rs` — deducts without checking `state.prompt`.
- `music_generation.rs` — deducts without checking `state.prompt`.

If the user triggers the confirm callback without completing the prerequisite step (e.g., due to a stale inline keyboard or session timeout), balance is deducted but no generation job is created. The user loses money for no work.

**Approach:**
- Before each `deduct_balance` call in the callback handlers, add an explicit guard:
  ```rust
  let required = match state.required_field.as_ref() {
      Some(v) if !v.is_empty() => v,
      _ => {
          bot.send_message(chat_id, "❌ Please complete the previous step first.").await?;
          return Ok(());
      }
  };
  ```
- This follows the same pattern already applied to `morphing.rs` and `train_flux_model.rs` in earlier waves.

## Deferred Items

- **Worker `queue.update_status` silent drops** (MEDIUM, 4 sites in `worker.rs`) — Will be addressed in a dedicated worker-hardening wave.
- **Telegram API timeout wrapping** (MEDIUM/HIGH, hundreds of call sites) — Requires a helper-function refactor across ~50 files; too large for one wave.
- **`format!` SQL placeholder assembly** (LOW, 1 site in `queue.rs`) — Safe today but fragile; will be refactored when queue module is next touched.
- **`generate_signature` f64 guard** (LOW, `robokassa.rs:31`) — Function is only called with pre-validated amounts; boundary guard is defensive only.

## Verification Steps

1. `cargo check --target aarch64-apple-darwin -p trios-mb-ai`
2. `cargo check --target aarch64-apple-darwin -p trios-mb-server`
3. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes`
4. Review each edited file for compilation errors and logic correctness.

## Commit Message

```
feat: Wave 191 — provider body caps, webhook DB error handling, balance guards

- Fix 1: Add 64 MB content-length cap before .json() on all 8 AI providers.
- Fix 2: Eliminate silent DB errors in replicate/kie webhooks; return 503
  on failure and reorder idempotency after DB success.
- Fix 3: Add state-field validation before deduct_balance in 4 callback
  handlers to prevent financial loss from stale callbacks.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
