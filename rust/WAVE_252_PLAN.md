# Wave 252 Plan

**Theme:** Sanitize remaining raw DB error sites in `repository.rs` (generation, prompt, subscription, webhook, transaction functions).

---

## Fix 1 — Generation CRUD sanitization (7 sites)

**Files:** `rings/SILVER-RING-DB00/src/repository.rs`

Replace bare `map_err(|e| AppError::Db(...Query(e.to_string())))` with `sanitize_db_error("<op>", e)` in:
- `create_generation` (insert)
- `update_generation_status` (find_by_id + update)
- `get_generation` (find_by_id)
- `get_generation_owned` (find)
- `update_generation_status_owned` (find + update)

---

## Fix 2 — Prompt and subscription sanitization (5 sites)

**Files:** `rings/SILVER-RING-DB00/src/repository.rs`

Replace bare error mapping in:
- `save_prompt` (insert)
- `get_prompt` (one)
- `check_subscription` (one)
- `renew_subscription` (find + update)

---

## Fix 3 — Webhook events and transaction pagination sanitization (4 sites)

**Files:** `rings/SILVER-RING-DB00/src/repository.rs`

Replace bare error mapping in:
- `record_webhook_event` (execute)
- `has_webhook_event` (count)
- `get_transactions_by_telegram_id` (cursor resolve + all)

---

**Verification:** `cargo check -p trios-mb-db`

**Commit:** `security: sanitize DB errors in generation, prompt, subscription, webhook, and transaction functions`

**Estimated scope:** 16 of 18 remaining raw DB error sites eliminated. Leaves `get_generated_images_count` and `get_referral_count` for next wave.
