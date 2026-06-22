# Wave 254 Report

**Date:** 2026-06-16
**Theme:** Webhook logging hardening — truncate externally-controlled payload fields before logging to prevent log flooding and injection.

---

## Fix 1 — Replicate webhook payload truncation (5 sites)

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/GOLD-RING-PR00/src/replicate.rs`

The Replicate webhook handler logs `payload.id` and `payload.status` before validating them. A malicious or malfunctioning provider could send multi-kilobyte strings in these fields, causing log buffer exhaustion or disk-space DoS.

Replaced bare `%payload.id` / `%payload.status` with `truncate_for_log(..., 256)` in:
- `#[tracing::instrument]` field: `id = %truncate_for_log(&payload.id, 256)`
- Initial `tracing::info!`: both `id` and `status` truncated
- `output_weights` branch `tracing::info!`: `id` truncated
- Duplicate-event `tracing::info!`: `id` truncated
- Idempotency timeout/error `tracing::warn!`/`tracing::error!`: `id` truncated
- `replicate.rs` `output_urls()` warning: `id` and `status` truncated

**Why:** Webhook payloads are untrusted external input. Logging them without bounds is a log-injection / DoS vector (CWE-117, OWASP A09:2021).

---

## Fix 2 — Kie webhook payload truncation (4 sites)

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

The Kie webhook handler logged `payload.task_id` in `#[tracing::instrument]` before validating it as a UUID.

Replaced bare `?payload.task_id` with `truncate_for_log(payload.task_id.as_deref().unwrap_or(""), 256)` in:
- `#[tracing::instrument]` field
- Duplicate-event `tracing::info!`
- Idempotency error `tracing::error!`
- Idempotency timeout `tracing::warn!`

**Why:** Same log-flooding risk as Fix 1. The `tracing::instrument` macro evaluates fields before the handler body runs, so a long `task_id` would be logged even if the handler later rejects it.

---

## Fix 3 — Instrument URL validation helper

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

Added `#[tracing::instrument(skip_all)]` to `validate_result_url`.

**Why:** This helper is called on every successful webhook before persisting a result URL. Instrumentation improves traceability of SSRF rejection decisions, directly supporting OWASP A09:2021 (Security Logging and Monitoring Failures).

---

## Verification

- `cargo check -p trios-mb-proto --target aarch64-apple-darwin` ✅ clean, zero warnings
- `cargo check -p trios-mb-server --target aarch64-apple-darwin` ✅ clean, zero warnings

---

## Next-wave cooperation variants

1. **Worker error log truncation** — Audit `worker.rs` and `orchestrator.rs` for any `tracing::error!` / `tracing::warn!` that log raw provider error bodies or job payloads without `truncate_for_log`.
2. **Startup secret loading instrumentation** — Add `#[tracing::instrument]` to `load_webhook_secret` in `router.rs` and `load_mandatory_i64`/`load_optional_id_list` in `access.rs` to improve startup observability.
3. **Payment gateway reqwest response logging** — Check `x402.rs`, `ton.rs`, and `telegram_stars.rs` for any unguarded response body logging that could leak provider tokens or large payloads.
