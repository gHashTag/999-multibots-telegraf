# Wave 158 Security Plan — Handler Refactor, Webhook Auth & Worker Timeouts

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** Remove redundant balance checks, add webhook authentication, prevent worker hangs

---

## Phase 1: CRITICAL — Remove Redundant `check_balance` + `deduct_balance`

**Files:** 14 handlers in `rings/SILVER-RING-SN00/src/`

**Problem:** Since Wave 157 made `deduct_balance` atomic (`UPDATE ... WHERE balance >=`), the separate `check_balance` call is redundant and creates a race window. Concurrent requests can pass `check_balance` but fail `deduct_balance`, leading to confusing user experience.

**Files affected:**
- `generation_utils.rs` (dispatch_and_reply)
- `face_swap.rs`
- `voice_training.rs`
- `ai_reels.rs`
- `hedra_render.rs` (×2 branches)
- `remove_bg.rs`
- `avatar_transform.rs`
- `music_generation.rs`
- `fal_render.rs`
- `train_flux_model.rs`
- `ai_cover.rs`
- `text_to_speech.rs`
- `ai_photoshop.rs`
- `heygen_render.rs`

**Fix:** Remove `check_balance` call. Use `deduct_balance` directly; if it returns `false`, show the insufficient-funds message. This collapses two DB round-trips into one.

---

## Phase 2: CRITICAL — Webhook Signature Verification

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** Replicate and Kie.ai webhook endpoints accept arbitrary POST requests with no signature or authentication. An attacker can forge generation status updates by guessing UUIDs.

**Fix:**
- Add shared-secret token validation to both webhook handlers
- Read token from `REPLICATE_WEBHOOK_SECRET` and `KIE_WEBHOOK_SECRET` env vars
- Return `401 Unauthorized` for missing/invalid signatures
- Add `X-Webhook-Secret` header check (configurable per provider)

---

## Phase 3: HIGH — Worker Timeouts

**File:** `rings/SILVER-RING-JB00/src/worker.rs`

**Problem:** `queue.dequeue()`, `queue.update_status()`, `queue.get()`, and `queue.retry_stuck()` have no timeouts. A hung DB connection stalls the worker indefinitely.

**Fix:** Wrap all queue I/O calls in `tokio::time::timeout(Duration::from_secs(30), ...)`.

---

## Phase 4: MEDIUM — Rate Limiting

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Problem:** No rate limiting on any endpoint. Webhooks and payment callbacks are vulnerable to replay/DoS attacks.

**Fix:** Add `tower_governor` rate-limiting layer with per-IP limits:
- Webhooks: 30 req/min per IP
- Payment callbacks: 10 req/min per IP
- Health: 60 req/min per IP
- API: 120 req/min per IP

---

## Phase 5: MEDIUM — URL Validation in Webhooks

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

**Problem:** Provider-supplied result URLs are stored directly in the DB without scheme/hostname validation, creating SSRF risk if those URLs are later fetched.

**Fix:** Validate URL scheme (`http`/`https` only) and length before storing.

---

## Verification

- `cargo check --target aarch64-apple-darwin`
- Confirm no new race conditions introduced
- Test webhook signature rejection

---

## Commit Message Template

```
feat: Wave 158 security hardening (rust)

- CRITICAL: Removed redundant check_balance calls from 14 generation handlers
- CRITICAL: Added webhook signature verification for Replicate and Kie.ai
- HIGH: Added timeouts to worker queue operations
- MEDIUM: Added rate limiting to router
- MEDIUM: Added URL validation to webhook result_url storage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
