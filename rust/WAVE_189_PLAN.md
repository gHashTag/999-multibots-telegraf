# Wave 189 Plan — Stuck-Job Threshold, Supervisor Resilience, Webhook Log Truncation

**Date:** 2026-06-16
**Target:** trios-mb Rust monorepo — SILVER-RING-JB00 (job queue), BRONZE-RING-SRV (webhooks)

---

## Research Findings

### Weakness 1: `run_retry_maintenance` hardcoded 300s threshold shorter than all job timeouts (`worker.rs:383`)
All job-type timeouts exceed the `retry_stuck` threshold:
- ModelTraining: 7200s
- VideoRendering: 3600s
- LipSyncRendering: 1800s
- Others: 600s

A healthy `ModelTraining` job running for 1-2 hours is incorrectly flagged as stuck, re-queued (wasting work), and eventually permanently failed after `max_attempts` exhausted.

**Literature:** BullMQ StalledChecker uses per-job `lock_duration`. JobGuard/BunQueue/Milvaion use heartbeats or per-job timeout overrides. The stuck threshold must be >= the max job timeout to prevent false positives.

### Weakness 2: `spawn_traced` consecutive_failures never resets (`worker.rs:19-99`)
The `consecutive_failures` counter is incremented on every panic but never decremented or reset. After 10 total panics (even if spread across days), the supervisor permanently gives up, silently reducing worker pool capacity.

**Literature:** Akka `maxNrOfRetries` + `withinTimeRange`, Erlang OTP `intensity` + `period`, Dagster Sensor Guard sliding window. All major supervisors use count-within-time-window, not a monotonic counter.

### Weakness 3: Attacker-controlled webhook fields logged without truncation (`webhooks.rs`, `payment_webhooks.rs`)
Multiple log lines emit raw attacker-controlled strings (webhook payload IDs, task IDs, result URLs, inv IDs) without `truncate_for_log`. Within the 2 MiB body limit, an attacker can inject multi-megabyte strings into log streams, causing log bloat and potential downstream ingestion failures.

**Literature:** CWE-117 (Improper Output Neutralization for Logs). OWASP Logging Cheat Sheet recommends truncating/escaping untrusted data before emission.

---

## Implementation

### Fix 1 — Raise `retry_stuck` threshold to max job timeout
- Change `queue.retry_stuck(300)` to `queue.retry_stuck(7200)`.
- Add comment referencing `JobType::timeout_secs()` and explaining the threshold must cover the longest legitimate job.

### Fix 2 — Add time-decay reset to `spawn_traced`
- Track `last_failure: Option<Instant>` alongside `consecutive_failures`.
- Before incrementing on a new panic, check if `duration_since(last_failure) >= 300s`. If so, reset `consecutive_failures = 0`.
- This follows the Erlang/Akka pattern: failures outside a time window are treated as independent incidents, not a consecutive streak.

### Fix 3 — Truncate attacker-controlled webhook log fields
- `webhooks.rs:89` — `parse_uuid` warning: `input = %truncate_for_log(s, 256)`.
- `webhooks.rs:183` — Replicate URL rejection: `url = %truncate_for_log(url, 256)`.
- `webhooks.rs:256` — Kie.ai webhook received: `task_id = %truncate_for_log(..., 256)`.
- `webhooks.rs:314` — Kie.ai URL rejection: `url = %truncate_for_log(&url, 256)`.
- `payment_webhooks.rs` — `inv_id` / `external_id` in span fields and log lines: wrap with `truncate_for_log(..., 128)`.

---

## Verification Steps
1. `cargo check --package trios-mb-jobs --target aarch64-apple-darwin`
2. `cargo check --package trios-mb-server --target aarch64-apple-darwin`
3. `cargo check --package trios-mb-app --target aarch64-apple-darwin`

---

## Deferred
- Per-job-type dynamic `retry_stuck` threshold (DB schema change: add `timeout_secs` column to job_queue).
- Heartbeat mechanism for long-running jobs (BullMQ/JobGuard pattern).
- Telegram API timeout wrappers for 400+ calls in scene handlers.
