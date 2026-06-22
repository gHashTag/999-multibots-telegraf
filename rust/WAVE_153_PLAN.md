# Wave 153 Security Plan — Input Validation Guards & Orchestrator Resilience

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate sentinel-value propagation, validate CORS origins, add timeout wrapping to orchestrator queries, harden JSON serialization fallbacks

---

## Phase 1: Telegram ID Sentinel Guard (SN00)

**Problem:** ~30 handlers in `SILVER-RING-SN00` use `msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0)` to extract the user's Telegram ID. A `tid == 0` is a sentinel value that should never proceed with chargeable or stateful operations, yet many handlers pass it directly to DB calls and balance deductions.

**Files:** ~30 files in `SILVER-RING-SN00/src/`

**Fix:** Add an early-return guard immediately after the `tid` extraction:
```rust
let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
if tid == 0 {
    tracing::warn!("Missing telegram_id; aborting handler");
    return Ok(());
}
```

---

## Phase 2: CORS Origin Validation (BRONZE-RING-SRV)

**Problem:** In `router.rs`, `FRONTEND_URL` values are parsed with `HeaderValue::from_str(&o).unwrap_or(HeaderValue::from_static("*"))`. An invalid origin string silently falls back to the wildcard `*`, which is a security regression.

**File:** `BRONZE-RING-SRV/src/router.rs`

**Fix:** Filter out origins that fail `HeaderValue::from_str` instead of falling back to `*`. Log a warning for each invalid origin.

---

## Phase 3: Orchestrator Check-Status / Get-Result Timeout Wrapping

**Problem:** `AiOrchestrator::check_status()` and `get_result()` call provider methods directly without any timeout. A slow provider can hang these calls indefinitely.

**File:** `SILVER-RING-AI00/src/orchestrator.rs`

**Fix:** Wrap both methods in `tokio::time::timeout(Duration::from_secs(30), ...)`.

---

## Phase 4: JSON Serialization Fail-Closed

**Problem:** `generation_utils.rs:148` uses `serde_json::to_value(&request).unwrap_or_default()` to serialize a generation request for the job queue. On serialization failure, it produces an empty JSON object that gets enqueued as a poison-pill job.

**File:** `SILVER-RING-SN00/src/generation_utils.rs`

**Fix:** Replace `unwrap_or_default()` with `map_err(...)?` to fail closed.

---

## Phase 5: State Field Sentinel Guard (Morphing, Flux Training)

**Problem:** `morphing.rs` and `train_flux_model.rs` use `state.images.clone().unwrap_or_default()` and `state.images.clone().unwrap_or_default().join(",")`. An empty images list means the user will be charged for a generation with no input images.

**Files:** `SILVER-RING-SN00/src/morphing.rs`, `train_flux_model.rs`

**Fix:** Add an early guard that returns the user to the menu with a warning if required state fields are missing or empty.

---

## Verification

- `cargo check --target aarch64-apple-darwin`
- Review all changed files for compilation errors
- Confirm no new `unwrap_or(0)` patterns on telegram_id without guards

---

## Commit Message Template

```
feat: Wave 153 security hardening (rust)

- Added telegram_id == 0 sentinel guard across 30 SN00 handlers
- CORS origin validation: invalid origins are filtered instead of falling back to *
- Added 30s timeout wrapping to orchestrator check_status and get_result
- JSON serialization fail-closed in generation_utils (removed unwrap_or_default)
- State field sentinel guards in morphing and flux training

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
