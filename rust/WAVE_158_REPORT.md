# Wave 158 Security Report

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo (`999-multibots-telegraf/rust`)
**Focus:** Atomic balance deduction, webhook hardening, worker resilience, rate limiting, URL validation

---

## Executive Summary

Wave 158 closes four distinct vulnerability classes:
1. **TOCTOU race in balance operations** — eliminated by removing `check_balance` + `deduct_balance` pairs and making deduction atomic.
2. **Missing webhook authentication** — added `X-Webhook-Secret` header verification with constant-time comparison for Replicate and Kie.ai webhooks.
3. **Unbounded queue-worker I/O hangs** — all `JobQueue` operations wrapped in `tokio::time::timeout(30s)`.
4. **Unauthenticated endpoint abuse & SSRF via malicious result URLs** — added per-IP rate limiting (`tower_governor`) and webhook URL validation.

---

## Phase 1 — Atomic Balance Deduction (Race Condition Fix)

**Problem:** 14 generation handlers called `check_balance(cost)` followed by `deduct_balance(cost)`. The gap between check and deduct creates a TOCTOU race: concurrent requests can pass the check, then all deduct simultaneously, causing negative balances or over-commit.

**Fix:**
- Removed `check_balance` function and all its call sites from `generation_utils.rs`.
- Changed `deduct_balance` to return `Result<f64, String>`:
  - `Ok(remaining_balance)` on success
  - `Err(user_facing_message)` on insufficient funds or DB error
- The DB implementation in `SILVER-RING-DB00/src/repository.rs` already uses an atomic `UPDATE users SET balance = balance - $1 WHERE telegram_id = $2 AND balance >= $1`.
- Reordered state mutations in all 14 handlers to happen **after** successful deduction.

**Files touched:**
- `rings/SILVER-RING-SN00/src/generation_utils.rs`
- `rings/SILVER-RING-SN00/src/face_swap.rs`
- `rings/SILVER-RING-SN00/src/voice_training.rs`
- `rings/SILVER-RING-SN00/src/ai_reels.rs`
- `rings/SILVER-RING-SN00/src/hedra_render.rs`
- `rings/SILVER-RING-SN00/src/remove_bg.rs`
- `rings/SILVER-RING-SN00/src/avatar_transform.rs`
- `rings/SILVER-RING-SN00/src/music_generation.rs`
- `rings/SILVER-RING-SN00/src/fal_render.rs`
- `rings/SILVER-RING-SN00/src/train_flux_model.rs`
- `rings/SILVER-RING-SN00/src/ai_cover.rs`
- `rings/SILVER-RING-SN00/src/text_to_speech.rs`
- `rings/SILVER-RING-SN00/src/ai_photoshop.rs`
- `rings/SILVER-RING-SN00/src/heygen_render.rs`

---

## Phase 2 — Webhook Secret Verification

**Problem:** Replicate and Kie.ai webhook endpoints accepted any JSON payload. An attacker could forge completion/failure notifications and pollute generation statuses or result URLs.

**Fix:**
- Added `verify_webhook_secret(headers, env_var)` helper in `webhooks.rs`.
- Reads `X-Webhook-Secret` header and compares with `REPLICATE_WEBHOOK_SECRET` / `KIE_WEBHOOK_SECRET` env vars.
- Uses constant-time byte-wise XOR comparison to prevent timing attacks.
- Length mismatch is rejected before the constant-time loop to avoid leaking timing via short-circuit.

**Files touched:**
- `rings/BRONZE-RING-SRV/src/webhooks.rs`

---

## Phase 3 — Worker Queue Timeouts

**Problem:** `JobQueue` I/O in `worker.rs` had no timeout. A stuck DB connection or deadlock would hang the worker loop indefinitely, blocking all job processing.

**Fix:**
- Introduced `QUEUE_IO_TIMEOUT = Duration::from_secs(30)` constant.
- Wrapped `queue.dequeue()`, `queue.update_status()`, `queue.get()`, and `queue.retry_stuck()` in `tokio::time::timeout(...)`.
- On timeout, logs at `tracing::error!` level and `continue`s the loop so the worker survives transient stalls.

**Files touched:**
- `rings/SILVER-RING-JB00/src/worker.rs`

---

## Phase 4 — Per-IP Rate Limiting

**Problem:** Public webhook and health endpoints had no rate limiting, making them trivial DoS vectors.

**Fix:**
- Added `tower_governor = "0.4"` to workspace and `BRONZE-RING-SRV` dependencies.
- Added `rate_limit_layer(per_second, burst_size)` builder in `router.rs`.
- Applied to both `create_router` and `create_router_with_payments`:
  - `per_second: 1`, `burst_size: 60` → sustained 1 req/s, burst up to 60.
- Layer ordering: `CORS` → `Governor` → `DefaultBodyLimit` → `with_state`.

**Files touched:**
- `rust/Cargo.toml`
- `rings/BRONZE-RING-SRV/Cargo.toml`
- `rings/BRONZE-RING-SRV/src/router.rs`

---

## Phase 5 — Webhook Result URL Validation

**Problem:** Replicate and Kie.ai webhook payloads could contain arbitrary URLs. Storing a malicious URL (e.g., `file://`, `http://localhost:8080/internal`, `http://169.254.169.254/`) could lead to SSRF when the URL is later fetched or passed to downstream systems.

**Fix:**
- Added `validate_result_url(url: &str) -> Result<(), String>` in `webhooks.rs`.
- Enforces:
  - Non-empty URL
  - Scheme must be `http://` or `https://`
  - Rejects private / internal / loopback address patterns (string match on lowercase):
    - `127.*`, `10.*`, `192.168.*`, `0.0.0.0`, `::1`, `localhost`, `169.254.*` (link-local), `172.16.*`–`172.31.*` (private B range)
    - Non-HTTP schemes: `file://`, `ftp://`, `ssh://`, `telnet://`, `gopher://`
- On validation failure, logs at `tracing::warn!` and skips DB update.

**Files touched:**
- `rings/BRONZE-RING-SRV/src/webhooks.rs`

---

## Verification

- Full workspace `cargo check --target aarch64-apple-darwin` passes cleanly.
- All 14 generation handler call sites updated to new `deduct_balance` signature.
- Webhook handlers now require `X-Webhook-Secret` header.
- Worker loop survives queue I/O stalls via timeout + `continue`.
- Rate-limit layer applies to all routes uniformly.
- URL validation rejects internal / non-HTTP schemes before DB storage.

---

## Deferred Items

1. **Strict URL parsing via `url` crate** — Current validation uses substring matching; replace with actual `url::Url` parse + IP range checks for robustness.
2. **Distributed rate limiting** — `tower_governor` is in-memory only; for multi-instance deployments, add Redis-backed sliding-window rate limiter.
3. **Webhook replay protection** — Add idempotency key or HMAC over payload body (not just secret header) to prevent replay attacks.
4. **Rate-limit differentiated buckets** — Apply stricter limits to `/api/webhooks/*` (e.g., 10/min) vs `/health` (e.g., 120/min).
5. **Balance DB column migration** — The current `f64` balance column should be migrated to integer-based `Money` type (see Wave 150 patterns).

---

## Cooperation Options for Wave 159

**Option A — Deep Webhook Security**
- Implement HMAC-SHA256 payload signature verification (not just static secret header)
- Add webhook replay protection with idempotency keys / nonce window
- Add webhook event logging table for audit trail

**Option B — Worker Reliability & Observability**
- Add DLQ (dead-letter queue) for jobs that fail max retries
- Add worker heartbeat / health endpoint with queue depth metrics
- Implement exponential backoff for retry with jitter

**Option C — API Abuse Hardening**
- Add API-key or JWT authentication middleware to protect non-webhook routes
- Implement stricter per-user rate limits in addition to per-IP
- Add request fingerprinting / anomaly detection for suspicious patterns

---

*End of Wave 158 Report*
