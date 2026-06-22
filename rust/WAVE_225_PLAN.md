# WAVE 225 PLAN

## Objective
Close three remaining reliability and observability gaps: unbounded DB calls in critical startup/settings handlers, and a silent `unwrap_or_default()` fallback that obscures configuration errors.

## Literature
- **CWE-1088** — *Synchronous Access of Remote Resource without Timeout*: Without explicit timeouts, a slow remote resource blocks the caller indefinitely, causing thread pool exhaustion.
- **CWE-547** — *Use of Hard-coded, Security-relevant Constants*: Silent `unwrap_or_default()` on environment variables hides configuration drift from operators; the failure should be logged at the exact point of omission.
- **OWASP ASVS V14.7** — Requires documented connection timeouts for every external service.

## Fixes

### Fix 1 — DB timeout wrapping in `start.rs`
**File:** `rings/SILVER-RING-SN00/src/start.rs`

**Change:** Add `const DB_TIMEOUT: Duration = Duration::from_secs(10);`. Wrap:
- `db.get_user_by_telegram_id(tid).await` (line ~40)
- `db.create_user(tid, username.as_deref(), lang).await?` (line ~43)

On timeout, return a localized error and abort the handler. `/start` is the first interaction for every new user; a hang here permanently blocks enrollment.

### Fix 2 — DB timeout wrapping in `balance.rs`, `change_language.rs`, `subscription.rs`, `select_model.rs`
**Files:**
- `rings/SILVER-RING-SN00/src/balance.rs`
- `rings/SILVER-RING-SN00/src/change_language.rs`
- `rings/SILVER-RING-SN00/src/subscription.rs`
- `rings/SILVER-RING-SN00/src/select_model.rs`

**Change:** In each file, add `const DB_TIMEOUT: Duration = Duration::from_secs(10);` and wrap the bare DB call in `tokio::time::timeout`. On timeout, log `tracing::warn!` and return a localized fallback message.

### Fix 3 — Replace silent `unwrap_or_default()` on `FRONTEND_URL` in `router.rs`
**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Change:** Replace:
```rust
let allowed_origins: Vec<String> = std::env::var("FRONTEND_URL")
    .map(|s| s.split(',').map(|o| o.trim().to_string()).collect())
    .unwrap_or_default();
```
with:
```rust
let allowed_origins: Vec<String> = match std::env::var("FRONTEND_URL") {
    Ok(s) => s.split(',').map(|o| o.trim().to_string()).collect(),
    Err(e) => {
        tracing::warn!(error = %e, "FRONTEND_URL not set; CORS requests denied");
        Vec::new()
    }
};
```

This makes the missing-env-var failure visible at the exact call site (CWE-547) rather than relying on downstream logging.

## Verification
- `cargo check -p trios-mb-scenes -p trios-mb-server` must pass.
- `cargo test -p trios-mb-ai` must pass.

## Cooperation Variants for Wave 226
- **Variant A**: Systematic audit of all `std::env::var(...).unwrap_or_default()` patterns across the server (`BRONZE-RING-SRV`) to replace silent fallbacks with explicit logging.
- **Variant B**: `tracing::instrument` gap closure on any remaining uninstrumented `pub async fn` handlers in `BRONZE-RING-SRV` (billing, referrals, documents, etc.).
- **Variant C**: DB timeout wrapping in `payment.rs` and any remaining un-audited scene modules.
