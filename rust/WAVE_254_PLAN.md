# Wave 254 Plan

**Theme:** Webhook logging hardening — truncate externally-controlled payload fields before logging to prevent log flooding and injection.

---

## Fix 1 — Replicate webhook payload truncation (5 sites)

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/GOLD-RING-PR00/src/replicate.rs`

The Replicate webhook handler logs `payload.id` and `payload.status` before validating them. Malicious or malfunctioning providers could send multi-kilobyte strings in these fields, causing log buffer exhaustion.

Replace bare `%payload.id` / `%payload.status` with `truncate_for_log(..., 256)` in:
- `#[tracing::instrument(..., id = %payload.id)]` → `id = %truncate_for_log(&payload.id, 256)`
- `tracing::info!(id = %payload.id, status = %payload.status, ...)` → truncated versions
- `tracing::info!(id = %payload.id, ...)` in output_weights branch
- `tracing::info!(id = %payload.id, ...)` in duplicate-event branch
- `tracing::warn!(id = %self.id, status = %self.status, ...)` in `replicate.rs` output_urls warning

---

## Fix 2 — Kie webhook payload truncation (3 sites)

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

The Kie webhook handler logs `payload.task_id` before validating it as a UUID.

Replace bare `?payload.task_id` with `truncate_for_log(..., 256)` in:
- `#[tracing::instrument(..., task_id = ?payload.task_id)]` → `task_id = %truncate_for_log(...)`
- `tracing::info!(task_id = %..., ...)` in webhook-received log
- `tracing::info!(task_id = %..., ...)` in duplicate-event log

---

## Fix 3 — Instrument URL validation helper

**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

Add `#[tracing::instrument(skip_all)]` to `validate_result_url`.

**Why:** This helper is called on every successful webhook before persisting a result URL. Instrumentation improves traceability of SSRF rejection decisions, directly supporting OWASP A09:2021 (Security Logging and Monitoring Failures).

---

**Verification:** `cargo check -p trios-mb-server --target aarch64-apple-darwin`

**Commit:** `security: truncate webhook payload fields before logging, instrument URL validator (Wave 254)`
