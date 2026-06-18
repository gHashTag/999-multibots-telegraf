# Wave 182 — Implementation Plan

**Date:** 2026-06-16

## Research Summary

### Weaknesses Identified
1. **GOLD-RING-TR00 deserialization gaps:** 5 structs (`Job`, `JobStatus`, `EnqueueRequest`, `PaymentInit`, `PaymentVerification`) lack `#[serde(deny_unknown_fields)]`. These are trait definitions used for job-queue and payment-gateway serialization. Silent field truncation could cause job/payment state mismatches.
2. **Robokassa webhook unbounded strings:** `RobokassaCallbackForm` in `BRONZE-RING-SRV/src/payment_webhooks.rs` deserializes untrusted form-data fields (`inv_id`, `signature_value`, `out_sum`) without per-field length caps. The global 2 MB body limit is the only boundary.
3. **Server-error info disclosure:** `edge_hardening` middleware in `router.rs` sanitizes 4xx client-error bodies but leaves 5xx server-error bodies untouched. Internal panics, DB errors, or stack traces can leak to the client.

### Literature Review
- **CWE-20** — Improper Input Validation. Unbounded strings from external webhooks violate the principle of rejecting malformed input at the boundary.
- **CWE-209** — Information Exposure Through an Error Message. Returning raw 5xx bodies to clients exposes internal state (file paths, SQL errors, stack frames) that aids reconnaissance.
- **OWASP API Security Top 10 (2023) — API6: Unrestricted Access to Sensitive Business Flows**. Deserialization ambiguity (missing `deny_unknown_fields`) allows attackers to craft payloads that appear valid but silently drop critical fields, bypassing business-logic checks.
- **Serde `deny_unknown_fields` documentation** — "If this attribute is set, then the deserializer will reject unknown fields." This is the canonical defense against silent truncation in Rust HTTP APIs.

## Decomposed Fixes

### Fix 1 — `deny_unknown_fields` on GOLD-RING-TR00 structs (5 items, 2 files)
- **Files:** `rings/GOLD-RING-TR00/src/job_queue.rs`, `payment_gateway.rs`
- **Structs:** `Job`, `JobStatus`, `EnqueueRequest`, `PaymentInit`, `PaymentVerification`
- **Action:** Add `#[serde(deny_unknown_fields)]` to each Deserialize struct/enum.
- **Verification:** `cargo check --package trios-mb-traits` passes.

### Fix 2 — Length caps on `RobokassaCallbackForm` fields
- **File:** `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`
- **Fields:**
  - `inv_id` ≤ 128 bytes
  - `signature_value` ≤ 512 bytes
  - `out_sum` ≤ 32 bytes
- **Action:** Add length validation immediately after deserialization, before any processing. Return `400 Bad Request` if any field exceeds its cap.
- **Verification:** `cargo check --package trios-mb-app` passes.

### Fix 3 — Extend body sanitization to 5xx server errors in `edge_hardening`
- **File:** `rings/BRONZE-RING-SRV/src/router.rs`
- **Action:** Change the condition from `code.is_client_error()` to `code.is_client_error() || code.is_server_error()`, preserving the `TOO_MANY_REQUESTS` exemption.
- **Verification:** `cargo check --package trios-mb-app` passes.

## Rollback Criteria
- Any fix that causes `cargo check` to fail will be reverted and re-implemented.
- Webhook length caps must not break legitimate Robokassa callbacks (fields are well within real-world sizes).
- 5xx sanitization must not suppress health-check endpoints that legitimately return structured error bodies.

## Verification Matrix

| Fix | Crate Check | Expected Result |
|---|---|---|
| Fix 1 | `cargo check --package trios-mb-traits` | OK |
| Fix 2 | `cargo check --package trios-mb-app` | OK |
| Fix 3 | `cargo check --package trios-mb-app` | OK |
