# Wave 252 Report

**Date:** 2026-06-16
**Theme:** Sanitize remaining raw DB error sites in `repository.rs` (generation, prompt, subscription, webhook, transaction functions).

---

## Fix 1 — Generation CRUD sanitization (7 sites)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

Replaced bare `map_err(|e| AppError::Db(...Query(e.to_string())))` with `sanitize_db_error("<op>", e)` in:
- `create_generation` (insert) → `"create_generation"`
- `update_generation_status` (find_by_id + update) → `"update_generation_status"`
- `get_generation` (find_by_id) → `"get_generation"`
- `get_generation_owned` (find) → `"get_generation_owned"`
- `update_generation_status_owned` (find + update) → `"update_generation_status_owned"`

**Why:** Generation functions are high-traffic; raw DB errors leak internal SQL details to upstream callers.

---

## Fix 2 — Prompt and subscription sanitization (5 sites)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

Replaced bare error mapping in:
- `save_prompt` (insert) → `"save_prompt"`
- `get_prompt` (one) → `"get_prompt"`
- `check_subscription` (one) → `"check_subscription"`
- `renew_subscription` (find + update) → `"renew_subscription"`

**Why:** Subscription and prompt DB calls handle user-facing data; sanitized errors prevent info disclosure.

---

## Fix 3 — Webhook events and transaction pagination sanitization (4 sites)

**File:** `rings/SILVER-RING-DB00/src/repository.rs`

Replaced bare error mapping in:
- `record_webhook_event` (execute) → `"record_webhook_event"`
- `has_webhook_event` (count) → `"has_webhook_event"`
- `get_transactions_by_telegram_id` (cursor resolve + all) → `"get_transactions_by_telegram_id_cursor"` / `"get_transactions_by_telegram_id"`

**Why:** Webhook idempotency and transaction queries are security-sensitive; sanitized errors prevent SQL detail exposure.

---

## Verification

- `cargo check -p trios-mb-db --target aarch64-apple-darwin` ✅ clean, zero warnings
- Remaining raw DB error sites: **2** (`get_generated_images_count`, `get_referral_count`)

---

## Next-wave cooperation variants

1. **Sanitize final 2 DB error sites** — `get_generated_images_count` and `get_referral_count` to complete the repository.rs sanitization pass.
2. **Webhook payload struct hardening** — Add `#[serde(deny_unknown_fields)]` to Kie webhook payload structs and validate numeric `inv_id` format in Robokassa callback.
3. **Provider response body cap enforcement** — Apply `truncate_for_log` / byte-limit guards to success-path response logging in remaining provider modules.
