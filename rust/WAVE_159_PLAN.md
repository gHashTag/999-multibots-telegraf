# Wave 159 Security Plan

**Date:** 2026-06-16
**Objective:** Fix CRITICAL and HIGH findings from autonomous audit + literature review

---

## Literature Review

1. **TOCTOU in Database Operations** — CVE-2023-45142, OWASP TOCTOU Cheat Sheet. SELECT-then-UPDATE patterns create race windows. Atomic `UPDATE ... WHERE balance >= $1` eliminates the window.
2. **SQL Injection via Parameterized Queries** — OWASP SQL Injection Prevention Cheat Sheet. PostgreSQL does not substitute `$N` inside string literals (e.g., `INTERVAL '$1 seconds'`). Use expression-based intervals: `INTERVAL '1 second' * $1`.
3. **Silent Fail-Open Defaults** — NIST SP 800-53 Rev 5 (SI-10). Functions that map strings to enums must fail closed (return error) on unrecognized input, not default to a "safe" value. Defaulting hides data corruption and injection.
4. **Webhook Integrity** — Stripe Webhook Security Best Practices. Callback verification must use the same identifier that the payment creation stored. Parsing an external provider ID as an internal UUID will always fail.
5. **Secret Materialization** — OWASP Secrets Management Cheat Sheet. `std::env::var` materializes secrets as `String` on the stack, exposing them in core dumps and debug logs. Use `secrecy::SecretString`.
6. **CORS Misconfiguration** — OWASP CORS Cheat Sheet. Falling back to `allow_origin(Any)` when configuration is missing enables cross-origin attacks from any domain.
7. **Input Validation at Boundaries** — NIST Cybersecurity Framework PR.IP-2. Reject negative amounts, zero/negative IDs, and unbounded limits at the repository boundary, not relying on callers.

---

## Phase 1 — CRITICAL: Silent Failures & Data Integrity

1. **Fix `retry_stuck` SQL syntax** (`SILVER-RING-JB00/src/queue.rs`)
   - Replace `INTERVAL '$1 seconds'` with `NOW() - INTERVAL '1 second' * $1`
2. **Fix `str_to_media_type` and `str_to_generation_status`** (`SILVER-RING-DB00/src/repository.rs`)
   - Return `Result<MediaType, DbError>` and `Result<GenerationStatus, DbError>`
   - Propagate errors to callers instead of defaulting to `Image` / `Queued`
3. **Fix worker using wrong UUID** (`BRONZE-RING-APP/src/main.rs`)
   - Include `generation_id` in `GenerationRequest` or enqueue it alongside
   - Use the generation UUID (not `job.id`) in `update_generation_status`
4. **Fix Robokassa webhook transaction lookup** (`BRONZE-RING-SRV/src/payment_webhooks.rs`)
   - Add `get_transaction_by_external_id(&self, external_id: &str) -> Result<Option<Transaction>, AppError>` to `Database` trait
   - Look up transaction by `external_id` (the Robokassa `InvId`) instead of parsing as UUID

## Phase 2 — HIGH: Input Validation at Repository Boundary

5. **Add `amount >= 0` guard to `add_balance`** (`SILVER-RING-DB00/src/repository.rs`)
6. **Add `telegram_id > 0` guard to `create_user`** (`SILVER-RING-DB00/src/repository.rs`)
7. **Add `safe_limit` to `get_transactions_by_telegram_id`** (`SILVER-RING-DB00/src/repository.rs`)
8. **Add `telegram_id > 0` guard in `handle_generation_job`** (`BRONZE-RING-APP/src/main.rs`)

## Phase 3 — HIGH: Secret Hygiene & CORS Hardening

9. **Migrate `AppConfig` secrets to `SecretString`** (`GOLD-RING-TY00/src/config.rs`)
   - `infisical_client_secret`, `database_url`
   - Derive `Debug` manually to redact secrets
10. **Remove CORS `Any` fallback** (`BRONZE-RING-SRV/src/router.rs`)
    - When `FRONTEND_URL` is empty or all origins invalid, deny all instead of allowing `Any`

## Phase 4 — HIGH: Worker Supervision & Tracing

11. **Wrap worker tasks with panic supervision** (`SILVER-RING-JB00/src/worker.rs`)
    - Use `AssertUnwindSafe(...).catch_unwind()` + restart loop
12. **Add `#[tracing::instrument]` to key handlers** (select critical scene handlers)

## Phase 5 — MEDIUM: Provider Redirect Policy & Serialization Safety

13. **Add `.redirect(Policy::none())` to provider reqwest clients** (8 provider files)
14. **Fix `update_transaction_status` serialization** — propagate error instead of `unwrap_or_default`

---

## Success Criteria

- `cargo check --target aarch64-apple-darwin` passes
- `cargo test` passes (or existing tests don't regress)
- All CRITICAL items verified with code inspection
- Report written with verification, deferred items, and 3 cooperation options
