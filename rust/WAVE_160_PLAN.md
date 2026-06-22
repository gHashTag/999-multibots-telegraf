# Wave 160 Security Plan

**Date:** 2026-06-16
**Objective:** Fix CRITICAL and HIGH findings from autonomous audit + literature review

---

## Literature Review

1. **Negative Amount Injection** — CWE-682, CWE-20. Financial functions that accept negative inputs can be exploited to inflate balances (`balance - (-100) = balance + 100`). Every monetary parameter must be validated `> 0` at the boundary.
2. **Silent Enum Defaulting** — NIST SP 800-53 SI-10. Similar to Wave 159's `str_to_media_type` fix. `unwrap_or_default()` on `Language::from_code` hides DB corruption. The same applies to `serde_json::from_str` on transaction rows.
3. **Terminal State Overwrites** — Stripe Webhook Best Practices. Webhooks must be idempotent: processing a `completed` event for a resource already in `completed`/`failed`/`cancelled` must be a no-op. Otherwise retries/replays corrupt state.
4. **Resource Limits on Free-Text Storage** — CWE-770. Saving unbounded user input to the DB without length caps creates a DoS vector (table bloat, replication lag, backup size explosion).
5. **Input Validation Depth** — OWASP Input Validation Cheat Sheet. Substring checks (`contains("127.")`) are bypassable via encoding, DNS rebinding, and credential embedding. Proper URL parsing with a whitelist is required for robust SSRF prevention.
6. **Secret Redaction in Debug** — OWASP Secrets Management. Even "less sensitive" fields like `client_id` aid reconnaissance. All credential-adjacent fields should be redacted.

---

## Phase 1 — CRITICAL: Financial Injection + Ephemeral State

1. **Add `amount > 0` guard to `deduct_balance`** (`SILVER-RING-DB00/src/repository.rs`)
2. **Document `InMemStorage` as deferred Redis migration** (`SILVER-RING-TG00/src/dispatcher.rs`)

## Phase 2 — HIGH: Silent Failures + Terminal State Guards

3. **Webhook terminal-state guard** (`BRONZE-RING-SRV/src/webhooks.rs`)
   - Load current generation status before updating
   - Reject updates if DB status is already `Completed`/`Failed`/`Cancelled`
4. **Transaction deserialization fail-closed** (`SILVER-RING-DB00/src/repository.rs`)
   - Replace `unwrap_or(PaymentMethod::TelegramStars)` / `unwrap_or(PaymentStatus::Pending)` with `map_err` + propagate
5. **`save_prompt` length cap** (`SILVER-RING-DB00/src/repository.rs`)
   - Reject prompts > 2000 chars
6. **`get_user_by_telegram_id` language fail-closed** (`SILVER-RING-DB00/src/repository.rs`)
   - Return `Err` on unknown language code instead of defaulting to `Ru`
7. **`validate_result_url` length + punycode guard** (`BRONZE-RING-SRV/src/webhooks.rs`)
   - Add max length 4096
   - Reject URLs containing `%` (hex escape indicator) and `@` (credential embedding)
8. **`AppConfig::Debug` redact `infisical_client_id`** (`GOLD-RING-TY00/src/config.rs`)

## Phase 3 — MEDIUM: Tracing Instrumentation

9. **Add `#[tracing::instrument]` to critical handlers**
   - `replicate_webhook`, `kie_ai_webhook` (already have it)
   - `robokassa_callback`
   - `health_check`, `health_check_with_db`
   - Top 5 generation handlers in `SILVER-RING-SN00`

## Phase 4 — LOW: Error Handling Improvements

10. **`start.rs` distinguish `Ok(None)` from `Err`** (`SILVER-RING-SN00/src/start.rs`)
    - Only call `create_user` on `Ok(None)`, not on `Err`

---

## Success Criteria

- `cargo check --target aarch64-apple-darwin` passes
- All CRITICAL + HIGH items verified with code inspection
- Report written with verification, deferred items, and 3 cooperation options
