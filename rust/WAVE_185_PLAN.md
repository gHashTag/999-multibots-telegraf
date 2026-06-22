# Wave 185 — Implementation Plan

**Date:** 2026-06-16

## Research Summary

### Weaknesses Identified
1. **CRITICAL — Startup panics in `access.rs`:** `load_mandatory_i64` and `load_optional_id_list` in `SILVER-RING-TG00/src/access.rs` call `panic!` via `unwrap_or_else` when environment variables are missing or contain invalid integers. These back `LazyLock` statics, so a misconfigured env var crashes the bot at first access rather than failing gracefully.
2. **HIGH — Callback handlers dispatch empty jobs after TTL expiry:** `handle_text_to_image_callback`, `handle_text_to_video_callback`, and `handle_neuro_photo_callback` call `dispatch_and_reply` without verifying that required `Option` state fields (`prompt`, `image_url`, `model`) are `Some`. If `InMemStorage` TTL expires between steps, the state resets to default, and `dispatch_and_reply` passes `None` to the job queue — after already deducting the user's balance.
3. **MEDIUM — Unbounded strings in DB insert/update operations:** `create_generation` stores `prompt` without length validation (despite `save_prompt` capping at 2000). `update_generation_status` and `update_generation_status_owned` store `result_url` and `error` without length caps, allowing arbitrarily large strings into the database.

### Literature Review
- **CWE-392 — Missing Report of Error Condition.** Functions that fail silently or crash prevent operators from diagnosing configuration problems. Returning sentinel values with error logging is the standard graceful-degradation pattern.
- **CWE-681 — Incorrect Conversion between Numeric Types / CWE-391 — Unchecked Error Condition.** Parsing environment variables without handling errors causes runtime panics instead of controlled failure.
- **OWASP API Security Top 10 (2023) — API6: Unrestricted Access to Sensitive Business Flows.** Dispatching jobs with empty/invalid parameters after state expiry bypasses business-logic validation, consumes user balance, and produces invalid output.
- **CWE-20 — Improper Input Validation.** Storing unbounded strings in the database from external sources (webhook callbacks, provider responses) violates the principle of rejecting malformed input at the boundary.

## Decomposed Fixes

### Fix 1 — Replace panics with graceful error handling in `access.rs`
- **File:** `rings/SILVER-RING-TG00/src/access.rs`
- **Action:**
  - `load_mandatory_i64`: Replace `panic!` with `tracing::error!` + return `0` (sentinel value that won't match any real user ID)
  - `load_optional_id_list`: Replace `panic!` with `tracing::warn!` + skip the invalid value (return the rest of the list)
- **Verification:** `cargo check --package trios-mb-tg` passes

### Fix 2 — Add TTL guards to dispatching callback handlers
- **Files:** `rings/SILVER-RING-SN00/src/text_to_image.rs`, `text_to_video.rs`, `neuro_photo.rs`
- **Action:** Before each `dispatch_and_reply` call in the callback handlers, verify required `Option` fields are `Some`. If `None`, send a "Session expired" message and return the user to the main menu. Do NOT deduct balance or dispatch the job.
- **Verification:** `cargo check --package trios-mb-scenes` passes

### Fix 3 — Add length caps to DB insert/update operations
- **File:** `rings/SILVER-RING-DB00/src/repository.rs`
- **Action:**
  - `create_generation`: truncate or reject `prompt` if > 2000 characters (same cap as `save_prompt`)
  - `update_generation_status` and `update_generation_status_owned`: truncate `result_url` to 4096 and `error` to 1024 characters
- **Verification:** `cargo check --package trios-mb-db` passes

## Rollback Criteria
- Any fix that causes `cargo check` to fail will be reverted and re-implemented
- TTL guards must not break legitimate callback flows where state is correctly populated
- Length caps must not truncate legitimate provider output

## Verification Matrix

| Fix | Crate Check | Expected Result |
|---|---|---|
| Fix 1 | `cargo check --package trios-mb-tg` | OK |
| Fix 2 | `cargo check --package trios-mb-scenes` | OK |
| Fix 3 | `cargo check --package trios-mb-db` | OK |
