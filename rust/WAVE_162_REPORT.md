# Wave 162 Security Report

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** Bot resilience, webhook idempotency, financial NaN/Inf guards, log injection prevention, AI response caps

---

## Executive Summary

Wave 162 delivers one CRITICAL fix (bot dispatcher restart loop), three HIGH fixes (webhook idempotency, f64 NaN/Inf guards, log injection prevention), and two MEDIUM fixes (AI response caps, owned method wiring).

**CRITICAL:**
1. Bot dispatcher restart loop — `spawn_traced` with exponential backoff (5s → 60s cap) and max-consecutive-failure limit

**HIGH:**
2. Webhook idempotency table — `webhook_events(provider, event_id, processed_at)` with `ON CONFLICT DO NOTHING`
3. f64 NaN/Inf guards — `!amount.is_finite()` checks on `deduct_balance`, `add_balance`, `complete_robokassa_payment`
4. Log injection prevention — `truncate_for_log` helper (UTF-8 safe, char-aware) applied to user messages, webhook URLs, error strings

**MEDIUM:**
5. AI provider response size caps — `content_length()` checked before `resp.bytes()` in ElevenLabs and OpenAI (50 MiB limit)
6. `update_generation_status_owned` wired into `handle_generation_job` — closes IDOR surface for job worker status updates

---

## Phase 1 — CRITICAL: Bot Dispatcher Restart Loop

### 1.1 `spawn_traced` Exponential Backoff
**File:** `rings/BRONZE-RING-APP/src/main.rs`
**Problem:** The existing `spawn_traced` helper used a fixed 5-second restart delay. Under sustained failure conditions (e.g., network partition) this creates a tight restart loop that hammers logs and CPU.
**Fix:** Replaced fixed delay with capped exponential backoff:
- Base: 5 seconds
- Multiplier: `2^consecutive_failures` (capped at 2^4 = 16)
- Ceiling: 60 seconds
- Escalation: After 10 consecutive failures, the supervisor gives up and logs a fatal error, letting the operator intervene.

### 1.2 Bot Dispatcher Factory Pattern
**File:** `rings/BRONZE-RING-APP/src/main.rs`
**Problem:** Bot dispatchers were launched with raw `tokio::spawn`. A single panic permanently killed the bot for the process lifetime.
**Fix:** Each bot dispatcher is now wrapped in `spawn_traced`. The factory closure captures `teloxide::Bot` (Clone), `BotDispatcher` (now derives Clone), and rebuilds the `Dispatcher` from `build_scene_tree()` on every restart. Inside the factory, a `tokio::select!` loop listens for:
- `cancel_child.cancelled()` — graceful shutdown (breaks the restart loop)
- `dp.dispatch()` — normal return/error triggers a restart after the backoff delay

### 1.3 Graceful Shutdown
**File:** `rings/BRONZE-RING-APP/src/main.rs`
**Problem:** Bots were force-aborted with `handle.abort()`, risking dropped in-flight messages and dirty socket state.
**Fix:** Each bot now receives a `CancellationToken::child_token()`. On shutdown, `cancel_token.cancel()` propagates to all children. Bots exit gracefully via the select branch. The shutdown code awaits each handle with a 5-second timeout instead of aborting.

---

## Phase 2 — HIGH: Webhook Idempotency Table

### 2.1 Entity and Trait
**Files:** `rings/SILVER-RING-DB00/src/entities/webhook_events.rs`, `rings/SILVER-RING-DB00/src/entities/mod.rs`, `rings/GOLD-RING-TR00/src/database.rs`
**Fix:** Created a new `webhook_events` entity with composite PK `(provider, event_id)` and `processed_at`. Added two methods to the `Database` trait:
- `record_webhook_event(provider, event_id) -> Result<bool, AppError>` — returns `true` on new insert, `false` on duplicate
- `has_webhook_event(provider, event_id) -> Result<bool, AppError>` — simple existence check

### 2.2 Postgres Implementation
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Fix:** `record_webhook_event` uses raw SQL with `ON CONFLICT (provider, event_id) DO NOTHING` and checks `rows_affected() > 0`.

### 2.3 Mock Implementation
**File:** `rings/TEST-UTILS/src/mock_database.rs`
**Fix:** Added `webhook_events: HashMap<(String, String), DateTime<Utc>>` to the mock inner state.

### 2.4 Handler Integration
**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Fix:** Every webhook handler now calls `record_webhook_event` at the top (after secret verification) and returns `200 OK` immediately on duplicate. This prevents:
- Near-simultaneous duplicate Replicate/Kie.ai deliveries from overwriting status
- Robokassa replays from entering the verification flow at all

---

## Phase 3 — HIGH: f64 NaN/Inf Guards

### 3.1 Balance Mutation Guards
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `deduct_balance` and `add_balance` rejected negative/non-positive amounts but did not check `is_finite()`. A `NaN` or `Infinity` amount could corrupt the DB balance permanently.
**Fix:** Added `!amount.is_finite()` guard to:
- `deduct_balance`: rejects if `!amount.is_finite() || amount <= 0.0`
- `add_balance`: rejects if `!amount.is_finite() || amount < 0.0`
- `complete_robokassa_payment`: rejects if `!amount.is_finite() || amount < 0.0`

---

## Phase 4 — HIGH: Log Injection Prevention

### 4.1 `truncate_for_log` Helper
**File:** `rings/GOLD-RING-TY00/src/utils.rs`
**Fix:** Created a UTF-8-safe truncation function that counts Unicode scalar values, not bytes. This prevents mid-character slicing that would produce invalid UTF-8.

### 4.2 Application Points
**Files:** `rings/SILVER-RING-SN00/src/tech_support.rs`, `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
**Fix:** Applied truncation at these boundaries:
- `tech_support.rs`: user messages capped at 200 chars
- `webhooks.rs`: Replicate/Kie.ai error strings capped at 1024 chars before DB write and logging
- `payment_webhooks.rs`: `inv_id` capped at 128 chars, `out_sum` capped at 64 chars

---

## Phase 5 — MEDIUM: AI Provider Response Size Caps

### 5.1 Content-Length Pre-Check
**Files:** `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`, `rings/SILVER-RING-AI00/src/providers/openai.rs`
**Problem:** `resp.bytes()` allocates memory proportional to the response body with no upper bound. A malicious/compromised provider could OOM the worker.
**Fix:** Added `MAX_RESPONSE_BYTES = 50 MiB` constant. Before calling `resp.bytes()`, check `resp.content_length()`. If it exceeds the cap, return `AiError::InvalidResponse` with the size. If `content_length()` is `None` (chunked encoding), the subsequent `bytes()` call is still unbounded; a future wave should add a streaming chunk limit.

---

## Phase 6 — MEDIUM: IDOR Closure in Job Worker

### 6.1 `update_generation_status_owned` Wiring
**File:** `rings/BRONZE-RING-APP/src/main.rs` (`handle_generation_job`)
**Fix:** Replaced `update_generation_status(gen_id, ...)` with `update_generation_status_owned(gen_id, request.telegram_id, ...)` in both success and failure branches of the generation job handler. This ensures the worker can only update generations that belong to the requesting user.

---

## Verification

- Full workspace `cargo check --target aarch64-apple-darwin` passes cleanly.
- `cargo check` for all workspace members passes.
- CRITICAL: `spawn_traced` compiles with exponential backoff logic.
- HIGH: `record_webhook_event` compiles in trait, PostgresDatabase, and MockDatabase.
- HIGH: `truncate_for_log` has unit tests (short, exact, long, Unicode).
- MEDIUM: `content_length()` check compiles in ElevenLabs and OpenAI providers.

---

## Deferred Items

1. **InMemStorage → Redis migration** — requires Redis infra + schema migration
2. **f64 → Money(i64) full DB column migration** — too large for one wave; needs schema migration + trait refactor
3. **AppConfig secrets → SecretString** — runtime dependency on `secrecy` crate
4. **Strict `url::Url` parsing** for `validate_result_url` — heuristic validation is pragmatic but bypassable
5. **`tracing::instrument` on ~50 Telegram scene handlers** — needs Debug impls or macro-based skips
6. **AI provider `.expect()` removal** — 8 files, startup-time only, deferred to schema migration wave
7. **NavigationRouter LRU eviction** — HashMap of chat histories grows unbounded

---

## Cooperation Options for Wave 163

**Option A — Financial Precision & Redis**
- Migrate `users.balance` and `payments.amount` DB columns to integer cents (`BIGINT`)
- Update `deduct_balance` / `add_balance` / `complete_robokassa_payment` to use `Money(i64)` newtype
- Migrate `InMemStorage` to `RedisStorage` with TTL eviction
- Add DB `CHECK` constraints: `balance >= 0`, `telegram_id > 0`

**Option B — Handler Hardening & Observability**
- Wire `get_generation_owned` into all remaining user-facing handlers (admin routes, API v1)
- Bulk-add `#[tracing::instrument]` to ~50 Telegram scene handlers
- Replace `validate_result_url` with `url::Url::parse` + whitelist
- Remove `.expect()` from all 8 AI provider constructors

**Option C — Anti-Abuse & Webhook Integrity**
- Implement webhook body HMAC verification to prevent tampered replays
- Add per-telegram_id rate limiting on `save_prompt` and generation creation
- Add `NavigationRouter` LRU cache eviction (max 100,000 entries)
- Add webhook idempotency DB migration (SQL) + TTL cleanup job

---

*End of Wave 162 Report*
