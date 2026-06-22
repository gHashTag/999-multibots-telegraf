# Wave 253 Report

**Date:** 2026-06-16
**Theme:** Complete DB error sanitization pass, add numeric format validation to payment webhooks, and improve provider observability.

---

## Fix 1 — Final DB error sanitization (2 sites)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

Replaced the last two bare `map_err(|e| AppError::Db(...Query(e.to_string())))` patterns with `sanitize_db_error("<op>", e)` in:
- `get_generated_images_count` → `"get_generated_images_count"`
- `get_referral_count` → `"get_referral_count"`

**Verification:** `grep 'map_err(|e| AppError::Db'` now returns 0 matches across `repository.rs`.

**Why:** This completes the ~40-site DB error sanitization pass started in Waves 248–252. Raw DB error strings are no longer exposed upstream anywhere in the repository.

---

## Fix 2 — Robokassa `inv_id` numeric format validation

**File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`

Added a digit-only format check after the length check:
```rust
if !form.inv_id.chars().all(|c| c.is_ascii_digit()) {
    tracing::warn!(...);
    return "ERROR: invalid inv_id format".to_string();
}
```

**Why:** Robokassa invoice IDs (`InvId`) are strictly numeric. Non-numeric characters in this field could indicate injection attempts or malformed callbacks. Rejecting them early prevents invalid data from reaching the webhook idempotency table or downstream logging.

---

## Fix 3 — Provider helper observability

**File:** `rings/SILVER-RING-AI00/src/providers/mod.rs`

Added `#[tracing::instrument(skip_all)]` to `read_error_body` and `#[tracing::instrument(skip(resp), fields(provider = %provider, max_bytes))]` to `parse_json_limited`.

**Why:** These helpers are called from every AI provider on both error and success paths. Instrumentation improves incident traceability and response-time visibility, directly addressing OWASP A09:2021 (Security Logging and Monitoring Failures).

---

## Verification

- `cargo check -p trios-mb-db --target aarch64-apple-darwin` ✅ clean, zero warnings
- `cargo check -p trios-mb-server --target aarch64-apple-darwin` ✅ clean, zero warnings
- `cargo check -p trios-mb-ai --target aarch64-apple-darwin` ✅ clean, zero warnings
- Remaining raw DB error sites in `repository.rs`: **0**

---

## Next-wave cooperation variants

1. **Webhook response body cap enforcement** — Apply `truncate_for_log` or byte-limit guards to success-path response logging in `webhooks.rs` and `payment_webhooks.rs` to prevent oversized payloads from flooding logs.
2. **Provider response field hardening** — Add `#[serde(deny_unknown_fields)]` to any remaining provider request/response structs in `GOLD-RING-PR00` or `GOLD-RING-TY00` that deserialize external data but haven't been hardened yet.
3. **Payment processor amount precision guard** — Audit `payment_processor.rs` for any remaining `f64` arithmetic sites that haven't been migrated to `Money` or hardened with `is_finite()` guards.
