# Wave 156 Security Plan — Panic Recovery & Constructor Hardening

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate remaining panic paths, add background task supervision, harden provider constructors

---

## Phase 1: CRITICAL — HMAC `unwrap()` in Payment Signature

**Problem:** `rings/SILVER-RING-PY00/src/robokassa.rs:26` calls `HmacSha256::new_from_slice(data.as_bytes()).unwrap()`. While HMAC accepts any key length, this is a panic path in payment-critical code.

**File:** `SILVER-RING-PY00/src/robokassa.rs`

**Fix:** Replace `unwrap()` with `map_err()` returning `AppError::Internal`.

---

## Phase 2: CRITICAL/HIGH — Background Task Supervision

**Problem:** `rings/BRONZE-RING-APP/src/main.rs` spawns server, maintenance, and up to 15 bot dispatcher tasks. None are monitored for panics. If any task panics, it silently stops with no restart. The `worker.rs` workers have the same issue.

**Files:** `BRONZE-RING-APP/src/main.rs`, `SILVER-RING-JB00/src/worker.rs`

**Fix:** Add panic-aware supervision loops that log the panic, wait briefly, and restart the inner task. Use `std::panic::AssertUnwindSafe` + `catch_unwind` for the inner future.

---

## Phase 3: HIGH — Provider reqwest Client Constructor Hardening

**Problem:** 10 AI provider constructors (8 files) use `reqwest::Client::builder()...build().unwrap_or_default()`. Builder failures silently fall back to a default `Client` with different timeouts.

**Files:**
- `SILVER-RING-AI00/src/providers/openai.rs` (3 constructors)
- `SILVER-RING-AI00/src/providers/replicate.rs`
- `SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `SILVER-RING-AI00/src/providers/fal.rs`
- `SILVER-RING-AI00/src/providers/heygen.rs`
- `SILVER-RING-AI00/src/providers/hedra.rs`
- `SILVER-RING-AI00/src/providers/kie.rs`
- `SILVER-RING-AI00/src/providers/midjourney.rs`

**Fix:** Replace `unwrap_or_default()` with `map_err(...)?` so startup fails fast if the HTTP client cannot be configured.

---

## Phase 4: MEDIUM — Provider Response Field Hardening

**Problem:** Provider response parsing uses `unwrap_or_default()` on required fields, silently producing empty defaults.

**Files:**
- `SILVER-RING-AI00/src/providers/elevenlabs.rs:161` — voices list
- `SILVER-RING-AI00/src/providers/kie.rs:315` — task_id formatting
- `SILVER-RING-AI00/src/providers/hedra.rs:185` — anim_id formatting

**Fix:** Replace with explicit `ok_or_else(...)?` errors.

---

## Phase 5: MEDIUM — Payment Parameter Validation

**Problem:** Payment callback handlers silently default missing parameters to empty strings instead of rejecting the callback.

**Files:**
- `SILVER-RING-PY00/src/robokassa.rs:51`
- `SILVER-RING-PY00/src/x402.rs:65`
- `SILVER-RING-PY00/src/ton.rs:82`
- `SILVER-RING-PY00/src/telegram_stars.rs:35`

**Fix:** Replace `unwrap_or_default()` with explicit validation that returns an error if the parameter is missing.

---

## Verification

- `cargo check --target aarch64-apple-darwin`
- Confirm no new `unwrap()` or `unwrap_or_default()` on critical paths

---

## Commit Message Template

```
feat: Wave 156 security hardening (rust)

- CRITICAL: HMAC unwrap in robokassa.rs replaced with map_err
- CRITICAL: Background task supervision loops added to main.rs spawns
- HIGH: Provider reqwest Client builder unwrap_or_default hardened (8 files)
- MEDIUM: Provider response field unwrap_or_default hardened (3 files)
- MEDIUM: Payment callback parameter validation hardened (4 files)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
