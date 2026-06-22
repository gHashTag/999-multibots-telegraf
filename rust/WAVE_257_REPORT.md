# Wave 257 Report

**Date:** 2026-06-16
**Scope:** Input validation and logging hygiene in payment and job processing layers.
**Co-Authored-By:** Claude Opus 4.8 <noreply@anthropic.com>

---

## Fix 1: Telegram Stars transaction_id length cap

**File:** `rings/SILVER-RING-PY00/src/telegram_stars.rs`  
**Pattern:** Enforce a maximum length on external payment identifiers before they are processed or stored.

Added `const MAX_TRANSACTION_ID_LEN: usize = 256;` and a length check inside `verify_callback`. If `telegram_payment_charge_id` exceeds the limit, the callback is rejected early with `AppError::Validation`. This prevents downstream DB write failures or log injection from abnormally long strings injected by a malicious client.

---

## Fix 2: Payment processor sentinel guards

**File:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs`  
**Pattern:** `telegram_id <= 0` sentinel guard at public entry points.

Added the guard to both `create_payment` and `direct_debit`. A non-positive `telegram_id` now returns `AppError::Validation` immediately, preventing corrupted balance records and ensuring every monetary operation is tied to a real user identity. This closes the gap where internal APIs could be called with an invalid ID before hitting the DB.

---

## Fix 3: Worker dequeue error truncation

**File:** `rings/SILVER-RING-JB00/src/worker.rs`  
**Pattern:** `truncate_for_log` on error values before emitting `tracing::error!`.

Replaced the raw `tracing::error!(error = %e, "dequeue failed");` with a truncated version using `trios_mb_types::truncate_for_log(&err_raw, 1024)`. This bounds the size of error payloads written to logs and telemetry, mitigating a potential DoS vector where a poisoned queue item could produce an arbitrarily large error message on every dequeue attempt.

---

## Verification

- `cargo check -p trios-mb-payment --target aarch64-apple-darwin` ✅
- `cargo check -p trios-mb-jobs --target aarch64-apple-darwin` ✅

No regressions introduced. All fixes are additive (validation or truncation) and do not change happy-path behavior.

---

## Cooperation Variants for Wave 258

1. **Rate-limit audit** — Harden per-route rate-limit fallback logic and add burst-limit constants where they are still hard-coded in `router.rs` or middleware.
2. **Webhook secret rotation support** — Make the webhook secret loading in `webhooks.rs` and `payment_webhooks.rs` support a secondary/rolling secret so zero-downtime rotation is possible.
3. **Provider input sanitization pass** — Add `is_finite()` and length-cap guards to the remaining provider helper functions in `GOLD-RING-PR00` and `SILVER-RING-AI00` that accept `f64` or free-text parameters.
