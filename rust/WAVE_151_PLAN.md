# Wave 151 Security Audit Plan

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo (`/Users/playra/999-multibots-telegraf/rust/`)
**Theme:** Defense-in-depth: input validation, secret hygiene, CORS hardening, observability

---

## Reconnaissance Findings

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | **API keys stored as raw `String`** in all AI providers | CRITICAL | `SILVER-RING-AI00/src/providers/*.rs` |
| 2 | **CORS allows any origin/method/header** | HIGH | `BRONZE-RING-SRV/src/router.rs` |
| 3 | **No request body size limits** on Axum routes | HIGH | `BRONZE-RING-SRV/src/router.rs` |
| 4 | **No `tracing::instrument`** on webhook/payment handlers | MEDIUM | `BRONZE-RING-SRV/src/webhooks.rs`, `payment_webhooks.rs` |
| 5 | **`unwrap_or_default()` for UUID parsing** in webhooks | MEDIUM | `BRONZE-RING-SRV/src/webhooks.rs` |
| 6 | **Job handler silently defaults on deserialization failure** | MEDIUM | `BRONZE-RING-APP/src/main.rs:244` |
| 7 | **Circuit breaker uses `Relaxed` ordering** | LOW | `SILVER-RING-AI00/src/circuit_breaker.rs` |
| 8 | **`let _ =` on DB updates** in webhooks — silent failures | MEDIUM | `BRONZE-RING-SRV/src/webhooks.rs` |
| 9 | **Payment amount parsed from String without validation** | HIGH | `BRONZE-RING-SRV/src/payment_webhooks.rs` |
| 10 | **No connect timeout on reqwest clients** | MEDIUM | Some provider clients |

---

## Phase 1: Secret Hygiene — API Key Zeroization
**Files:** `SILVER-RING-AI00/src/providers/openai.rs`, `replicate.rs`, `fal.rs`, `kie.rs`, `elevenlabs.rs`, `heygen.rs`, `hedra.rs`
**Goal:** Migrate `api_key: String` to `api_key: secrecy::SecretString`. Use `.expose_secret()` only at the HTTP header boundary.

## Phase 2: CORS Hardening
**File:** `BRONZE-RING-SRV/src/router.rs`
**Goal:** Replace `Any` with explicit allowlist. Read `FRONTEND_URL` env var for origins.

## Phase 3: Request Body Limits
**File:** `BRONZE-RING-SRV/src/router.rs`
**Goal:** Add `RequestBodyLimitLayer` (10MB for webhooks, 1MB for other routes).

## Phase 4: Webhook Input Validation
**Files:** `BRONZE-RING-SRV/src/webhooks.rs`, `payment_webhooks.rs`
**Goal:**
- Validate UUID format before parsing (reject malformed with 400)
- Add `#[tracing::instrument]` to all handlers
- Replace `let _ =` with explicit error logging

## Phase 5: Job Handler Hardening
**File:** `BRONZE-RING-APP/src/main.rs`
**Goal:**
- Return error instead of silently defaulting on deserialization failure
- Validate `cost` with `is_finite()` before refund arithmetic

## Phase 6: Circuit Breaker Ordering Fix
**File:** `SILVER-RING-AI00/src/circuit_breaker.rs`
**Goal:** Use `Ordering::SeqCst` for failure count and open state.

## Phase 7: Provider Client Hardening
**Files:** All provider files in `SILVER-RING-AI00/src/providers/`
**Goal:** Add `.connect_timeout()` to all reqwest clients.

## Phase 8: Verification & Commit
- `cargo check`
- Write `WAVE_151_REPORT.md`
- Update skill
- Git commit
