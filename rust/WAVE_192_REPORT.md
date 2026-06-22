# Wave 192 Security Audit Report

| Item | Value |
|------|-------|
| Date | 2026-06-16 |
| Branch | master |
| Status | COMPLETE |

## Literature Review

1. **grammY — Scaling Up III: Reliability** — Telegram bot frameworks recommend wrapping all API calls with timeouts because `getUpdates` offset commits and `answerCallbackQuery` confirmations can hang indefinitely under network congestion, causing handler starvation.
2. **Microsoft — "Async Rust: From Futures to Production" Ch. 13** — Production worker loops must classify errors as transient vs. fatal; when a state-read fails after a handler error, the worker should still attempt to write a safe terminal state to prevent orphaned work items.
3. **Supabase — "Use SKIP LOCKED for Non-Blocking Queue Processing"** — Queue maintenance queries (`retry_stuck`) must use thresholds that exceed the worker's own abort timeout by a safety margin, or workers and maintenance tasks race to mark jobs.
4. **IETF draft — "Event and Webhook Delivery Semantics"** — Retry behavior should be idempotent; when internal state is ambiguous, defaulting to requeue is safer than leaving a job in an indeterminate `running` state.
5. **Sujeet Jaiswal — "Exactly-Once Delivery"** — Exactly-once is impossible at the transport layer; systems achieve exactly-once *processing* via at-least-once delivery + idempotency + safe fallback state transitions.

## Fixes Implemented

### Fix 1 — `answer_callback_query` timeout wrapper (MEDIUM)
**Scope:** 35 callback handler files in `rings/SILVER-RING-SN00/src/`

**Problem:** All scene callback handlers called `bot.answer_callback_query(&q.id).await?` without a timeout. Under Telegram API congestion or network partition, this blocked the handler indefinitely, leaving the user with a spinning inline keyboard.

**Solution:** Replaced the bare call with `answer_callback_query_timeout(&bot, &q.id).await?` in all 35 files. Added `use trios_mb_tg::answer_callback_query_timeout;` imports where missing. The helper already existed in `trios_mb_tg::utils.rs` and wraps the Telegram API call with `tokio::time::timeout(TELEGRAM_API_TIMEOUT)` (30s), logging a clear error on timeout without panicking.

**Files modified:**
- `ai_cover.rs`, `ai_photoshop.rs`, `ai_reels.rs`, `avatar_brain.rs`, `avatar_transform.rs`, `chat_with_avatar.rs`, `digital_avatar_body.rs`, `face_swap.rs`, `fal_render.rs`, `flux_kontext.rs`, `handlers.rs`, `hedra_render.rs`, `heygen_render.rs`, `image_to_prompt.rs`, `image_to_video.rs`, `image_upscaler.rs`, `improve_prompt.rs`, `lip_sync.rs`, `morphing.rs`, `music_generation.rs`, `neuro_photo.rs`, `payment.rs`, `remove_bg.rs`, `select_model.rs`, `size.rs`, `subscription.rs`, `text_to_image.rs`, `text_to_speech.rs`, `text_to_video.rs`, `train_flux_model.rs`, `video_duration.rs`, `video_transcription.rs`, `voice_avatar.rs`, `voice_training.rs`

**Verification:** `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` compiled cleanly.

---

### Fix 2 — Worker failure-path orphaned job recovery (MEDIUM)
**File:** `rings/SILVER-RING-JB00/src/worker.rs`

**Problem:** In the `Some(Ok(Err(e)))` branch (handler returned an error), the worker first called `queue.get(job_id)` to inspect the attempt count. If `get` failed or timed out, the entire block skipped `queue.update_status`, leaving the job in `running` state. For short jobs (600s timeout), `retry_stuck` would not rescue them for up to 2 hours.

**Solution:** Restructured the match so that `queue.update_status` is attempted **regardless of whether `queue.get` succeeds**.
- When `get` returns `Ok(Ok(Some(j)))`, the existing attempt-count logic decides `Failed` vs `Queued`.
- When `get` returns `Ok(Ok(None))`, `Ok(Err(e))`, or times out, the worker defaults to `JobStatus::Queued` with a warning log, ensuring the job is not orphaned.

**Verification:** `cargo check --target aarch64-apple-darwin -p trios-mb-jobs` compiled cleanly.

---

### Fix 3 — `retry_stuck` threshold margin (MEDIUM)
**File:** `rings/SILVER-RING-JB00/src/worker.rs`

**Problem:** `retry_stuck` was called with a hardcoded `7200` second threshold — exactly equal to `JobType::ModelTraining.timeout_secs()`. With zero margin, a `ModelTraining` job running at its timeout boundary could be flagged as stuck by the maintenance loop before the worker's own abort timer fires, causing the job to be requeued and executed twice.

**Solution:**
- Introduced `const STUCK_JOB_MARGIN_SECS: u64 = 300` (5 minutes).
- Computed the threshold dynamically as `max(JobType::timeout_secs()) + STUCK_JOB_MARGIN_SECS`.
- The value is now `7200 + 300 = 7500` seconds. If future job types receive longer timeouts, the threshold adjusts automatically.

**Verification:** `cargo check --target aarch64-apple-darwin -p trios-mb-jobs` compiled cleanly.

## Deferred Items

| Item | Severity | Reason |
|------|----------|--------|
| Per-job-type `retry_stuck` thresholds | LOW | Short jobs stay stuck for up to 7500s. Requires a more complex SQL query; deferred. |
| 236 `bot.send_message` + 96 `dialogue.update` timeout wrapping | LOW | Large surface area; will be addressed incrementally in future waves. |

## Verification Summary

| Crate | Command | Result |
|-------|---------|--------|
| trios-mb-scenes | `cargo check -p trios-mb-scenes` | PASS |
| trios-mb-jobs | `cargo check -p trios-mb-jobs` | PASS |

## Commit

```
feat: Wave 192 — callback answer timeouts, worker orphaned-job fix, retry margin

- Fix 1: Replaced bare bot.answer_callback_query with
  answer_callback_query_timeout helper in all 35 callback handlers.
- Fix 2: Restructured worker failure path so queue.update_status is
  attempted even when queue.get fails, preventing orphaned jobs.
- Fix 3: Added 300s margin to retry_stuck threshold, computing it
  dynamically from max(JobType::timeout_secs()) to prevent race
  with worker abort timers.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
