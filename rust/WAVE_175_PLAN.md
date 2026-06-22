# Wave 175 Security Hardening Plan

**Date:** 2026-06-16

## Selected Fixes

### 1. Webhook Secrets Startup Loading (MEDIUM)
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `router.rs`

`verify_webhook_secret` reads `std::env::var` at request time. A missing secret causes per-request 500s and incurs env-var lookup overhead on every webhook.

**Fix:**
- Load all webhook secrets at router creation time into `AppState`.
- `verify_webhook_secret` receives a pre-loaded `&str` instead of an env-var name.
- Missing secrets at startup are a fatal error (panic) rather than a runtime 500.

### 2. SecretCache Per-Key TTL + Max Size (MEDIUM)
**File:** `rings/SILVER-RING-SC00/src/store.rs`

`SecretCache` has a single global freshness timestamp (5 minutes) but no per-key TTL or max capacity. If Infisical returns thousands of secrets, memory grows unbounded within the freshness window.

**Fix:**
- Replace `HashMap<String, String>` with `HashMap<String, (String, Instant)>` for per-key TTL.
- Add `MAX_SECRET_CACHE_ENTRIES` (default 1000).
- On insert, evict oldest entries by load timestamp if over capacity.
- On read, return `None` for entries older than the TTL.

### 3. get_transactions_by_telegram_id Cursor Pagination (MEDIUM)
**File:** `rings/SILVER-RING-DB00/src/repository.rs`

The method loads up to 10,000 deserialized `Transaction` structs into a `Vec`, creating OOM risk for users with massive histories.

**Fix:**
- Add `cursor: Option<Uuid>` parameter for keyset pagination.
- When `cursor` is `Some(id)`, add `AND id < $cursor` to the WHERE clause.
- Order by `id DESC` instead of `created_at DESC` for stable keyset ordering.
- Reduce default limit from 10,000 to 100 per page.
- Update trait definition and call sites.

---

## Verification

```bash
cargo check -p trios-mb-server -p trios-mb-secrets -p trios-mb-db --target aarch64-apple-darwin
```

---

## Cooperation Options for Next Wave

1. **Telegram API Timeout Blanket** — Apply `send_message_timeout` / `answer_callback_query_timeout` to all 250+ remaining call sites.
2. **InMemStorage Boundedness** — Add TTL eviction or migrate dialogue state to Redis-backed storage.
3. **Admin Identity De-hardcoding** — Already completed in Wave 174.
