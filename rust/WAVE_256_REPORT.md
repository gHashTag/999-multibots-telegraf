# Wave 256 Report

**Date:** 2026-06-16
**Theme:** Access-control sentinel hardening and payment gateway callback input validation.

---

## Fix 1 — Access-control sentinel guards (HIGH)

**File:** `rings/SILVER-RING-TG00/src/access.rs`

Only `is_super_admin` explicitly rejected `user_id == 0` (the sentinel). If someone accidentally configured `"HAIM_GROUP_STAFF_IDS=0,123"`, then `is_staff(0)` and `is_admin(0)` would return true, granting privileges to the sentinel value.

Added `if user_id == SUPER_ADMIN_SENTINEL { return false; }` to:
- `is_admin`
- `is_staff`
- `has_parsing_access`

**Why:** Defense-in-depth. The sentinel value must never grant privileges under any configuration, even if manually added to staff lists or if parsing produces unexpected results (OWASP A01:2021 — Broken Access Control, CWE-285).

---

## Fix 2 — X402 transaction hash length cap (MEDIUM)

**File:** `rings/SILVER-RING-PY00/src/x402.rs`

`verify_callback` extracted `transaction_hash` from the callback payload with no length validation. A malicious or malfunctioning x402 facilitator could send a multi-megabyte string, causing DB query exhaustion when `transaction_id` is passed to `get_transaction_by_external_id`.

Added `MAX_TRANSACTION_ID_LEN = 256` constant and length validation:
```rust
if tx_hash.len() > MAX_TRANSACTION_ID_LEN {
    return Err(AppError::Validation(...));
}
```

**Why:** Untrusted external input must be bounded before reaching persistence layers. This prevents resource exhaustion and potential DoS (CWE-770, OWASP A05:2021).

---

## Fix 3 — TON transaction hash length cap (MEDIUM)

**File:** `rings/SILVER-RING-PY00/src/ton.rs`

`verify_callback` extracted `hash` from the callback payload with no length validation. Same risk as Fix 2.

Added `MAX_TRANSACTION_ID_LEN = 256` constant and length validation after extracting `hash`.

**Why:** Same as Fix 2 — untrusted payment callback fields must be bounded before DB lookup.

---

## Verification

- `cargo check -p trios-mb-tg --target aarch64-apple-darwin` ✅ clean, zero warnings
- `cargo check -p trios-mb-payment --target aarch64-apple-darwin` ✅ clean, zero warnings

---

## Next-wave cooperation variants

1. **Telegram Stars transaction_id length cap** — Add `MAX_TRANSACTION_ID_LEN` validation to `telegram_stars.rs::verify_callback` for `telegram_payment_charge_id`, completing the payment gateway callback length-cap pass.
2. **Startup configuration observability** — Add `#[tracing::instrument]` to `load_bot_name` in `access.rs` and `load_webhook_secret` in `router.rs` to improve startup failure diagnostics.
3. **Payment processor `telegram_id` sentinel guard** — Audit `payment_processor.rs` `create_payment`, `direct_debit`, and `refund` for any missing `telegram_id <= 0` validation before DB operations.
