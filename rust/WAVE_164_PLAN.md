# Wave 164 Plan

**Date:** 2026-06-16
**Theme:** Worker resilience, secret redaction, request timeouts, response body caps, DB pool hardening

---

## Scientific Literature Review

1. **"Chaos Engineering"** (Netflix / Gremlin) — Background workers must survive panics via supervised restart loops. A single poison-pill job must not permanently kill the worker pool.
2. **OWASP Logging Cheat Sheet** — Never log secrets or derive `Debug` on structs containing raw credentials. Use redacted custom `Debug` impls.
3. **"Timeouts and Deadlines"** (AWS Builders' Library) — Every external network call must have explicit connect + total timeouts. Default client configurations that omit timeouts are a latent DoS vector.
4. **CWE-770: Allocation of Resources Without Limits** — Reading response bodies without size limits enables memory-exhaustion DoS. Always check `content_length()` or stream with a byte cap.
5. **PostgreSQL Pool Best Practices** (PgBouncer / sqlx docs) — Connection pools need explicit `connect_timeout`, `idle_timeout`, and `max_lifetime` to prevent stale connections from accumulating and causing cascading failures.

---

## Decomposed Tasks

### Task #147 (CRITICAL) — Worker panic supervision
**File:** `rings/SILVER-RING-JB00/src/worker.rs`
**Problem:** The outer worker loop is spawned with bare `tokio::spawn`. A panic inside `poll_and_execute` kills the worker permanently; the queue consumer is lost.
**Fix:** Wrap the outer worker loop in a `spawn_traced`-style supervisor with `catch_unwind`. On panic, log the error, wait 5s, and restart. Accept a `CancellationToken` for graceful shutdown.

### Task #148 (HIGH) — Secret redaction via custom Debug
**Files:**
- `rings/GOLD-RING-PR00/src/infisical.rs` (`AuthRequest`, `AuthResponse`, `SecretItem`)
- `rings/GOLD-RING-TY00/src/bot.rs` (`BotConfig`)
- `rings/SILVER-RING-DB00/src/entities/bots.rs` (`Model`)
- `rings/SILVER-RING-PY00/src/robokassa.rs` (`RobokassaGateway`)
**Problem:** These structs derive `Debug` and contain raw `String` secrets (tokens, passwords, access tokens). Logs and traces leak them.
**Fix:** Implement manual `std::fmt::Debug` that replaces secret fields with `"[REDACTED]"`. Where feasible, wrap secrets in `secrecy::SecretString`.

### Task #149 (HIGH) — x402 reqwest timeout hardening
**File:** `rings/SILVER-RING-PY00/src/x402.rs`
**Problem:** Creates `reqwest::Client::new()` with no `.timeout()` or `.connect_timeout()`. Hanging TCP handshakes can stall Tokio worker threads.
**Fix:** Build client with `.timeout(Duration::from_secs(30))` and `.connect_timeout(Duration::from_secs(10))`.

### Task #150 (MEDIUM) — Provider error response body caps
**Files:** All AI providers in `rings/SILVER-RING-AI00/src/providers/`
**Problem:** Error paths use `resp.text().await` without checking `content_length()`. Success JSON paths use `resp.json().await` without body-size guards.
**Fix:** Add `MAX_ERROR_BODY_BYTES = 1 MiB` constant in a shared location (or per-provider). Before calling `.text()` or `.json()`, check `resp.content_length()`. If it exceeds the cap, return a synthetic error without reading the body.

### Task #151 (MEDIUM) — SeaORM connection pool timeouts
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Problem:** `sea_orm::Database::connect(url)` uses default pool settings. No explicit `connect_timeout`, `idle_timeout`, or `max_lifetime`.
**Fix:** Create `ConnectOptions` from the URL, set timeouts, then connect. Example:
```rust
let mut opt = sea_orm::ConnectOptions::new(url);
opt.connect_timeout(Duration::from_secs(10));
opt.idle_timeout(Duration::from_secs(60));
opt.max_lifetime(Duration::from_secs(300));
sea_orm::Database::connect(opt).await?
```

### Task #152 (MEDIUM) — x402 NaN/Inf guard
**File:** `rings/SILVER-RING-PY00/src/x402.rs`
**Problem:** `(amount * 1_000_000.0) as u64` uses raw `f64` without `is_finite()` check.
**Fix:** Guard with `!amount.is_finite()` and reject non-positive amounts before conversion.

---

## Deferred Items

1. **MidjourneyProvider wiring check** — Verify if `MidjourneyProvider::new` is actually called anywhere; if unused, remove the dead provider.
2. **Full `SecretString` trait migration** — Changing `secret_store.get()` to return `SecretString` requires touching `GOLD-RING-TR00`, `GOLD-RING-PR00`, and all call sites. Too large for one wave.
3. **Provider streaming chunk limit** — For responses without `content_length()` (chunked encoding), we need a streaming byte cap adapter. Deferred to a dedicated streaming hardening wave.

---

## Acceptance Criteria

- [ ] Worker loop has `catch_unwind` + restart supervision.
- [ ] All 5 secret-bearing structs have redacted `Debug` impls.
- [ ] x402 client has explicit timeout + connect_timeout.
- [ ] All 7 provider files guard `.text()` / `.json()` with `MAX_ERROR_BODY_BYTES`.
- [ ] SeaORM connection uses `ConnectOptions` with explicit timeouts.
- [ ] x402 `amount` has `is_finite()` + positive guard.
- [ ] Full workspace `cargo check` passes cleanly.
