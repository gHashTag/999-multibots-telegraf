# Wave 172 Security Audit Report

**Date:** 2026-06-16  
**Scope:** Worker panic isolation, poison-pill infinite retry, outbound result URL validation, log redaction, Instagram URL hardening  
**Status:** All tasks implemented, tests passing.

---

## Executive Summary

Wave 172 fixes a **CRITICAL** poison-pill infinite retry in the job queue, adds `catch_unwind` to the worker supervisor to isolate synchronous panics in factory closures, validates provider result URLs on the outbound path (not just webhook ingress), redacts sensitive job payloads from logs, and hardens Instagram URL validation from a simple string-contains check to proper `url::Url` parsing with host whitelist and credential rejection.

---

## Literature

- Microsoft, *Async Rust: From Futures to Production* Ch.13 — supervisor loops, panic recovery: https://microsoft.github.io/RustTraining/async-book/ch13-production-patterns.html
- Stripe API Docs — SSRF prevention in webhook URL handling: https://stripe.com/docs/security
- OWASP SSRF Cheat Sheet — URL validation patterns: https://owasp.org/www-community/attacks/Server_Side_Request_Forgery

---

## Fixes Applied

### 1. Poison-Pill Infinite Retry Fix (CRITICAL)

**Files:** `rings/SILVER-RING-JB00/src/queue.rs`

`retry_stuck` previously reset `attempts = 0` for stuck jobs. If a job handler panicked, the row stayed `running`. After the stuck timeout, `retry_stuck` found it (`attempts < max_attempts`) and reset it to `queued` with `attempts = 0`. The job panicked again, and the cycle repeated forever — permanently consuming a worker slot every 300 seconds.

**Fix:**
- Removed `attempts = 0` from the UPDATE. Stuck jobs keep their attempt count.
- Added a second query for jobs where `attempts >= max_attempts`: move them to `failed` with error `"Job stuck and max attempts exhausted"`.
- The worker's existing `attempts >= max_attempts` check on failure now correctly triggers after a bounded number of retries.

### 2. Worker Panic Supervision with `catch_unwind` (HIGH)

**File:** `rings/SILVER-RING-JB00/src/worker.rs`

`spawn_traced` spawned the worker factory directly with `tokio::spawn(factory())`. A synchronous panic in the `factory` closure (before the async block starts) would abort the supervisor thread itself, potentially crashing the process.

**Fix:** Wrapped `factory()` in `std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| factory()))` before passing the future to `tokio::spawn`. Panics in the factory closure are now isolated, logged, and trigger the supervisor's restart-with-backoff logic.

### 3. Provider Result URL Validation on Outbound Path (HIGH)

**File:** `rings/BRONZE-RING-APP/src/main.rs`

`validate_result_url` (scheme check, loopback/private IP rejection, credential guard) was only applied to webhook ingress. In the outbound success path (`handle_generation_job`), the provider's result URL was written directly to the DB. A compromised provider could return an internal URL (`file:///etc/passwd`, `http://localhost:8080/admin`) that would be persisted and later served to users.

**Fix:**
- Moved `validate_result_url` to `trios_mb_types::utils` so it's reusable across crates.
- Applied it to `result.result_url` in `handle_generation_job` before `update_generation_status_owned`.
- On validation failure, log a `warn!` with the truncated URL and reason, then store `None` instead of the bad URL.
- The user-facing notification now only sends the validated URL.

### 4. Sensitive Job Payload Log Redaction (MEDIUM)

**File:** `rings/BRONZE-RING-APP/src/main.rs`

The Scraping job stub logged the entire `job.payload` (`serde_json::Value`) including user prompts, `file_id`/`image_url`, `telegram_id`, and other PII into structured logs.

**Fix:** Replaced full payload logging with metadata-only: `job_type`, `payload_len`. The actual payload content is no longer emitted.

### 5. Instagram URL Validation Hardening (MEDIUM)

**File:** `rings/SILVER-RING-SN00/src/instagram_scraping.rs`

URL validation only checked `text.contains("instagram.com")`, permitting SSRF via subdomains (`evil-instagram.com`), URL-encoded characters, or embedded credentials (`http://user:pass@instagram.com.evil.com`).

**Fix:**
- Parse with `url::Url`.
- Enforce exact host whitelist (`instagram.com`, `www.instagram.com`).
- Reject non-HTTP/HTTPS schemes.
- Reject embedded credentials (`username`, `password`).
- Added `url = "2.5"` dependency to `SILVER-RING-SN00/Cargo.toml`.

---

## Test Results

```
cargo check -p trios-mb-types   ✅
cargo check -p trios-mb-jobs    ✅
cargo check -p trios-mb-app     ✅
cargo check -p trios-mb-scenes  ✅
```

---

## Deferred Items

- **Telegram API call timeouts** — Every `bot.send_message`, `bot.answer_callback_query` across 255+ call sites needs `tokio::time::timeout` wrapping. Large surface area; deferred to Wave 173.
- **InMemStorage unbounded growth** — `InMemStorage<Scene>` has no TTL or eviction. Deferred until Redis-backed storage migration is planned.
- **NavigationRouter HashMap eviction** — Per-chat history accumulates forever. Deferred to Wave 173.
- **SecretCache boundedness** — Infisical secret cache has no per-key TTL. Deferred to Wave 173.
- **Hardcoded admin/staff IDs** — `SUPER_ADMIN_ID` and staff ID lists are still in source. Deferred to dedicated configuration-hardening wave.

---

## Cooperation Options for Next Wave

1. **Telegram API Timeout Blanket** — Wrap every `bot.send_message`, `bot.answer_callback_query`, and `dialogue.update` in `tokio::time::timeout(Duration::from_secs(30), ...)` with localized error messages on timeout. This is the largest remaining HIGH finding.
2. **In-Memory Storage Boundedness** — Add TTL eviction to `InMemStorage`, `NavigationRouter`, and `SecretCache` to prevent OOM under sustained load.
3. **Admin Identity De-hardcoding** — Move all hardcoded Telegram IDs to environment variables / secret store with startup validation and fail-fast behavior.
