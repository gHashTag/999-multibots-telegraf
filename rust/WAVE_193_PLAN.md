# Wave 193 Security Plan

| Item | Value |
|------|-------|
| Date | 2026-06-18 |
| Branch | master |

## Literature Review

1. **Tokio Docs — "Graceful Shutdown"** — Production async workers must propagate `CancellationToken` through every layer. Dropping a `JoinHandle` without aborting the inner task leaks in-flight work, which can continue mutating state after shutdown is requested.
2. **PostgreSQL Docs — "Explicit Locking"** — `FOR UPDATE SKIP LOCKED` must be used in any `SELECT ... LIMIT` subquery that feeds an `UPDATE`, or concurrent maintenance tasks will select the same rows, causing lock contention and zero-row updates.
3. **grammY — "Scaling Up III: Reliability"** — Telegram bot dispatchers must wrap all API calls with timeouts. A single unbounded `send_message` under network partition can exhaust the dispatcher's concurrent handler pool, causing global unresponsiveness.
4. **Martin Kleppmann — "Designing Data-Intensive Applications" Ch. 8** — Background maintenance tasks should be idempotent and use optimistic locking. A task that silently skips work because of lock contention is indistinguishable from success, masking data-integrity issues.
5. **CWE-400: Uncontrolled Resource Consumption** — Reading an HTTP response body without an explicit size cap, even when a timeout exists, allows memory exhaustion if the server streams data faster than the timeout fires.

## Selected Fixes (exactly 3)

### Fix 1 — `retry_stuck` safety net for orphaned exhausted jobs + row locking (HIGH)
**File:** `rings/SILVER-RING-JB00/src/queue.rs`

**Problem:** Wave 192's Fix 2 restructured the worker failure path so that `update_status` is attempted even when `queue.get` fails. When `get` fails, the code defaults to `JobStatus::Queued`. But `dequeue` has already incremented `attempts` to equal `max_attempts`. Because `dequeue` filters by `attempts < max_attempts`, a job left in `Queued` with `attempts >= max_attempts` will never be dequeued again. Since `retry_stuck` only scans `status = 'running'`, the job is invisible to maintenance and sits forever.

Additionally, `retry_stuck` selects stuck jobs via `WHERE id IN (SELECT id ... LIMIT $2)` without `FOR UPDATE SKIP LOCKED`. If two maintenance tasks overlap (e.g., after a panic-restart), they select the same rows, causing the second `UPDATE` to block on row locks and update zero rows. This creates unnecessary lock contention.

**Approach:**
- Expand `retry_stuck` SQL to also scan `status = 'queued' AND attempts >= max_attempts` and mark them `Failed` with error `"exhausted attempts"`.
- Add `FOR UPDATE SKIP LOCKED` to the subquery, preventing concurrent maintenance tasks from selecting the same rows.
- Rename the error message to reflect both stuck-running and stuck-queued cleanup.

**SQL before:**
```sql
WHERE id IN (
    SELECT id FROM job_queue
    WHERE status = 'running' AND started_at < NOW() - INTERVAL '$1 seconds'
    ORDER BY started_at ASC
    LIMIT $2
)
```

**SQL after:**
```sql
WHERE id IN (
    SELECT id FROM job_queue
    WHERE (
        (status = 'running' AND started_at < NOW() - INTERVAL '$1 seconds')
        OR (status = 'queued' AND attempts >= max_attempts)
    )
    ORDER BY started_at ASC NULLS LAST
    LIMIT $2
    FOR UPDATE SKIP LOCKED
)
```

---

### Fix 2 — `send_message_timeout` in `handlers.rs` (MEDIUM)
**File:** `rings/SILVER-RING-SN00/src/handlers.rs`

**Problem:** `handlers.rs` is the central scene dispatcher. It contains ~45 bare `bot.send_message(chat_id, text).await?` calls without any timeout wrapper. Under Telegram API congestion or network partition, these calls hang indefinitely, blocking the handler and causing dispatcher-wide starvation. Payment and balance paths (the highest-risk flows) are among the unwrapped calls.

**Approach:**
- Replace `bot.send_message(chat_id, text).await?;` with `send_message_timeout(&bot, chat_id, text).await?;` in all occurrences within `handlers.rs`.
- Add `use trios_mb_tg::send_message_timeout;` to the imports.
- The `send_message_timeout` helper already exists in `trios_mb_tg::utils.rs` (30s `TELEGRAM_API_TIMEOUT`) and returns `Result<Message, std::io::Error>`, which auto-converts to `HandlerError` via `?`.

**Scope:** Only `handlers.rs` in this wave. Other files with bare calls are deferred.

---

### Fix 3 — `CancellationToken` propagation into `poll_and_execute` (MEDIUM)
**File:** `rings/SILVER-RING-JB00/src/worker.rs`

**Problem:** `WorkerPool::spawn` passes `CancellationToken` only to the outer `spawn_traced` supervisor. Inside the supervised task, `poll_and_execute` is wrapped in an additional `tokio::spawn` (line 243), but the token is never passed into it. During `worker_pool.shutdown()`, the supervisor aborts the worker loop task. When that task is dropped, the inner `JoinHandle` for `poll_and_execute` is dropped **without aborting** the inner task, so in-flight job handlers can continue running and updating the DB after shutdown is requested. `poll_and_execute` also has no internal cancellation checks, so a long-running handler can only be stopped by its fixed `timeout` (line 310), not by a graceful shutdown signal.

**Approach:**
- Add `cancel: CancellationToken` parameter to `poll_and_execute`.
- In the `tokio::select!` block that waits for the handler, add a third arm: `_ = cancel.cancelled() => { task.abort(); None }`.
- This allows graceful shutdown to abort in-flight jobs immediately instead of waiting for the full job timeout (up to 2 hours for ModelTraining).
- Pass the token through from `WorkerPool::spawn` → worker loop → `poll_and_execute`.

## Deferred Items

| Item | Severity | Reason |
|------|----------|--------|
| `dialogue.update` timeout wrapping | MEDIUM | `handlers.rs` also has ~5 bare `dialogue.update` calls. Requires creating a new helper. Deferred. |
| `check_json_body_size` chunked-transfer bypass | MEDIUM | `check_json_body_size` only checks `resp.content_length()`, so chunked responses bypass the cap. Fixing this requires reading body as bytes first (streaming limit), which is a large refactor across all provider files. Deferred. |
| `subscription.rs` info disclosure | LOW | `format!("{:?}", st)` exposes internal enum names to users. Small fix, deferred. |
| `dotenvy::dotenv().ok()` CWD validation | LOW | `.env` loaded from unvalidated working directory. Startup-only, deferred. |

## Verification Steps

1. `cargo check --target aarch64-apple-darwin -p trios-mb-jobs`
2. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes`
3. Run `cargo test -p trios-mb-jobs` to verify worker pool tests still pass

## Commit Message

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
