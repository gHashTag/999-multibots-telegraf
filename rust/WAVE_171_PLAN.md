# Wave 171 Security Audit — Decomposed Plan

**Date:** 2026-06-16  
**Focus:** Overflow guards, secret-store resilience, DB maintenance safety, error-handling hygiene  
**Literature:** Microsoft *Async Rust: From Futures to Production* Ch.13 (supervisor loops), Stripe API precision docs (minor units), OWASP API Security Top 10 2023 (Broken Object Level Authorization, Excessive Data Exposure).

---

## Overview

Wave 171 closes the overflow gap in the TON gateway (missed in Wave 170), hardens the Infisical secret store against indefinite hangs and redirect attacks, caps the `retry_stuck` maintenance query to prevent table-wide locks, and eliminates silent `get_balance` error swallowing across three handler sites.

---

## Phase 1: TonGateway Nano-Ton Overflow Guard (P0)

**Weakness:** `TonGateway::create_payment` scales `amount` to nano-tons with `(amount * 1_000_000_000.0) as u64` (native) or `(amount * 1_000_000.0) as u64` (jetton). No ceiling means `f64` overflow to `Inf` silently corrupts the value, just like the x402 issue fixed in Wave 170.

**Fix:** Add `MAX_TON_AMOUNT: f64 = 1_000_000_000.0` cap before scaling, identical pattern to x402.

**Files:** `rings/SILVER-RING-PY00/src/ton.rs`

---

## Phase 2: InfisicalStore Reqwest Hardening (P0)

**Weakness:** `InfisicalStore::new` uses `reqwest::Client::new()` with:
- No request timeout (can hang forever on slow Infisical API)
- No connect_timeout (can hang forever on TCP handshake)
- Default redirect policy (follows up to 10 redirects, enabling SSRF if the Infisical API is ever compromised or DNS-hijacked)

**Fix:** Build the client with explicit `.timeout(30s)`, `.connect_timeout(10s)`, and `.redirect(Policy::none())`.

**Files:** `rings/SILVER-RING-SC00/src/store.rs`

---

## Phase 3: `retry_stuck` LIMIT Cap (P1)

**Weakness:** The `retry_stuck` UPDATE statement has no LIMIT. During a large outage, millions of jobs could be stuck; a single maintenance tick would attempt to update all of them simultaneously, holding a table lock and generating massive WAL.

**Fix:** Add `LIMIT 1000` to the UPDATE CTE. The maintenance loop runs periodically and will catch remaining stuck jobs on subsequent ticks.

**Files:** `rings/SILVER-RING-JB00/src/queue.rs`

---

## Phase 4: Eliminate Silent `get_balance` Error Swallowing (P1)

**Weakness:** Three handler sites use `db.get_balance(tid).await.unwrap_or(0.0)`. If the DB is temporarily unavailable, the user sees "balance: 0" instead of an error, creating both a poor user experience and an operational blind spot.

**Fix:** Replace `unwrap_or(0.0)` with explicit `match` that propagates the error, logs it, and returns a localized "service temporarily unavailable" message.

**Files:**
- `rings/SILVER-RING-SN00/src/balance.rs`
- `rings/SILVER-RING-SN00/src/generation_utils.rs`
- `rings/SILVER-RING-SN00/src/handlers.rs`

---

## Phase 5: `deny_unknown_fields` on Infisical Response Structs (P2)

**Weakness:** `AuthResponse`, `GetSecretsResponse`, and `SecretItem` deserialize Infisical JSON without rejecting unknown fields. If Infisical changes their API schema, silent field truncation could cause logic errors (e.g., missing a newly required field).

**Fix:** Add `#[serde(deny_unknown_fields)]` to the three inbound structs.

**Files:** `rings/GOLD-RING-PR00/src/infisical.rs`

---

## Verification

- `cargo check --all` passing.
- `cargo test -p trios-mb-payment` passing.
- `cargo test -p trios-mb-jobs` passing.
- `cargo test -p trios-mb-scenes` passing.

---

## Cooperation Options

1. **Payment Processor Atomicity** — Migrate `verify_and_complete`, `direct_debit`, and `refund` to PostgreSQL CTEs (like `complete_robokassa_payment`), collapsing balance mutation + transaction status update into single atomic queries. Prevents crash-induced inconsistencies.
2. **Trait-Level `Money` Migration** — Change `PaymentGateway` and `Database` trait signatures from `f64` to `Money`, updating all 4 gateways, the repository, and the `PaymentInit`/`PaymentVerification` structs. Final step in eliminating float from the financial core.
3. **Tower-Governor State Pruning** — Add a background `tokio::time::interval` task that prunes stale entries from `tower_governor`'s internal DashMap, preventing unbounded memory growth under IP-spoofed load.
