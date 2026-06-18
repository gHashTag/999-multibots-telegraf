# Wave 168 Security Hardening Plan

**Date:** 2026-06-18  
**Focus:** DB boundary input validation, username/PII length caps, refund amount guards, environment-config parsing hardening.

## Literature Summary

- **OWASP Injection Prevention Cheat Sheet (2024)** — ORMs reduce but do not eliminate injection risk; unbounded strings hitting the DB can cause DoS, log corruption, and in some drivers, buffer-overflow side effects. Defense-in-depth requires caps at the persistence boundary.
- **OWASP ASVS 5.3.4** — "Data selection or database queries must use parameterized queries OR be otherwise protected from injection attacks." Length validation on string parameters is a recognized complementary control.
- **CVE-2025-32013 (LNbits SSRF)** — Wallet-adjacent services that accept unvalidated external input (even benign-looking strings like usernames) can create SSRF chains when those values are later interpolated into URLs or API calls.
- **ERC-1271 Replay (curiousapple, Jan 2024)** — Lack of binding between identity and signed payload enables replay. Analogously, lack of binding between user identity (telegram_id) and stored profile fields (username, model, voice) allows profile-cloning if write endpoints lack ownership checks.

## Findings

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | **High** | `create_user` accepts `username` without length or format validation; unbounded string hits DB and downstream logging. | `SILVER-RING-DB00/src/repository.rs:173` |
| 2 | **Medium** | `update_user_voice` accepts arbitrary `voice` string without length cap; could be used for DB DoS. | `SILVER-RING-DB00/src/repository.rs:271` |
| 3 | **Medium** | `update_user_model` accepts arbitrary `model` string without length cap; same risk. | `SILVER-RING-DB00/src/repository.rs:289` |
| 4 | **Medium** | `save_prompt` accepts `prompt` and `result_url` without length caps; dormant but callable. | `SILVER-RING-DB00/src/repository.rs:~360` |
| 5 | **Medium** | `start.rs` extracts Telegram `username` and forwards it directly to `create_user` without sanitization. | `SILVER-RING-SN00/src/start.rs:24` |
| 6 | **Medium** | `payment_processor.rs:refund` trusts `tx.amount` from DB without re-validating finiteness/positivity before re-crediting balance. | `SILVER-RING-PY00/src/services/payment_processor.rs:136` |
| 7 | **Low** | `AppConfig::from_env()` silently swallows parse errors for `PORT`, `ADMIN_IDS`, `STAFF_IDS` with `.ok().and_then(...)` instead of explicit error reporting. | `GOLD-RING-TY00/src/config.rs:48` |

## Tasks

### Task 1 — Username validation in `start.rs`
- Cap length to `MAX_USERNAME_LEN = 32` (Telegram limit).
- Strip leading/trailing whitespace.
- Reject usernames containing control characters or newlines.

### Task 2 — DB layer string-length caps
Add length guards at the top of:
- `create_user` — `username` cap
- `update_user_voice` — `voice` cap
- `update_user_model` — `model` cap
- `save_prompt` — `prompt` and `result_url` caps
Return `AppError::Validation` if exceeded.

### Task 3 — Refund amount re-validation
In `PaymentProcessor::refund`, after loading the transaction, validate `tx.amount.is_finite() && tx.amount > 0.0` before calling `gateway.refund` or `add_balance`. Fail fast with `AppError::Validation`.

### Task 4 — Config parsing fail-fast
In `AppConfig::from_env()`:
- `PORT`: return `AppError::Config` on parse failure instead of silently defaulting.
- `ADMIN_IDS` / `STAFF_IDS`: return `AppError::Config` if any token fails to parse instead of silently dropping invalid IDs.

---
*Plan version: 168.1*
