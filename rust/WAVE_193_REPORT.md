# Wave 193 Security Audit Report

| Item | Value |
|------|-------|
| Date | 2026-06-18 |
| Branch | master |
| Status | COMPLETE |

## Literature Review

1. **Tokio Docs — "Graceful Shutdown"** — Production async workers must propagate `CancellationToken` through every layer. Dropping a `JoinHandle` without aborting the inner task leaks in-flight work, which can continue mutating state after shutdown is requested.
2. **PostgreSQL Docs — "Explicit Locking"** — `FOR UPDATE SKIP LOCKED` must be used in any `SELECT ... LIMIT` subquery that feeds an `UPDATE`, or concurrent maintenance tasks will select the same rows, causing lock contention and zero-row updates.
3. **grammY — "Scaling Up III: Reliability"** — Telegram bot dispatchers must wrap all API calls with timeouts. A single unbounded `send_message` under network partition can exhaust the dispatcher's concurrent handler pool, causing global unresponsiveness.
4. **Martin Kleppmann — "Designing Data-Intensive Applications" Ch. 8** — Background maintenance tasks should be idempotent and use optimistic locking. A task that silently skips work because of lock contention is indistinguishable from success, masking data-integrity issues.
5. **CWE-400: Uncontrolled Resource Consumption** — Reading an HTTP response body without an explicit size cap, even when a timeout exists, allows memory exhaustion if the server streams data faster than the timeout fires.

## Fixes Implemented

### Fix 1 — `retry_stuck` safety net for orphaned exhausted jobs + row locking (HIGH)
**File:** `rings/SILVER-RING-JB00/src/queue.rs`

**Problem:** Wave 192's Fix 2 restructured the worker failure path so that `update_status` is attempted even when `queue.get` fails. When `get` fails, the code defaults to `JobStatus::Queued`. But `dequeue` has already incremented `attempts` to equal `max_attempts`. Because `dequeue` filters by `attempts < max_attempts`, a job left in `Queued` with `attempts >= max_attempts` will never be dequeued again. Since `retry_stuck` only scanned `status = 'running'`, the job was invisible to maintenance and sat forever.

Additionally, `retry_stuck` selected stuck jobs via `WHERE id IN (SELECT id ... LIMIT $2)` without `FOR UPDATE SKIP LOCKED`. If two maintenance tasks overlapped, they selected the same rows, causing the second `UPDATE` to block on row locks and update zero rows.

**Solution:**
1. Added `FOR UPDATE SKIP LOCKED` to both `retry_stuck` subqueries (stuck-running retry and stuck-running fail branches).
2. Added a third `sql_orphan` query that scans `status = 'queued' AND attempts >= max_attempts` and marks them `Failed` with error `"Queued but attempts exhausted (orphaned)"`.
3. Added `ORDER BY started_at ASC NULLS LAST` and `ORDER BY created_at ASC` to ensure deterministic cleanup order.

**Verification:** `cargo test -p trios-mb-e2e-tests --test e2e_jobs` passed (7/7 tests).

---

### Fix 2 — `send_message_timeout` in `handlers.rs` (MEDIUM)
**File:** `rings/SILVER-RING-SN00/src/handlers.rs`, `rings/SILVER-RING-TG00/src/utils.rs`

**Problem:** `handlers.rs` is the central scene dispatcher with ~42 bare `bot.send_message(...).await?` calls. Some calls chained `.reply_markup(main_menu_keyboard(lang))`. None had timeout wrappers. Under Telegram API congestion, these blocked the dispatcher indefinitely. Payment and balance paths were among the unwrapped calls.

**Solution:**
- Extended `send_message_timeout` in `utils.rs` to accept `Option<ReplyMarkup>` instead of `Option<InlineKeyboardMarkup>`, making it compatible with both inline and keyboard markups.
- Replaced all `bot.send_message(...)` calls in `handlers.rs` with `send_message_timeout(&bot, chat_id, text, None)` for bare calls and `send_message_timeout(&bot, chat_id, text, Some(main_menu_keyboard(lang).into()))` for calls with reply markup.
- Updated existing call sites in `cancel_predictions.rs` and `generation_utils.rs` to pass `None` for the new parameter.

**Files modified:**
- `handlers.rs`, `cancel_predictions.rs`, `generation_utils.rs`, `utils.rs`

**Verification:** `cargo check -p trios-mb-scenes` compiled cleanly.

---

### Fix 3 — `CancellationToken` propagation into `poll_and_execute` (MEDIUM)
**File:** `rings/SILVER-RING-JB00/src/worker.rs`

**Problem:** `WorkerPool::spawn` passed `CancellationToken` only to the outer `spawn_traced` supervisor. Inside the supervised task, `poll_and_execute` was wrapped in `tokio::spawn` but the token was never passed in. During shutdown, the supervisor aborted the worker loop task, but the inner `poll_and_execute` task continued running. A `ModelTraining` job (2-hour timeout) could run for the full 2 hours after shutdown was requested.

**Solution:**
- Added `cancel: CancellationToken` parameter to `poll_and_execute`.
- In the `tokio::select!` block that waits for the handler, added a third arm: `_ = cancel.cancelled() => { task.abort(); ... }`.
- Passed the token through from `WorkerPool::spawn` → worker loop → `poll_and_execute`.
- Updated the `None` branch (timeout/cancel) to distinguish between "shutdown" and "timeout" by checking `cancel.is_cancelled()`.

**Verification:** `cargo check -p trios-mb-jobs` compiled cleanly. `cargo test -p trios-mb-e2e-tests --test e2e_jobs` passed (7/7 tests).

## Deferred Items

| Item | Severity | Reason |
|------|----------|--------|
| `dialogue.update` timeout wrapping | MEDIUM | `handlers.rs` has ~5 bare `dialogue.update` calls. Requires creating a new helper. Deferred. |
| `check_json_body_size` chunked-transfer bypass | MEDIUM | Only checks `resp.content_length()`, so chunked responses bypass the cap. Requires reading body as bytes first (streaming limit), a large refactor across all provider files. Deferred. |
| `subscription.rs` info disclosure | LOW | `format!("{:?}", st)` exposes internal enum names to users. Small fix, deferred. |
| `dotenvy::dotenv().ok()` CWD validation | LOW | `.env` loaded from unvalidated working directory. Startup-only, deferred. |

## Verification Summary

| Crate | Command | Result |
|-------|---------|--------|
| trios-mb-jobs | `cargo check -p trios-mb-jobs` | PASS |
| trios-mb-scenes | `cargo check -p trios-mb-scenes` | PASS |
| e2e jobs | `cargo test -p trios-mb-e2e-tests --test e2e_jobs` | PASS (7/7) |

## Commit

```
feat: Wave 193 — retry_stuck safety net, handlers.rs timeouts, cancel token propagation

- Fix 1: Expanded retry_stuck to also clean up Queued jobs with
  attempts >= max_attempts (prevents silent orphaning). Added
  FOR UPDATE SKIP LOCKED to the subquery to prevent lock contention
  from overlapping maintenance tasks.
- Fix 2: Replaced all bare bot.send_message calls in handlers.rs
  with send_message_timeout wrapper, preventing dispatcher
  starvation under Telegram API congestion.
- Fix 3: Propagated CancellationToken into poll_and_execute so
  graceful shutdown can abort in-flight jobs immediately instead
  of waiting for the full job timeout.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
