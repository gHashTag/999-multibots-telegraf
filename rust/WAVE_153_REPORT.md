# Wave 153 Security Audit Report

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo (`/Users/playra/999-multibots-telegraf/rust/`)
**Theme:** Input validation guards and orchestrator resilience

---

## Executive Summary

Wave 153 addresses sentinel-value propagation across ~30 Telegram bot handlers, hardens CORS origin validation, adds timeout wrapping to orchestrator status/result queries, and eliminates a poison-pill JSON serialization fallback. All changes compile cleanly (`cargo check` passes with zero errors).

---

## Phase 1: Telegram ID Sentinel Guard (SN00)

**Files:** 29 files in `SILVER-RING-SN00/src/`

**Problem:** ~30 handlers extracted the user's Telegram ID with `msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0)`. A `tid == 0` is a sentinel that should never proceed with chargeable or stateful operations, yet many handlers passed it directly to DB calls and balance deductions.

**Fix:** Added an early-return guard immediately after every `tid` / `telegram_id` extraction:
```rust
let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
if tid == 0 {
    tracing::warn!("Missing telegram_id; aborting handler");
    return Ok(());
}
```

**Impact:** Prevents operations with an invalid user identifier, eliminating a source of phantom DB rows and incorrect balance mutations.

---

## Phase 2: CORS Origin Validation (BRONZE-RING-SRV)

**File:** `BRONZE-RING-SRV/src/router.rs`

**Problem:** `FRONTEND_URL` values were parsed with `HeaderValue::from_str(&o).unwrap_or(HeaderValue::from_static("*"))`. An invalid origin string silently fell back to the wildcard `*`, which is a security regression.

**Fix:**
- Replaced the `map(...).unwrap_or(...)` with an explicit `for` loop that `match`es each origin.
- Invalid origins are logged with `tracing::warn!` and skipped.
- If ALL origins are invalid, the system logs a warning and falls back to `Any`.

**Impact:** Malformed CORS origins no longer silently widen the attack surface.

---

## Phase 3: Orchestrator Check-Status / Get-Result Timeout Wrapping

**File:** `SILVER-RING-AI00/src/orchestrator.rs`

**Problem:** `AiOrchestrator::check_status()` and `get_result()` called provider methods directly without any timeout. A slow provider could hang these calls indefinitely.

**Fix:** Wrapped both methods in `tokio::time::timeout(Duration::from_secs(30), ...)`:
```rust
match tokio::time::timeout(Duration::from_secs(30), provider.check_status(generation_id)).await {
    Ok(result) => result,
    Err(_) => {
        tracing::warn!(...);
        Err(AppError::Ai(AiError::Provider { ... }))
    }
}
```

**Impact:** Status and result queries are now bounded to 30 seconds, preventing worker thread starvation.

---

## Phase 4: JSON Serialization Fail-Closed

**File:** `SILVER-RING-SN00/src/generation_utils.rs`

**Problem:** `serde_json::to_value(&request).unwrap_or_default()` silently produced an empty JSON object on serialization failure. This empty object would be enqueued as a poison-pill job that would fail downstream with a cryptic error.

**Fix:** Replaced `unwrap_or_default()` with `map_err(...)?` that logs the error and returns a validation error immediately.

**Impact:** Serialization failures are caught at enqueue time instead of creating unprocessable jobs.

---

## Verification

```bash
cd /Users/playra/999-multibots-telegraf/rust
cargo check --target aarch64-apple-darwin
# Finished dev profile [unoptimized + debuginfo] target(s) in 3.56s
```

---

## New Patterns Added to Skill Library

1. **`telegram-id-sentinel-guard`** — Every `msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0)` extraction must be followed by an `if tid == 0 { return Ok(()); }` guard before any DB or chargeable operation.

2. **`cors-origin-filter-not-fallback`** — Invalid CORS origins must be filtered and logged, not silently replaced with a wildcard `*`.

3. **`orchestrator-status-timeout`** — Provider `check_status` and `get_result` calls must be wrapped in `tokio::time::timeout` to prevent unbounded hangs on slow providers.

4. **`serde-fail-closed`** — Never use `unwrap_or_default()` on `serde_json::to_value`. Return an explicit error on serialization failure.

---

## Cooperation Variants for Wave 154

**Variant A: Deep Defence**
- Replace remaining `unwrap_or_default()` on `state.images` and other state fields with explicit guards.
- Add `#[tracing::instrument]` to all remaining async HTTP handlers.
- Add `tokio::time::timeout` to provider `cancel` trait methods.

**Variant B: Observability First**
- Add Prometheus counters for: telegram_id sentinel guards triggered, CORS origin validation failures, orchestrator status timeouts, serde serialization failures.
- Build a Grafana dashboard JSON.

**Variant C: Penetration Simulation**
- Write a chaos binary that simulates: missing `msg.from` (tid == 0), invalid CORS origins, slow provider status/result responses, and malformed JSON payloads.
- Integrate into CI.

Reply **A**, **B**, or **C** (or a custom direction) to start Wave 154.
