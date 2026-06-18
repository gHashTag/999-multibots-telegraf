# Wave 187 Plan — Job Queue Resilience & Race Condition Hardening

**Date:** 2026-06-16
**Target:** trios-mb Rust monorepo — SILVER-RING-JB00 (job queue + worker)

---

## Research Findings

### Weakness 1: `retry_stuck` SQL parameter truncation (`queue.rs:255, 286`)
`older_than_secs` is `u64`. It is bound with `Value::Int(Some(older_than_secs as i32))`. A value > `i32::MAX` silently wraps to a negative number. PostgreSQL interprets a negative interval as `NOW() + positive_time`, matching **all** running jobs and causing mass incorrect stuck detection / duplicate re-queueing.

**Literature:** CVE-2024-32655 (Npgsql `WriteBind` int32 overflow → SQL injection), Kestra Issue #15073 (JDBC `Integer.class` overflow → infinite re-execution). Pattern: integer truncation in database parameter binding is a well-known source of logic corruption.

### Weakness 2: No panic isolation around job handler execution (`worker.rs:293`)
`poll_and_execute` directly awaits `handler(job)` inside a `tokio::time::timeout`. If the handler panics (e.g., provider response deserialization panic, unexpected unwrap), the panic propagates out of the spawned worker loop, aborting the task. The job row stays `running` with no cleanup. The outer `spawn_traced` restarts the worker, but the job is stuck until `retry_stuck` finds it after 300s.

**Literature:** Tokio docs recommend `spawn`-and-inspect pattern over `catch_unwind` on futures. Rust community consensus: async state machines are not `UnwindSafe`; delegate panic isolation to the scheduler via `JoinHandle` inspection.

### Weakness 3: Non-atomic `update_status` enables blind overwrites (`queue.rs:173-203`)
The `UPDATE` statement has no status guard (`WHERE id = $3`). If two workers process the same job (due to `retry_stuck` re-queueing while the first worker is still running), the later `update_status` blindly overwrites the earlier one, potentially hiding a failure or success.

**Literature:** Netdata / DB Pro Blog / StackOverflow all document the `UPDATE WHERE status = expected` CAS pattern as the standard defense against duplicate execution in PostgreSQL-backed job queues.

---

## Implementation

### Fix 1 — `retry_stuck` integer binding
- Change `Value::Int(Some(older_than_secs as i32))` → `Value::BigInt(Some(older_than_secs.min(i64::MAX as u64) as i64))` in both SQL bindings.
- Clamp `older_than_secs` to `i64::MAX` before casting to prevent any future overflow.

### Fix 2 — Panic isolation in `poll_and_execute`
- Replace direct `tokio::time::timeout(timeout, handler(job)).await` with `tokio::spawn(handler(job))` + `tokio::select!` (JoinHandle vs sleep).
- On timeout: abort the spawned task, preserving existing timeout semantics.
- On panic: catch via `JoinError`, log, mark job as `Failed`, and continue (worker survives).
- On success / error: same behavior as before.

### Fix 3 — Atomic status guard on `update_status`
- Add `AND status = 'running'` to the `UPDATE WHERE id = $3` clause in `update_status`.
- This ensures a status update only succeeds if the job is still in `running` state, preventing blind overwrites from duplicate workers.
- Rewrite `cancel` to use its own SQL with `AND status IN ('running', 'queued')`, because a queued job may also be cancelled.

---

## Verification Steps
1. `cargo check --package trios-mb-jobs --target aarch64-apple-darwin`
2. `cargo check --package trios-mb-app --target aarch64-apple-darwin`
3. Review updated match arms for correct nesting.

---

## Deferred
- Hardcoded `retry_stuck(300)` threshold shorter than long job timeouts (ModelTraining 7200s) — requires dynamic threshold per job type or per-job timeout field.
- `row_to_job` unknown-status fail-open (`_ => JobStatus::Queued`) — should be `Failed` for unknown strings.
- 400+ Telegram API calls without timeout wrapper — massive refactor, needs helper utility first.
