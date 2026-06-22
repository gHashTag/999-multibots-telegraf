# Wave 171 Security Audit Report

**Date:** 2026-06-16  
**Scope:** Payment gateway overflow guards, secret-store resilience, DB maintenance safety, error-handling hygiene  
**Status:** All tasks implemented, tests passing.

---

## Executive Summary

Wave 171 closes the overflow gap in the TON gateway (missed in Wave 170), hardens the Infisical secret store against indefinite hangs and redirect attacks, caps the `retry_stuck` maintenance query to prevent table-wide locks, and eliminates silent `get_balance` error swallowing across three handler sites. It also adds `deny_unknown_fields` to Infisical response structs.

---

## Literature

- Microsoft, *Async Rust: From Futures to Production* Ch.13 — supervisor loops, `JoinSet`, and panic recovery patterns: https://microsoft.github.io/RustTraining/async-book/ch13-production-patterns.html
- Stripe API Docs — amounts in smallest currency unit for exact financial math: https://stripe.com/docs/currencies
- OWASP API Security Top 10 2023 — Broken Object Level Authorization, Excessive Data Exposure: https://owasp.org/API-Security/editions/2023/en/0x11-t10/

---

## Fixes Applied

### 1. TonGateway Nano-Ton Overflow Guard

**File:** `rings/SILVER-RING-PY00/src/ton.rs`

Added a hard cap (`MAX_TON_AMOUNT = 1_000_000_000.0`) before the `amount * 1_000_000.0` / `amount * 1_000_000_000.0` scaling. Without this, a crafted `amount` > ~1.8e13 would overflow `f64` to `Inf`, and `Inf as u64` silently produces `u64::MAX` (or 0), corrupting the transfer value sent to the TON wallet.

```rust
const MAX_TON_AMOUNT: f64 = 1_000_000_000.0;
if amount > MAX_TON_AMOUNT {
    return Err(AppError::Validation(...));
}
```

### 2. InfisicalStore Reqwest Hardening

**Files:** `rings/SILVER-RING-SC00/src/store.rs`, `rings/BRONZE-RING-APP/src/main.rs`

`InfisicalStore::new` previously used `reqwest::Client::new()` with no timeout, no connect timeout, and default redirect policy (follows up to 10 redirects). This could:
- Hang forever if Infisical API is slow or down
- Be vulnerable to SSRF via redirect if the Infisical API domain were compromised

Now the client is built with:
```rust
Client::builder()
    .timeout(Duration::from_secs(30))
    .connect_timeout(Duration::from_secs(10))
    .redirect(reqwest::redirect::Policy::none())
    .build()
```

The constructor now returns `Result<Self, AppError>` and the call site in `main.rs` propagates the error with `?`.

### 3. `retry_stuck` LIMIT Cap

**File:** `rings/SILVER-RING-JB00/src/queue.rs`

The `retry_stuck` UPDATE previously had no LIMIT. During a large outage, millions of stuck jobs could be updated in a single query, holding a table lock and generating massive WAL.

Now the query uses a sub-select with `LIMIT 1000`:
```sql
UPDATE job_queue
SET status = 'queued', attempts = 0, started_at = NULL, updated_at = NOW()
WHERE id IN (
    SELECT id FROM job_queue
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '1 second' * $1
      AND attempts < max_attempts
    LIMIT $2
)
```

The maintenance loop processes remaining stuck jobs on subsequent ticks.

### 4. Eliminate Silent `get_balance` Error Swallowing

**Files:**
- `rings/SILVER-RING-SN00/src/balance.rs`
- `rings/SILVER-RING-SN00/src/generation_utils.rs`
- `rings/SILVER-RING-SN00/src/handlers.rs`

Three handler sites previously used `db.get_balance(tid).await.unwrap_or(0.0)`. If the DB was temporarily unavailable, users saw "balance: 0" instead of an error, creating both poor UX and an operational blind spot.

All three now use explicit `match`:
- `balance.rs` and `handlers.rs`: propagate the error, log at `error!` level, and return a localized "service temporarily unavailable" message to the user.
- `generation_utils.rs`: in the insufficient-funds branch, `get_balance` failure is logged but the handler still shows 0.0 (the user is already being denied service; the priority is not to panic).

### 5. `deny_unknown_fields` on Infisical Response Structs

**File:** `rings/GOLD-RING-PR00/src/infisical.rs`

Added `#[serde(deny_unknown_fields)]` to `AuthResponse`, `GetSecretsResponse`, and `SecretItem`. If Infisical changes their API schema, unknown fields will now fail loudly instead of being silently ignored, preventing logic errors from missing newly required fields.

---

## Test Results

```
cargo check -p trios-mb-payment   ✅
cargo check -p trios-mb-secrets   ✅
cargo check -p trios-mb-jobs      ✅
cargo check -p trios-mb-scenes    ✅
cargo check -p trios-mb-app       ✅
```

---

## Deferred Items

- **Payment processor atomicity** — `verify_and_complete`, `direct_debit`, and `refund` in `PaymentProcessor` still perform balance mutation + transaction status update as separate DB calls. Migrating them to CTEs (like `complete_robokassa_payment`) is deferred to Wave 172.
- **Trait-level `Money` migration** — `PaymentGateway` and `Database` traits still use `f64`. A full migration requires touching 4+ gateways, the repository, and the `PaymentInit`/`PaymentVerification` structs. Deferred to a dedicated migration wave.
- **Tower-Governor DashMap pruning** — `tower_governor`'s internal state still grows without automatic TTL. Monitoring remains the current mitigation.

---

## Cooperation Options for Next Wave

1. **Payment Processor Atomicity** — Migrate `verify_and_complete`, `direct_debit`, and `refund` to PostgreSQL CTEs, collapsing each balance mutation + transaction status update into a single atomic query. This prevents crash-induced inconsistencies where one half of the operation succeeds and the other fails.
2. **Trait-Level `Money` Migration** — Change `PaymentGateway` and `Database` trait signatures from `f64` to `Money`, updating all 4 gateways, the repository, and the struct definitions. This is the final step in eliminating floating-point math from the financial core.
3. **Governor State Pruning** — Add a background `tokio::time::interval` task that inspects `tower_governor`'s internal DashMap and evicts entries older than a TTL, preventing unbounded memory growth under IP-spoofed load.
