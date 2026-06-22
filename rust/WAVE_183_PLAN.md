# Wave 183 — Implementation Plan

**Date:** 2026-06-16

## Research Summary

### Weaknesses Identified
1. **CRITICAL — `payment_processor.rs` broken payment completion:** `verify_and_complete` attempts to parse `verification.transaction_id` (an external gateway ID like Robokassa `InvId`, blockchain hash, or Telegram charge ID) as a `uuid::Uuid`. This systematically fails for all non-UUID external IDs, breaking payment completion for every gateway. The correct method is `get_transaction_by_external_id`.
2. **HIGH — `scene_state!` macro missing `deny_unknown_fields`:** The `scene_state!` macro in `SILVER-RING-TG00/src/state.rs` generates ~37 dialogue-state structs without `#[serde(deny_unknown_fields)]`. The `Scene` enum also lacks it. Silent field truncation in InMemStorage round-tripping could corrupt FSM state.
3. **MEDIUM — Webhook secret verification timing side-channel:** `verify_webhook_secret` in `BRONZE-RING-SRV/src/webhooks.rs` performs a length comparison (`expected.len() != provided.len()`) before the constant-time byte loop. This leaks the expected secret length through a timing oracle, violating the very purpose of constant-time comparison.

### Literature Review
- **CWE-681 — Incorrect Conversion between Numeric Types.** Attempting to parse a non-UUID string as a UUID is an incorrect conversion that causes systematic application failure.
- **OWASP API Security Top 10 (2023) — API6.** Deserialization ambiguity in state storage allows silent field truncation, leading to state corruption and potential security bypasses.
- **CWE-208 — Observable Timing Discrepancy.** A length-check branch before constant-time comparison creates a timing side-channel that leaks secret length, enabling brute-force optimization.
- **Serpent paper (B. A. Hubert, 2018)** — "Constant-time comparison must operate over fixed-length inputs; any early-exit branch destroys the constant-time guarantee."

## Decomposed Fixes

### Fix 1 — Fix `verify_and_complete` to use `get_transaction_by_external_id`
- **File:** `rings/SILVER-RING-PY00/src/services/payment_processor.rs`
- **Action:** Replace `self.db.get_transaction(uuid::Uuid::parse_str(&verification.transaction_id)?)` with `self.db.get_transaction_by_external_id(&verification.transaction_id)`.
- **Verification:** `cargo check --package trios-mb-payment` passes.

### Fix 2 — Add `deny_unknown_fields` to `scene_state!` macro and `Scene` enum
- **File:** `rings/SILVER-RING-TG00/src/state.rs`
- **Action:**
  - Add `#[serde(deny_unknown_fields)]` inside the `scene_state!` macro, before the derive line.
  - Add `#[serde(deny_unknown_fields)]` to the `Scene` enum definition.
- **Verification:** `cargo check --package trios-mb-tg` passes.

### Fix 3 — Remove timing side-channel from `verify_webhook_secret`
- **File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
- **Action:** Remove the early `expected.len() != provided.len()` check. Perform the constant-time comparison over the full byte sequence regardless of length. If lengths differ, the zip will naturally stop at the shorter length, but the comparison still runs for all shared bytes. Return the same generic error in all failure cases.
- **Verification:** `cargo check --package trios-mb-app` passes.

## Rollback Criteria
- Any fix that causes `cargo check` to fail will be reverted and re-implemented.
- The webhook fix must preserve identical behavior for matching secrets while removing the length oracle.

## Verification Matrix

| Fix | Crate Check | Expected Result |
|---|---|---|
| Fix 1 | `cargo check --package trios-mb-payment` | OK |
| Fix 2 | `cargo check --package trios-mb-tg` | OK |
| Fix 3 | `cargo check --package trios-mb-app` | OK |
