# Wave 151 Security Audit Report

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo (`/Users/playra/999-multibots-telegraf/rust/`)
**Theme:** Defense-in-depth: secret hygiene, CORS hardening, input validation, observability

---

## Executive Summary

Wave 151 addresses 7 security and reliability issues identified in the trios-mb Rust codebase. All changes compile cleanly (`cargo check` passes with zero errors).

---

## Phase 1: Secret Hygiene — API Key Zeroization

**Files:** `SILVER-RING-AI00/src/providers/*.rs` (8 files)

**Problem:** All AI provider structs (`OpenAiProvider`, `ReplicateProvider`, `FalProvider`, `KieProvider`, `ElevenLabsProvider`, `HeyGenProvider`, `HedraProvider`) stored API keys as raw `String`, leaving sensitive material in plain heap allocations.

**Fix:** Migrated `api_key: String` → `api_key: secrecy::SecretString`. Added `use secrecy::ExposeSecret;` and called `.expose_secret()` only at the HTTP header boundary.

**Impact:** Raw API key strings are now zeroized on drop, reducing secret material lifetime.

---

## Phase 2: CORS Hardening

**File:** `BRONZE-RING-SRV/src/router.rs`

**Problem:** CORS layer allowed `Any` origin, method, and header — a wide-open configuration that exposes the API to cross-origin attacks.

**Fix:**
- Replaced blanket `Any` with explicit allowlist.
- Reads `FRONTEND_URL` env var (comma-separated) for allowed origins.
- Falls back to `Any` origin only when `FRONTEND_URL` is unset (safe default for development).
- Restricted methods to `GET` and `POST`.
- Restricted headers to `Content-Type` and `Authorization`.

**Impact:** Eliminates unauthorized cross-origin requests from arbitrary domains.

---

## Phase 3: Request Body Limits

**File:** `BRONZE-RING-SRV/src/router.rs`

**Problem:** No request body size limit on Axum routes — webhook endpoints could accept arbitrarily large payloads, enabling memory-exhaustion DoS.

**Fix:** Added `axum::extract::DefaultBodyLimit::max(10 * 1024 * 1024)` (10 MB) to all routers.

**Impact:** Prevents OOM from malicious oversized webhook payloads.

---

## Phase 4: Webhook Input Validation & Observability

**Files:** `BRONZE-RING-SRV/src/webhooks.rs`, `payment_webhooks.rs`

**Problem:**
- Webhook handlers used `unwrap_or_default()` for UUID parsing, silently creating nil UUIDs on malformed input.
- `let _ =` on DB updates meant failures were silently dropped.
- No `#[tracing::instrument]` on webhook handlers, making distributed tracing impossible.

**Fix:**
- Added `parse_uuid()` helper that validates UUID format and returns `400 Bad Request` on malformed input.
- Replaced all `let _ =` DB calls with explicit `if let Err(e)` + `tracing::error!` logging.
- Added `#[tracing::instrument(skip(state, payload), fields(...))]` to both webhook handlers.
- Added amount validation (`is_finite()`, `>= 0.0`) in `robokassa_callback` before forwarding to payment gateway.

**Impact:** Malformed webhook payloads are rejected early; DB failures are visible in logs; traces now correlate across async await points.

---

## Phase 5: Job Handler Hardening

**File:** `BRONZE-RING-APP/src/main.rs`

**Problem:**
- `handle_generation_job` silently defaulted to a zeroed `GenerationRequest` on deserialization failure, meaning malformed jobs were executed with `telegram_id = 0`.
- `cost` parameter accepted `NaN`/`inf` via `unwrap_or(0.0)`.

**Fix:**
- Changed `unwrap_or_else` to `map_err(...)?` — malformed payloads now return an error immediately.
- Added `filter(|v| v.is_finite())` to the cost extraction.

**Impact:** Poison-pill jobs are rejected instead of silently executed; non-finite costs are sanitized.

---

## Phase 6: Circuit Breaker Ordering Fix

**File:** `SILVER-RING-AI00/src/circuit_breaker.rs`

**Problem:** Used `Ordering::Relaxed` for atomic failure count and open-state reads/writes, which can tear under concurrent dispatch from multiple Tokio workers.

**Fix:** Upgraded all atomic operations to `Ordering::SeqCst`.

**Impact:** Eliminates race conditions where the circuit breaker could transiently appear closed to one worker while open to another.

---

## Phase 7: Provider Client Connect Timeouts

**Files:** `SILVER-RING-AI00/src/providers/*.rs`

**Problem:** Some reqwest clients had only `.timeout()` (total request timeout) but no `.connect_timeout()`, meaning TCP handshake could hang indefinitely.

**Fix:** Added `.connect_timeout(Duration::from_secs(10))` to all provider reqwest client builders.

**Impact:** Malicious or unreachable endpoints can no longer stall worker threads during TCP handshake.

---

## Verification

```bash
cargo check --target aarch64-apple-darwin
# Finished dev profile [unoptimized + debuginfo] target(s) in 2.58s
```

Zero errors, minimal warnings (pre-existing dead-code warnings only).

---

## Three Collaboration Options for Wave 152

### Option A: Authentication & Authorization (Recommended)
Add API-key middleware, per-key rate limiting, and HMAC-signed webhook verification to close the unauthorized-access window:
- API key header validation with constant-time comparison.
- Per-key Redis-backed rate limiter.
- Webhook signature verification (Replicate, Kie.ai) instead of trusting payload IDs blindly.

### Option B: Resilience & Chaos Engineering
Harden the system against cascading failures:
- Bulkhead semaphore per provider in the orchestrator.
- Retry budget tracking with exponential backoff + jitter.
- Background health-check polling for each provider instead of static circuit breakers.

### Option C: Supply-Chain & Secret Management
Upgrade the entire secret lifecycle:
- Migrate `SecretStore` trait to return `SecretString` instead of `String`.
- Add Infisical secret rotation hooks.
- Audit all `env::var` reads and wrap them in `SecretString`.

---

*Wave 151 complete. Patterns appended to `wave-research-loop` skill.*
