# Wave 188 Plan — Job Queue Fail-Closed Mapping & SSRF URL Validation

**Date:** 2026-06-16
**Target:** trios-mb Rust monorepo — SILVER-RING-JB00 (job queue), SILVER-RING-SN00 (Instagram parser)

---

## Research Findings

### Weakness 1: `row_to_job` fail-open on corrupted status strings (`queue.rs:55-62`)
Any corrupted or unexpected status string in the DB is silently mapped to `JobStatus::Queued`. A job that was actually `Completed` or `Failed` could be misrepresented as `Queued`, causing duplicate processing.

**Literature:** BullMQ uses `#[serde(other)]` → `Unknown` as an explicit catch-all. Azure IoT / Android JobQueue define `Unknown` status. PgQueuer uses terminal status logging. The consensus is that unrecognized enum values should NOT silently map to a state that causes re-execution.

### Weakness 2: `dequeue` does not guard `attempts < max_attempts` (`queue.rs:105-151`)
Jobs whose attempts already equal or exceed `max_attempts` can still be dequeued. Combined with the timeout path unconditionally re-queuing jobs, this creates a retry-budget bypass.

**Literature:** AuditBuffet Pattern `ab-002452` — unbounded retries are CWE-770 (Allocation of Resources Without Limits). Azure Queue Storage tracks dequeue count as the primary retry-budget mechanism. Laravel Issue #59517 — missing retry limit causes infinite silent loop.

### Weakness 3: Instagram parser weak URL validation (`instagram_parser.rs:35`)
Only a substring check `contains("instagram.com")` is used. Bypasses include `instagram.com.evil.com`, `evil.com/?x=instagram.com`, `instagram.com@evil.com`. The companion file `instagram_scraping.rs` already has strict `url::Url` parsing.

**Literature:** PortSwigger URL Validation Bypass Cheat Sheet (2024) — domain confusion attacks. OWASP SSRF Prevention — never rely on one-line string checks. ChatGPT-Next-Web real-world bypass with `trusted.com.attacker.tld`.

---

## Implementation

### Fix 1 — Fail-closed `row_to_job` status mapping
- Change `_ => JobStatus::Queued` to `_ => JobStatus::Failed`.
- Log a `tracing::warn!` with the unknown status string for ops visibility.
- Prevents duplicate processing of corrupted/terminal jobs.

### Fix 2 — `dequeue` attempts guard
- Add `AND attempts < max_attempts` to the `WHERE` clause of the dequeue query.
- Ensures exhausted jobs are never dequeued again.

### Fix 3 — Instagram parser strict URL validation
- Replace `contains("instagram.com")` with `url::Url` parse + exact host whitelist.
- Reject URLs with embedded credentials.
- Return a localized error on any validation failure.

---

## Verification Steps
1. `cargo check --package trios-mb-jobs --target aarch64-apple-darwin`
2. `cargo check --package trios-mb-scenes --target aarch64-apple-darwin`
3. `cargo check --package trios-mb-app --target aarch64-apple-darwin`

---

## Deferred
- `run_retry_maintenance` hardcoded 300s threshold shorter than long job timeouts — needs dynamic per-job-type threshold or DB schema change.
- `spawn_traced` consecutive_failures never reset on transient recovery.
- 400+ Telegram API calls without timeout wrapper — massive refactor, needs helper utility first.
- Webhook payload log truncation in `webhooks.rs`.
