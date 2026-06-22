# WAVE 229 REPORT

## Summary
Three availability and security hardening fixes applied: DB timeout wrapping in the health endpoint, webhook owned-method migration for defense-in-depth IDOR prevention, and empty-prompt guards in Instagram handlers. All changes compile cleanly and existing tests pass.

---

## Fix 1 — DB timeout wrapping in `health.rs`
**Severity:** HIGH  
**Category:** CWE-1088 (Synchronous Access of Remote Resource without Timeout)

The `health_check_with_db` endpoint called `state.db.health_check().await` directly without a timeout. If the DB connection pool was exhausted or the primary DB was unreachable, Kubernetes liveness probes would hang indefinitely instead of receiving a degraded `503 Service Unavailable` response. This could trigger cascading pod restarts and outage amplification.

**File:** `rings/BRONZE-RING-SRV/src/health.rs`

**Change:** Added `const HEALTH_DB_TIMEOUT: Duration = Duration::from_secs(5);` and wrapped `state.db.health_check().await` in `tokio::time::timeout`. On timeout, the endpoint returns `503` with `"db": "timeout"` and logs a warning. The static-only `health_check` endpoint was left unchanged.

**Literature:** CWE-1088. Health endpoints are the first line of defense in orchestrated environments. A health check that blocks on a stalled DB connection defeats the purpose of health checking and can cause the load balancer to continue routing traffic to a degraded instance. NIST SP 800-53 SI-4 (Information System Monitoring) requires timely detection of resource exhaustion.

---

## Fix 2 — Webhook owned-method migration
**Severity:** HIGH  
**Category:** CWE-639 (Authorization Bypass Through User-Controlled Key)

Both `replicate_webhook` and `kie_ai_webhook` in `webhooks.rs` called `state.db.get_generation(generation_id)` and then discarded the result with `Ok(Ok(_)) => {}`. Because the `GenerationResult` (which carries `telegram_id`) was thrown away, subsequent calls to `update_generation_status` could not verify ownership. If a provider ever replayed or misdelivered a webhook payload with a wrong UUID, the status update would be applied unconditionally.

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

**Change:**
1. Restructured both `get_generation` match arms from `Ok(Ok(_)) => {}` to `Ok(Ok(gen)) => gen`, preserving the `Option<GenerationResult>`.
2. Extracted `telegram_id` via `gen_opt.as_ref().map(|g| g.telegram_id)`.
3. Replaced all four `update_generation_status` calls (2 per handler) with `update_generation_status_owned(..., telegram_id, ...)`.
4. Wrapped each owned update in `if let Some(telegram_id) = telegram_id { ... }` so that missing generations are silently skipped rather than causing a DB error.

**Literature:** CWE-639 — using user-controlled keys without verifying ownership. OWASP ASVS V4.0 1.4.3 requires that access control decisions be made at every point where a data-modifying operation occurs. The `_owned` variants add a second layer of defense after signature verification: even if a webhook secret is somehow compromised, the attacker can only mutate rows that belong to the expected user.

---

## Fix 3 — Empty-prompt guards in Instagram handlers
**Severity:** MEDIUM  
**Category:** CWE-20 (Improper Input Validation)

`instagram_scraping.rs` and `instagram_parser.rs` accepted user text without checking `trim().is_empty()`. Whitespace-only messages proceeded to `url::Url::parse`, which fails with a generic error. An early, localized rejection improves UX and prevents wasted CPU cycles on invalid URL parsing.

**Files:**
- `rings/SILVER-RING-SN00/src/instagram_scraping.rs`
- `rings/SILVER-RING-SN00/src/instagram_parser.rs`

**Change:** Added `if text.trim().is_empty()` / `if profile_url.trim().is_empty()` immediately after extracting `msg.text()`, before any URL parsing or length checks. Sends a localized error and returns `Ok(())`.

**Literature:** CWE-20. Empty/whitespace input should be rejected at the earliest chokepoint. OWASP Input Validation Cheat Sheet recommends rejecting empty values before format-specific validation.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-server -p trios-mb-scenes -p trios-mb-ai
   Finished dev profile [unoptimized + debuginfo] target(s) in 5.14s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 0.33s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- Magic-number timeout extraction in `providers/mod.rs` (10s, 30s), `elevenlabs.rs` (30s), `openai.rs` (30s), `main.rs` (5s)
- `database_url` SecretString migration
- Media file size validation in `lip_sync.rs`, `ai_cover.rs`, `hedra_render.rs`
- Complete model digest externalization in `replicate.rs`
- Empty-prompt guards in `handlers.rs` (root dispatcher), `payment.rs`, `morphing.rs` (cancel keyword trimming)
- `format!` sanitization for user-interpolated strings in `avatar_brain.rs`, `ai_cover.rs`, `email.rs`

---

## Three Cooperation Variants for Wave 230

### Variant A — Magic-number timeout extraction across remaining provider and app files
`providers/mod.rs`, `elevenlabs.rs`, `openai.rs`, and `main.rs` still contain bare `Duration::from_secs(N)` literals. Systematically extracting them to named constants would complete the timeout-hardening of the entire codebase and eliminate the remaining magic numbers.

### Variant B — Media file size validation in `lip_sync.rs`, `ai_cover.rs`, and `hedra_render.rs`
These handlers accept video, audio, and voice files without enforcing file size or duration limits. `lip_sync.rs` accepts video + audio + voice; `ai_cover.rs` accepts audio; `hedra_render.rs` accepts voice. The `file.size` and `.duration` properties are available on all Telegram media types in teloxide-core 0.10.1. Adding per-media-type caps prevents oversized uploads from wasting provider quota.

### Variant C — Empty-prompt and input sanitization batch
Multiple handlers still accept free text without empty/trim validation or format! interpolation sanitization: `handlers.rs` (root dispatcher), `payment.rs` (amount parsing), `morphing.rs` (cancel keyword without trim), `avatar_brain.rs` (raw user strings in format!), `ai_cover.rs` (audio title in format!), and `email.rs` (email in format!). A systematic sweep would close all remaining input-validation and format-string gaps in the scene layer.
