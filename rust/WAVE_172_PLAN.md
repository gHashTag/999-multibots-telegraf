# Wave 172 Security Hardening Plan

**Date:** 2026-06-16

## Selected Fixes (CRITICAL → HIGH → MEDIUM)

### 1. Poison-Pill Infinite Retry Fix (CRITICAL)
**Files:** `rings/SILVER-RING-JB00/src/queue.rs`, `worker.rs`

`retry_stuck` resets `attempts = 0` for stuck jobs. A permanently failing job (e.g., panic handler) enters an infinite loop: panic → stuck → retry with `attempts=0` → panic again. The job never reaches `max_attempts` and permanently consumes a worker slot every 300 seconds.

**Fix:**
- Increment `attempts` instead of resetting to 0.
- When `attempts >= max_attempts`, move job to `failed` status instead of `queued`.
- In the worker, catch panics in the job handler so the job transitions to `failed` rather than leaving the row in `running`.

### 2. Provider Result URL Validation on Outbound Path (HIGH)
**File:** `rings/BRONZE-RING-APP/src/main.rs`

`validate_result_url` (scheme check, loopback/private IP rejection, credential guard) is only applied to webhook ingress. In the outbound success path (`handle_generation_job`), the provider's result URL is written directly to the DB without validation. A compromised provider could return an internal URL that later gets served to users.

**Fix:** Apply `validate_result_url` to the `result_url` before calling `update_generation_status_owned` in the outbound path. Log a security event and set `result_url = None` if validation fails.

### 3. Worker Panic Supervision with `catch_unwind` (HIGH)
**File:** `rings/SILVER-RING-JB00/src/worker.rs`

The `spawn_traced` wrapper spawns the worker factory directly with `tokio::spawn(factory())`. A synchronous panic in the factory aborts the supervisor task itself, potentially crashing the process instead of just restarting the worker.

**Fix:** Wrap `factory()` in `std::panic::AssertUnwindSafe(factory()).catch_unwind()` so panics are isolated to the inner task and the supervisor can log and restart.

### 4. Sensitive Job Payload Log Redaction (MEDIUM)
**File:** `rings/BRONZE-RING-APP/src/main.rs`

The scraping job stub handler logs the entire `job.payload` (user prompts, `file_id`/`image_url`, `telegram_id`, PII) into structured logs.

**Fix:** Replace full payload logging with metadata-only logging (job type, payload length, `telegram_id`).

### 5. Instagram URL Validation Hardening (MEDIUM)
**File:** `rings/SILVER-RING-SN00/src/instagram_scraping.rs`

URL validation only checks `contains("instagram.com")`, permitting SSRF via subdomains, URL-encoded characters, or embedded private IPs.

**Fix:** Parse with `url::Url`, enforce exact host whitelist (`instagram.com`, `www.instagram.com`), reject private IPs, loopback, and embedded credentials.

---

## Literature

- Microsoft, *Async Rust: From Futures to Production* Ch.13 — supervisor loops, panic recovery: https://microsoft.github.io/RustTraining/async-book/ch13-production-patterns.html
- Stripe API Docs — SSRF prevention in webhook URL handling: https://stripe.com/docs/security
- OWASP SSRF Cheat Sheet — URL validation patterns: https://owasp.org/www-community/attacks/Server_Side_Request_Forgery

---

## Verification

```bash
cargo check -p trios-mb-jobs
cargo check -p trios-mb-app
cargo check -p trios-mb-scenes
```

---

## Cooperation Options for Next Wave

1. **Deep Defence** — Address remaining MEDIUM findings: InMemStorage TTL, NavigationRouter eviction, SecretCache boundedness, Infisical token expiry parsing.
2. **Observability First** — Add Prometheus metrics for every new defence mechanism; build dashboards.
3. **Penetration Simulation** — Write a load-test / chaos binary to validate defences under realistic failure modes.
