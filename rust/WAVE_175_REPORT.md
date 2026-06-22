# Wave 175 Security Report

Date: 2026-06-16
Status: COMPLETE

## 1. Webhook secrets startup loading

**Risk:** Per-request `std::env::var` lookups for webhook secrets are race-prone, add latency, and can leak via error messages if the variable is missing. Attackers can also observe timing differences if the env var is not set.

**Fix:** Both `REPLICATE_WEBHOOK_SECRET` and `KIE_WEBHOOK_SECRET` are now loaded into `AppState.webhook_secrets: HashMap<String, String>` at server startup. The `verify_webhook_secret()` helper was changed from accepting an env var name (`&str`) to accepting a pre-loaded secret string (`&str`). Both `replicate_webhook` and `kie_ai_webhook` extract secrets from the shared state. A missing secret at startup causes a clear `tracing::error!` rather than a per-request failure.

**Files changed:**
- `rings/BRONZE-RING-SRV/src/router.rs`
- `rings/BRONZE-RING-SRV/src/webhooks.rs`

## 2. SecretCache per-key TTL + max size

**Risk:** The previous global `secrets_loaded_at` timestamp meant that **all** cached secrets were considered fresh or stale together. If a new secret was added, it would not be fetched until the entire cache expired. Additionally, there was no cap on cache size, allowing unbounded memory growth if the Infisical project contained many secrets.

**Fix:**
- Replaced `HashMap<String, String>` with `HashMap<String, (String, Instant)>` for per-key TTL tracking.
- Added `MAX_SECRET_CACHE_ENTRIES: usize = 1000` with oldest-entry eviction.
- Added `SecretCache::is_entry_fresh(&self, key: &str) -> bool` to check per-key freshness.
- Added `SecretCache::insert` that evicts the oldest entry when at capacity.
- `get()` and `get_all()` now only reload secrets for the keys that are actually stale.

**Files changed:**
- `rings/SILVER-RING-SC00/src/store.rs`

## 3. get_transactions cursor pagination

**Risk:** `get_transactions_by_telegram_id` previously accepted `limit: i64` up to 10,000 with an offset-based pattern (implicitly, just limit). This allowed loading up to 10,000 rows per request, creating a DoS vector against the DB and network bandwidth. Additionally, there was no way to paginate beyond the first page reliably.

**Fix:**
- Added `cursor: Option<uuid::Uuid>` parameter to the trait and implementation.
- Reduced `safe_limit` from 10,000 to 100 per request.
- Cursor pagination resolves the cursor UUID to a `created_at` timestamp, then filters `created_at < cursor_timestamp` with `order_by_desc(created_at)`. If the cursor row is gone, the first page is returned (graceful degradation).
- Updated e2e test call site to pass `None`.

**Files changed:**
- `rings/GOLD-RING-TR00/src/database.rs`
- `rings/SILVER-RING-DB00/src/repository.rs`
- `tests/e2e-tests/tests/e2e_db.rs`

## Patterns catalog

| Pattern | Where applied |
|---------|---------------|
| Webhook secrets startup loading | `router.rs`, `webhooks.rs` |
| Per-key TTL cache | `store.rs` |
| Cache size cap with LRU eviction | `store.rs` |
| Cursor pagination with UUID timestamp | `repository.rs` |
| LIMIT cap reduction (10,000 → 100) | `repository.rs` |

## Co-operation options for next Wave

1. **Admin/staff ID startup loading** — Move `OWNER_ID`, `ADMIN_ID`, `STAFF_ID` from per-request `std::env::var` into `AppState` at startup, with fail-fast if missing.
2. **Payment gateway timeout wrappers** — Add `timeout(30s)` + `connect_timeout(10s)` to all remaining outbound HTTP clients in payment processor and gateway modules.
3. **Provider response deserialization deny_unknown_fields** — Audit remaining provider response structs for missing `deny_unknown_fields`, which prevents field-name typos from silently swallowing data.
