# Wave 174 Security Hardening Plan

**Date:** 2026-06-16

## Selected Fixes

### 1. De-hardcode Admin/Staff Telegram IDs (HIGH)
**File:** `rings/SILVER-RING-TG00/src/access.rs`

`SUPER_ADMIN_ID`, `HAIM_GROUP_STAFF_IDS`, and `METAMUSE_STAFF_IDS` are hardcoded in source, leaking internal identities and enabling trivial recompilation bypass.

**Fix:** Move to env vars loaded via `std::sync::LazyLock`. `SUPER_ADMIN_ID` is mandatory — if unset, the module panics at first access. Staff ID lists are comma-separated env vars. Update tests to set env vars.

### 2. Tech Support Log Content Redaction (MEDIUM)
**File:** `rings/SILVER-RING-SN00/src/tech_support.rs`

The handler logs the truncated user message content (`truncate_for_log(&user_message, 200)`). Even truncated, user content leaks into structured logs and may contain PII, passwords, or sensitive issue descriptions.

**Fix:** Replace message-content logging with metadata-only logging: `message_len`, `telegram_id`. Never log user text content.

### 3. Email Validation Hardening (MEDIUM)
**File:** `rings/SILVER-RING-SN00/src/email.rs`

Email validation only checks `contains('@') && contains('.')`, allowing malformed addresses like `a@b`, `@example.com`, `user@.com`.

**Fix:** Use a proper regex for RFC 5322-like validation (one `@`, non-empty local part, domain with at least one dot, no leading/trailing dots). No new crate dependency needed.

### 4. Rate-Limit Layer Fail-Closed (MEDIUM)
**File:** `rings/BRONZE-RING-SRV/src/router.rs`

If `rate_limit_layer` returns `None` (invalid config), `apply_rate_limit` logs an error and returns the router **without** rate limiting. This is a fail-open behavior that silently disables protection.

**Fix:** Change `apply_rate_limit` to panic at startup with a clear message when the rate-limit layer cannot be built. A misconfigured rate limit should be a fatal startup error, not a silent bypass.

---

## Verification

```bash
cargo check -p trios-mb-tg -p trios-mb-scenes -p trios-mb-server --target aarch64-apple-darwin
```

---

## Cooperation Options for Next Wave

1. **InMemStorage Boundedness** — Add TTL eviction or migrate to Redis-backed storage.
2. **SecretCache Boundedness** — Add per-key TTL and max-capacity eviction to Infisical secret cache.
3. **Webhook Secrets Startup Loading** — Load webhook secrets at startup instead of per-request `std::env::var`.
