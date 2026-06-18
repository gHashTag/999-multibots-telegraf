# Wave 192 Security Plan

| Item | Value |
|------|-------|
| Date | 2026-06-16 |
| Branch | master |

## Literature Review

1. **grammY — Scaling Up III: Reliability** — Concurrent runners can prematurely confirm `getUpdates` offsets; recovering from a hard kill requires `update_id`-based deduplication to prevent losing or re-processing up to ~100 updates.
2. **Microsoft — "Async Rust: From Futures to Production" Ch. 13** — Production worker loops should use bounded channels as explicit memory contracts, classify errors as transient vs. fatal, and combine `CancellationToken` with `tokio::select!` for graceful shutdown.
3. **Supabase — "Use SKIP LOCKED for Non-Blocking Queue Processing"** — `FOR UPDATE SKIP LOCKED` is the correct Postgres primitive for non-blocking concurrent job claiming in Rust async workers, preventing duplicate execution.
4. **IETF draft — "Event and Webhook Delivery Semantics"** — Standardizes retry behavior, idempotency identifiers, and failure classification (transient vs. terminal) without claiming end-to-end exactly-once guarantees.
5. **Sujeet Jaiswal — "Exactly-Once Delivery"** — Exactly-once is mathematically impossible at the transport layer; industry achieves exactly-once *processing* via at-least-once delivery + idempotency keys + transactional outboxes.

## Selected Fixes (exactly 3)

### Fix 1 — `answer_callback_query` timeout wrapper (MEDIUM)
**Files:** 34 callback handler files in `rings/SILVER-RING-SN00/src/`

**Problem:** All 34 callback handlers call `bot.answer_callback_query(&q.id).await?` without a timeout. Under Telegram API congestion or network partition, this can hang indefinitely, blocking the handler and leaving the inline keyboard in a "loading" state for the user.

**Approach:**
- Replace `bot.answer_callback_query(&q.id).await?;` with `answer_callback_query_timeout(&bot, &q.id).await?;` in all 34 files.
- Add `use trios_mb_tg::answer_callback_query_timeout;` to each file that doesn't already have it.
- The helper already exists in `trios_mb_tg::utils.rs` and wraps the call with `tokio::time::timeout(TELEGRAM_API_TIMEOUT)`.

### Fix 2 — Worker failure-path orphaned job recovery (MEDIUM)
**File:** `rings/SILVER-RING-JB00/src/worker.rs`

**Problem:** In the `Some(Ok(Err(e)))` branch (handler returned an error), the worker first calls `queue.get(job_id)` to check the attempt count. If `get` fails or times out, the worker skips `queue.update_status` entirely, leaving the job in `running` state until `retry_stuck` recovers it — up to 2 hours for short jobs.

**Approach:**
- Restructure the failure path so that `queue.update_status` is attempted **even when `queue.get` fails**.
- When `get` succeeds, use the existing attempt-count logic to decide `Failed` vs `Queued`.
- When `get` fails, default to `JobStatus::Queued` (with a warning log) so the job is not orphaned.

### Fix 3 — `retry_stuck` threshold margin (MEDIUM)
**File:** `rings/SILVER-RING-JB00/src/worker.rs`

**Problem:** `retry_stuck` is called with a hardcoded `7200` second threshold — exactly equal to `JobType::ModelTraining.timeout_secs()`. This provides zero margin for clock skew or timer resolution jitter. A job running at exactly its timeout boundary could be flagged as stuck by `retry_stuck` before the worker's abort timer fires, causing duplicate execution.

**Approach:**
- Compute the threshold dynamically as `max(JobType::timeout_secs()) + STUCK_JOB_MARGIN_SECS` where `STUCK_JOB_MARGIN_SECS = 300`.
- This gives a 5-minute safety margin, preventing the race between `retry_stuck` and worker abort timers.
- The value remains hardcoded in the sense that it's derived from the `JobType` enum, but it's now automatically correct if timeouts change.

## Deferred Items

- **Per-job-type `retry_stuck` thresholds** — A global threshold means short jobs (ImageRendering = 600s) orphaned by a dead worker stay stuck for up to 2 hours. Fixing this requires a more complex SQL query with per-type `started_at` conditions. Deferred.
- **336 `bot.send_message` / `dialogue.update` timeout wrapping** — 236 `send_message` + 96 `dialogue.update` calls still lack timeout wrapping. Too large for one wave; will be addressed incrementally.
- **`generate_signature` f64 guard** (`robokassa.rs:31`) — Defensive-only; the function is only called with pre-validated amounts. Deferred.

## Verification Steps

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes`
2. `cargo check --target aarch64-apple-darwin -p trios-mb-job-queue`
3. Review each edited callback handler for compilation errors.

## Commit Message

```
feat: Wave 192 — callback answer timeouts, worker orphaned-job fix, retry margin

- Fix 1: Replaced bare bot.answer_callback_query with
  answer_callback_query_timeout helper in all 34 callback handlers.
- Fix 2: Restructured worker failure path so queue.update_status is
  attempted even when queue.get fails, preventing orphaned jobs.
- Fix 3: Added 300s margin to retry_stuck threshold, computing it
  dynamically from max(JobType::timeout_secs()) to prevent race
  with worker abort timers.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
