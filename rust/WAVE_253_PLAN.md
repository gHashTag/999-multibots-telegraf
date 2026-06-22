# Wave 253 Plan

**Theme:** Complete DB error sanitization pass, add numeric format validation to payment webhooks, and improve provider observability.

---

## Fix 1 — Final DB error sanitization (2 sites)

**Files:** `rings/SILVER-RING-DB00/src/repository.rs`

Replace remaining bare `map_err(|e| AppError::Db(...Query(e.to_string())))` with `sanitize_db_error("<op>", e)` in:
- `get_generated_images_count`
- `get_referral_count`

This completes the repository-wide DB error sanitization pass (all ~40 raw sites eliminated).

---

## Fix 2 — Robokassa `inv_id` numeric format validation

**Files:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`

After the length check (`inv_id.len() > MAX_INV_ID_LEN`), add a format check that rejects `inv_id` containing non-digit characters. Robokassa invoice IDs are strictly numeric; non-numeric input could indicate injection attempts or malformed callbacks.

---

## Fix 3 — Provider helper observability

**Files:** `rings/SILVER-RING-AI00/src/providers/mod.rs`

Add `#[tracing::instrument]` to:
- `read_error_body` (`skip_all`)
- `parse_json_limited` (`skip(resp), fields(provider = %provider, max_bytes)`)

These helpers are called from every provider on error/success paths; instrumentation improves incident traceability (OWASP A09:2021 — Security Logging and Monitoring Failures).

---

**Verification:** `cargo check -p trios-mb-db --target aarch64-apple-darwin && cargo check -p trios-mb-srv --target aarch64-apple-darwin && cargo check -p trios-mb-ai --target aarch64-apple-darwin`

**Commit:** `security: finalize DB error sanitization, add inv_id format validation, instrument provider helpers (Wave 253)`
