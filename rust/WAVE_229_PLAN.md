# WAVE 229 PLAN

## Research Summary

### Literature Reviewed
- **CWE-1088**: Synchronous Access of Remote Resource without Timeout — health endpoints must return degraded status on DB stall, not hang indefinitely.
- **CWE-639**: Authorization Bypass Through User-Controlled Key — webhook handlers calling non-owned DB methods risk cross-user data mutation.
- **CWE-20**: Improper Input Validation — empty/whitespace text reaching URL parsers causes wasted provider calls and user confusion.
- **OWASP ASVS V4.0**: 1.4.3 — Access Control Architecture; 5.1.4 — Input Validation.

### Key Findings from Reconnaissance
1. `health.rs:25` — `state.db.health_check().await` is unbounded. If the DB connection pool is exhausted, the Kubernetes liveness probe hangs instead of receiving `503 Service Unavailable`.
2. `webhooks.rs` — Both `replicate_webhook` and `kie_ai_webhook` match on `Ok(Ok(_)) => {}`, discarding the `GenerationResult` that carries `telegram_id`. This prevents migrating to `update_generation_status_owned`, which would enforce that the webhook payload only mutates rows belonging to the authenticated user.
3. `instagram_scraping.rs:24-32` and `instagram_parser.rs:25-32` — User text is accepted without `trim().is_empty()` guard. Whitespace-only messages proceed to `url::Url::parse`, which fails with a confusing error instead of an early, localized rejection.

---

## Decomposed Implementation Plan

### Fix 1 — DB timeout wrapping in `health.rs`
**File:** `rings/BRONZE-RING-SRV/src/health.rs`  
**Severity:** HIGH  
**CWE:** CWE-1088

Add `const HEALTH_DB_TIMEOUT: Duration = Duration::from_secs(5);` and wrap `state.db.health_check().await` in `tokio::time::timeout`. On timeout, return `503 Service Unavailable` with `"db": "timeout"` instead of hanging.

**Steps:**
1. Import `std::time::Duration` and `tokio::time::timeout` at top of file.
2. Add `const HEALTH_DB_TIMEOUT: Duration = Duration::from_secs(5);`.
3. Wrap the `state.db.health_check().await` call in `tokio::time::timeout(HEALTH_DB_TIMEOUT, ...)`, matching the 4-way pattern (Ok(Ok), Ok(Err), Err(timeout)).
4. On timeout branch, log `tracing::warn!` and return degraded status.

### Fix 2 — Webhook owned-method migration
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`  
**Severity:** HIGH  
**CWE:** CWE-639

Restructure the `get_generation` match arms in both `replicate_webhook` and `kie_ai_webhook` to BIND `gen` instead of discarding it with `Ok(Ok(_)) => {}`. Extract `gen.telegram_id` and pass it to `update_generation_status_owned` in all four `update_generation_status` call sites.

**Steps:**
1. Replace `Ok(Ok(_)) => {}` with `Ok(Ok(gen)) => gen` in both handlers.
2. Add `let telegram_id = gen_opt.as_ref().map(|g| g.telegram_id);` after the match.
3. Replace all `state.db.update_generation_status(` calls with `state.db.update_generation_status_owned(..., telegram_id, ...)`.
4. Wrap each `update_generation_status_owned` call in `if let Some(telegram_id) = telegram_id { ... }` to preserve the guard.
5. Update imports: add `GenerationResult` to the existing `GenerationStatus` import.

### Fix 3 — Empty-prompt guards in Instagram handlers
**Files:** `rings/SILVER-RING-SN00/src/instagram_scraping.rs`, `instagram_parser.rs`  
**Severity:** MEDIUM  
**CWE:** CWE-20

Add `if text.trim().is_empty()` guard immediately after extracting `msg.text()`, before any URL parsing. Send a localized error and return `Ok(())`.

**Steps:**
1. In `instagram_scraping.rs`, after `let text = match msg.text() { Some(t) => t, None => ... }`, add empty/trim check.
2. In `instagram_parser.rs`, same pattern.
3. Reuse existing localization pattern (`lang.is_russian()` / `else` English).

---

## Verification Checklist
- [ ] `cargo check -p trios-mb-server` passes
- [ ] `cargo check -p trios-mb-scenes` passes
- [ ] `cargo test -p trios-mb-ai` passes (5/5)
- [ ] Health endpoint returns `503` on simulated DB timeout
- [ ] Webhook handlers compile with `_owned` calls
- [ ] Instagram handlers reject whitespace-only input with localized message
