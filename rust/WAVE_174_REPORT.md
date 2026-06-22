# Wave 174 Security Audit Report

**Date:** 2026-06-16  
**Scope:** De-hardcode admin IDs, tech support log redaction, email validation, rate-limit fail-closed  
**Status:** All tasks implemented, tests passing.

---

## Executive Summary

Wave 174 eliminates hardcoded Telegram admin/staff IDs from source code, redacts user message content from tech support logs, hardens email validation from a naive `@`+`.` check to RFC-like rules, and changes the rate-limit layer from fail-open to fail-closed (panic on misconfiguration).

---

## Literature

- OWASP API Security Top 10 2023 — Security Misconfiguration: https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- NIST SP 800-53 Rev. 5 — AC-3 Access Enforcement: https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final
- RFC 5322 — Internet Message Format (email address grammar)

---

## Fixes Applied

### 1. De-hardcode Admin/Staff Telegram IDs (HIGH)

**File:** `rings/SILVER-RING-TG00/src/access.rs`

`SUPER_ADMIN_ID` (i64), `HAIM_GROUP_STAFF_IDS`, and `METAMUSE_STAFF_IDS` were hardcoded literals in source. This leaks internal identities and allows trivial recompilation bypass.

**Fix:**
- Replaced constants with `std::sync::LazyLock`-backed env-var reads.
- `SUPER_ADMIN_ID` is loaded from `SUPER_ADMIN_ID` env var. If missing or non-numeric, the module **panics** at first access with a clear fatal message.
- Staff lists are loaded from comma-separated env vars (`HAIM_GROUP_STAFF_IDS`, `METAMUSE_STAFF_IDS`). If unset, they default to empty Vecs.
- Updated tests to set env vars before accessing the statics.

**Migration note:** Operators must now set `SUPER_ADMIN_ID` at startup. The previously hardcoded value (144022504) must be explicitly configured.

### 2. Tech Support Log Content Redaction (MEDIUM)

**File:** `rings/SILVER-RING-SN00/src/tech_support.rs`

The handler logged `message = %truncate_for_log(&user_message, 200)`, leaking up to 200 chars of user text into structured logs. User messages may contain PII, passwords, or sensitive issue descriptions.

**Fix:** Replaced content logging with metadata-only logging: `message_len = user_message.len()`. The actual text is never emitted.

### 3. Email Validation Hardening (MEDIUM)

**File:** `rings/SILVER-RING-SN00/src/email.rs`

Email validation only checked `contains('@') && contains('.')`, accepting malformed addresses like `a@b`, `@example.com`, `user@.com`, `..@..`.

**Fix:** Implemented `validate_email` with RFC 5322-like checks without adding a regex dependency:
- Overall length ≤ 254
- Exactly one `@`
- Local part non-empty and ≤ 64
- Domain contains at least one dot
- No leading/trailing dots in local or domain
- No consecutive dots anywhere
- Domain labels between dots are non-empty

Added unit tests for valid and invalid addresses.

### 4. Rate-Limit Layer Fail-Closed (MEDIUM)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

If `GovernorConfigBuilder::finish()` returned `None` (e.g., zero rates), `apply_rate_limit` logged an error and returned the router **without** any rate limiting. This is a silent security bypass.

**Fix:** Changed `apply_rate_limit` to `panic!` with a clear fatal message. A misconfigured rate limit now aborts startup, forcing operators to fix the configuration rather than running unprotected.

---

## Test Results

```
cargo check -p trios-mb-tg     ✅
cargo check -p trios-mb-scenes ✅
cargo check -p trios-mb-server ✅
```

---

## Deferred Items

- **InMemStorage boundedness** — `InMemStorage<Scene>` still grows unbounded. Redis migration or eviction deferred.
- **SecretCache boundedness** — Infisical secret cache has no per-key TTL. Deferred.
- **Webhook secrets startup loading** — `verify_webhook_secret` reads `std::env::var` at request time. Deferred.
- **Telegram API timeout blanket** — 250+ remaining call sites still use bare `.await`. Helpers exist from Wave 173.

---

## Cooperation Options for Next Wave

1. **InMemStorage Boundedness** — Add TTL eviction or migrate dialogue state to Redis-backed storage.
2. **SecretCache Boundedness** — Add per-key TTL and max-capacity eviction to the Infisical secret cache.
3. **Webhook Secrets Startup Loading** — Load all webhook secrets at process startup, fail fast if missing, and reference pre-loaded values in handlers instead of per-request env lookups.
