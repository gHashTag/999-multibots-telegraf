# Wave 168 Security Hardening Report

**Date:** 2026-06-18  
**Scope:** trios-mb Rust monorepo — DB boundary input validation, username/PII length caps, refund amount guards, environment-config parsing hardening.

---

## Executive Summary

This wave closes a **medium-severity vulnerability chain** where unvalidated user-derived strings (Telegram username, voice/model identifiers) could be persisted to the database without length bounds. An attacker using a non-standard Telegram client could submit arbitrarily long usernames, causing storage bloat, log corruption, and potential DoS. The fixes add defensive caps at both the DB layer (chokepoint) and the handler layer (`start.rs`), re-validate refund amounts before crediting balances, and harden `AppConfig::from_env()` to fail fast on malformed `PORT` or admin/staff ID lists instead of silently swallowing errors.

---

## Literature Review

- **OWASP Injection Prevention Cheat Sheet (2024)** — ORMs reduce but do not eliminate injection risk; unbounded strings hitting the DB can cause DoS, log corruption, and driver-level buffer-overflow side effects. Length validation on string parameters is a recognized complementary control.
- **OWASP ASVS 5.3.4** — "Data selection or database queries must use parameterized queries OR be otherwise protected from database injection attacks." Length caps on persistence-bound strings are a Level-1 ASVS control.
- **CVE-2025-32013 (LNbits SSRF)** — Wallet-adjacent services accepting unvalidated external input (even benign-looking strings like usernames) can create SSRF chains when those values are later interpolated into URLs or API calls.
- **ERC-1271 Replay (curiousapple, Jan 2024)** — Lack of binding between identity and payload enables replay. Analogously, lack of binding between `telegram_id` and stored profile fields allows profile-cloning if write endpoints lack ownership or input checks.

---

## Findings & Fixes

### #1 — HIGH: `create_user` accepted unbounded `username`
- **Location:** `rings/SILVER-RING-DB00/src/repository.rs:173`
- **Root Cause:** `username` from Telegram was passed directly to SeaORM `ActiveModel` with no length validation. A non-standard client could send a megabyte-long username.
- **Fix:** Added `MAX_USERNAME_LEN = 32` module-level constant and validation guard in `create_user`. Returns `AppError::Validation` if exceeded.

### #2 — MEDIUM: `start.rs` forwarded raw Telegram username to DB
- **Location:** `rings/SILVER-RING-SN00/src/start.rs:24`
- **Root Cause:** `msg.from.username` was cloned and passed to `create_user` without trimming, capping, or character filtering.
- **Fix:** Added preprocessing before `create_user`: trim whitespace, cap to 32 chars, reject control characters and whitespace. Falls back to `None` if invalid.

### #3 — MEDIUM: `update_user_voice` lacked length cap
- **Location:** `rings/SILVER-RING-DB00/src/repository.rs:271`
- **Fix:** Added `MAX_VOICE_LEN = 128` guard.

### #4 — MEDIUM: `update_user_model` lacked length cap
- **Location:** `rings/SILVER-RING-DB00/src/repository.rs:289`
- **Fix:** Added `MAX_MODEL_LEN = 64` guard.

### #5 — MEDIUM: `save_prompt` `result_url` lacked length cap
- **Location:** `rings/SILVER-RING-DB00/src/repository.rs:534`
- **Root Cause:** `result_url` already capped at 4096 in webhook handlers, but the DB method itself had no defensive cap.
- **Fix:** Added `MAX_RESULT_URL_LEN = 4096` guard inside `save_prompt`.

### #6 — MEDIUM: `refund` trusted DB-stored amount without re-validation
- **Location:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs:156`
- **Root Cause:** Refund path assumed `tx.amount` was validated on creation. Legacy or manually inserted rows could violate this invariant.
- **Fix:** Added `tx.amount.is_finite() && tx.amount > 0.0` guard after loading the transaction, before any gateway or DB mutation.

### #7 — LOW: `AppConfig::from_env()` silently swallowed parse failures
- **Location:** `rings/GOLD-RING-TY00/src/config.rs:48`
- **Root Cause:** `PORT` parse failure defaulted to `3000`; invalid admin/staff IDs were silently dropped.
- **Fix:** Rewrote parsing to return `AppError::Config` with descriptive messages on invalid values, while still defaulting to empty/safe values when the variable is unset.

---

## Verification

```bash
$ cargo check --target $(rustc -vV | sed -n 's|host: ||p')
   Checking trios-mb-db v0.1.0
   Checking trios-mb-scenes v0.1.0
   Checking trios-mb-app v0.1.0
   Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.80s
```

All crates compiled successfully with zero warnings.

---

## Files Modified

| File | Change |
|------|--------|
| `rings/SILVER-RING-DB00/src/repository.rs` | Added `MAX_USERNAME_LEN`, `MAX_VOICE_LEN`, `MAX_MODEL_LEN`, `MAX_RESULT_URL_LEN` guards to `create_user`, `update_user_voice`, `update_user_model`, `save_prompt` |
| `rings/SILVER-RING-SN00/src/start.rs` | Added username trimming, length cap, control-char rejection before `create_user` |
| `rings/SILVER-RING-PY00/src/services/payment_processor.rs` | Added `is_finite()` + `> 0.0` guard in `refund` |
| `rings/GOLD-RING-TY00/src/config.rs` | Made `PORT`, `ADMIN_IDS`, `STAFF_IDS` parsing fail-fast with explicit errors |

---

## Three Cooperation Options for Next Wave

1. **Telegram API Timeout Wrappers** — Wrap `bot.send_message`, `bot.answer_callback_query`, and other outbound Telegram API calls in `tokio::time::timeout` within handlers that perform DB writes or financial operations. Prevents slow Telegram API from hanging the worker pool.
2. **Generation Pipeline Integrity** — Add HMAC-signed checksums to job payloads so workers can detect tampered requests, and implement per-user generation rate limits to prevent queue flooding and cost exhaustion.
3. **Secrets Management Upgrade** — Migrate remaining plaintext secrets (webhook env vars, gateway passwords) from `std::env::var` reads-on-each-request to a cached `SecretString` loader with TTL refresh, reducing exposure surface and improving startup-time secret validation.

---

*Wave 168 complete. All tasks implemented, compiled, and documented.*
