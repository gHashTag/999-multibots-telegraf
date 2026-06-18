# Wave 186 — Implementation Plan

**Date:** 2026-06-16

## Research Summary

### Weaknesses Identified
1. **CRITICAL — Payment webhook idempotency cache poisoning (business-logic bypass):** In `BRONZE-RING-SRV/src/payment_webhooks.rs`, the idempotency guard `record_webhook_event("robokassa", &form.inv_id)` runs **before** `gateway.verify_callback()`. Robokassa callbacks have no pre-verification secret header. An attacker can POST a forged callback with a target `inv_id` and an invalid signature; the request fails signature verification but permanently poisons the idempotency slot. When the legitimate Robokassa callback later arrives with the same `inv_id`, it is deduplicated and skipped, so the user never receives payment credit.
2. **HIGH — Info disclosure in Telegram bot error messages:** In `SILVER-RING-SN00/src/generation_utils.rs`, `dispatch_and_reply` formats raw `AppError` values directly into Telegram chat messages. `AppError` can carry AI provider HTTP response bodies (up to 64KB), internal DB error strings, or serialization failure details. An end user who triggers a `db.create_generation` or `job_queue.enqueue` failure receives the full internal error text.
3. **HIGH — Missing authorization on admin-only Telegram scenes:** `InstagramScraping` and `InstagramParser` are registered in `SceneRegistry` with `AccessLevel::Admin`, yet neither handler calls `has_parsing_access()` or any other authorization check. A non-admin user can navigate to these scenes by replaying a crafted `nav:instagram_scraping` or `nav:instagram_parser` callback query and use admin-restricted features.

### Literature Review
- **CWE-807 — Reliance on Untrusted Inputs in a Security Decision.** The idempotency guard trusts the `inv_id` from an unverified callback, making a security decision (deduplication) before the signature is validated.
- **CWE-209 — Information Exposure Through an Error Message.** Raw `AppError` strings leaked to end users expose internal state (file paths, SQL errors, stack frames, provider response bodies).
- **CWE-862 — Missing Authorization.** Registered access levels are not enforced at the handler entry point, allowing unauthorized users to access admin-only functionality.

## Decomposed Fixes

### Fix 1 — Move signature verification before idempotency guard in Robokassa webhook
- **File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
- **Action:** Reorder the handler so that `gateway.verify_callback()` runs **before** `record_webhook_event()`. Only after the signature is verified and the callback is confirmed legitimate should the idempotency slot be consumed.
- **Verification:** `cargo check --package trios-mb-app` passes

### Fix 2 — Sanitize error messages before sending to Telegram users
- **File:** `rings/SILVER-RING-SN00/src/generation_utils.rs`
- **Action:** Replace `format!("❌ Error: {}", e)` with a generic localized error message that does not include the raw `AppError` text. Log the full error internally via `tracing::error!` but send only a generic "Something went wrong, please try again" message to the user.
- **Verification:** `cargo check --package trios-mb-scenes` passes

### Fix 3 — Add authorization checks to admin-only Instagram handlers
- **Files:** `rings/SILVER-RING-SN00/src/instagram_scraping.rs`, `instagram_parser.rs`
- **Action:** Add `trios_mb_tg::access::has_parsing_access()` check at the start of each handler. If the user is not authorized, send an access-denied message and return them to the main menu.
- **Verification:** `cargo check --package trios-mb-scenes` passes

## Rollback Criteria
- Any fix that causes `cargo check` to fail will be reverted and re-implemented
- Webhook reordering must preserve all existing validation (length caps, amount parsing)

## Verification Matrix

| Fix | Crate Check | Expected Result |
|---|---|---|
| Fix 1 | `cargo check --package trios-mb-app` | OK |
| Fix 2 | `cargo check --package trios-mb-scenes` | OK |
| Fix 3 | `cargo check --package trios-mb-scenes` | OK |
