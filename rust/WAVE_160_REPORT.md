# Wave 160 Security Report

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Focus:** Financial injection guards, terminal-state protection, silent failure elimination, input validation, secret redaction, CORS hardening

---

## Executive Summary

Wave 160 closes one CRITICAL financial-injection vector and six HIGH-severity weaknesses involving silent data corruption, terminal-state overwrites, unbounded resource consumption, and secret leakage.

**CRITICAL fixes:**
1. `deduct_balance` negative-amount guard — prevents balance inflation exploit

**HIGH fixes:**
2. Webhook terminal-state guard — prevents replay/delayed webhooks from overwriting `Completed`/`Failed`/`Cancelled`
3. Transaction deserialization fail-closed — replaces `unwrap_or` on `serde_json::from_str`
4. `save_prompt` length cap — 2000 char limit
5. `get_user_by_telegram_id` language fail-closed — returns `Err` on unknown language code
6. `validate_result_url` length + credential guards — max 4096 bytes, rejects `@` and `%`
7. `AppConfig::Debug` redacts all credential-adjacent fields
8. `start.rs` distinguishes `Ok(None)` from `Err` on user lookup

---

## Phase 1 — CRITICAL: Financial Injection

### 1.1 `deduct_balance` Negative Amount Guard
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `deduct_balance` accepted any `f64` value. A negative amount (`-100.0`) would:
- Transform `UPDATE users SET balance = balance - (-100)` → `balance + 100` (inflation)
- The guard `balance >= -100` is always true (since balances are non-negative)
**Fix:** Added `if amount <= 0.0 { return Err(AppError::Validation(...)); }` at the top of `deduct_balance`, mirroring the `add_balance` guard from Wave 159.

---

## Phase 2 — HIGH: Silent Failures & Terminal State Guards

### 2.1 Webhook Terminal-State Guard
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
**Problem:** Replicate and Kie.ai webhook handlers unconditionally called `update_generation_status(generation_id, Completed/Failed, ...)`. A provider retry, replay, or delayed delivery could overwrite a `Cancelled` or `Failed` status back to `Completed`, violating user expectations.
**Fix:** Added `is_terminal_status()` helper and a guard in both `replicate_webhook` and `kie_ai_webhook` that loads the current generation row before updating. If the DB status is already `Completed`, `Failed`, or `Cancelled`, the webhook returns `200 OK` immediately with a logged info message, skipping the DB write.

### 2.2 Transaction Deserialization Fail-Closed
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `get_transaction` and `get_transaction_by_external_id` used `serde_json::from_str(&r.method).unwrap_or(PaymentMethod::TelegramStars)` and `unwrap_or(PaymentStatus::Pending)`. Corrupt JSON in the DB was silently normalized, identical to the `str_to_media_type` / `str_to_generation_status` bugs fixed in Wave 159.
**Fix:** Replaced `row.map(...)` with explicit `match row` that calls `serde_json::from_str(...).map_err(|e| AppError::Internal(format!("Corrupt payment {method|status} JSON: {}", e)))?`. Corrupt rows now surface as `Internal` errors instead of silent defaults.

### 2.3 `save_prompt` Length Cap
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `save_prompt` inserted verbatim text with no length limit. Malicious users could bloat the `prompts` table with multi-megabyte submissions.
**Fix:** Added `MAX_PROMPT_LEN = 2000` constant. Rejects prompts exceeding the cap with `AppError::Validation`.

### 2.4 `get_user_by_telegram_id` Language Fail-Closed
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `Language::from_code(&m.language).unwrap_or_default()` silently defaulted unknown language codes to Russian. A corrupt `language` column would be invisible.
**Fix:** Changed to `Language::from_code(...).ok_or_else(|| AppError::Db(...))?`. Returns an explicit error containing the offending code and `telegram_id`.

### 2.5 `validate_result_url` Hardening
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
**Problem:** Substring-based URL validation was bypassable via encoding tricks, credential embedding (`http://evil.com@127.0.0.1`), and punycode.
**Fix:** Added `MAX_URL_LEN = 4096` cap and rejection of URLs containing `@` (credential embedding) or `%` (percent-encoded bypasses). The existing substring checks for private IP ranges remain as defense-in-depth.

### 2.6 `AppConfig::Debug` Full Redaction
**File:** `rings/GOLD-RING-TY00/src/config.rs`
**Problem:** Wave 159 redacted `infisical_client_secret` and `database_url`, but left `infisical_client_id`, `admin_telegram_ids`, and `staff_telegram_ids` visible. Client IDs aid reconnaissance; staff IDs are PII.
**Fix:** Redacted all five fields to `"[REDACTED]"`.

---

## Phase 3 — LOW: Error Handling Improvement

### 3.1 `start.rs` Distinguish `Ok(None)` from `Err`
**File:** `rings/SILVER-RING-SN00/src/start.rs`
**Problem:** On any `get_user_by_telegram_id` error (including transient DB timeouts), the handler immediately retried `create_user`, which would fail with a unique-key violation if the user actually existed.
**Fix:** Separated the `Err(e)` branch: now logs the error at `error!` level and returns a localized message to the user instead of attempting creation.

---

## Deferred Items

1. **InMemStorage → Redis migration** — Commented in `dispatcher.rs`; requires Redis infra + schema migration.
2. **`tracing::instrument` on scene handlers** — Needs per-function `skip` lists because `dyn Database` / `dyn AiProviderOrchestrator` don't implement `Debug`. Deferred to a macro-based approach or `Debug` impls on traits.
3. **Generation ownership validation** — `get_generation` / `update_generation_status` still lack `telegram_id` scope.
4. **Strict URL parsing via `url` crate** — Current substring + heuristic approach is pragmatic but not robust against all bypasses.
5. **Differentiated rate-limit buckets** — All routes still share one `1 req/s, burst 60` config.
6. **Balance DB column migration** — `users.balance` and `Transaction.amount` remain `f64`.
7. **Webhook replay protection** — No idempotency key or HMAC over payload body.
8. **AppConfig secrets → `SecretString`** — Debug is redacted, but runtime fields are still `String`.

---

## Verification

- Full workspace `cargo check --target aarch64-apple-darwin` passes cleanly.
- `cargo check` for all workspace members passes.
- CRITICAL item verified: `deduct_balance` now rejects `amount <= 0`.
- HIGH items verified: webhook terminal-state guard loads generation before update; transaction deserialization propagates errors; prompt length capped; language unknown codes fail-closed.

---

## Cooperation Options for Wave 161

**Option A — Data Integrity & Ownership**
- Add `telegram_id`-scoped generation methods to close IDOR window
- Migrate `InMemStorage` to Redis-backed storage
- Implement strict `url::Url` parsing for result URL validation
- Add DB CHECK constraints for `balance >= 0`, `telegram_id > 0`

**Option B — Observability & Instrumentation**
- Add `#[tracing::instrument]` to all 84 Telegram scene handlers (with proper `skip` lists)
- Add Prometheus metrics for generation success/failure per provider
- Build health endpoint that probes actual provider reachability (not just env vars)
- Add structured security-event logging for every validation failure

**Option C — Anti-Abuse & Rate Limiting**
- Implement differentiated rate-limit buckets per route group
- Add webhook idempotency table with provider+event_id dedup
- Cap `save_prompt` rate per user (not just length)
- Migrate `AppConfig` secrets to `secrecy::SecretString`

---

*End of Wave 160 Report*
