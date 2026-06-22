# Wave 257 Plan

**Theme:** Complete payment gateway callback validation, payment processor boundary guards, worker error log truncation.

---

## Fix 1 — Telegram Stars transaction_id length cap (MEDIUM)

**File:** `rings/SILVER-RING-PY00/src/telegram_stars.rs`

`verify_callback` extracts `telegram_payment_charge_id` with no length validation. Completes the payment gateway callback length-cap pass (x402 and ton already fixed in Wave 256).

Add `MAX_TRANSACTION_ID_LEN = 256` constant and length check after extracting `transaction_id`.

---

## Fix 2 — Payment processor telegram_id sentinel guards (HIGH)

**File:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs`

`create_payment` and `direct_debit` accept `telegram_id: i64` from upstream handlers and pass it directly to DB operations without validating it is positive. Defense-in-depth requires boundary validation.

Add `if telegram_id <= 0` check at the start of both functions, returning `AppError::Validation`.

---

## Fix 3 — Worker dequeue error truncation (MEDIUM)

**File:** `rings/SILVER-RING-JB00/src/worker.rs`

Line 290: `tracing::error!(error = %e, "dequeue failed");` logs the full queue error. Job queue backend errors can include large payloads or SQL fragments.

Replace with `truncate_for_log(&e.to_string(), 1024)` before logging.

---

**Verification:**
- `cargo check -p trios-mb-payment --target aarch64-apple-darwin`
- `cargo check -p trios-mb-jobs --target aarch64-apple-darwin`

**Commit:** `security: Stars callback length cap, payment processor sentinel guards, worker dequeue error truncation (Wave 257)`
