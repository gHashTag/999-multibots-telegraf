# Wave 211 Security Report

**Theme:** Operational Visibility & Resource Exhaustion Hardening
**Date:** 2026-06-16
**Scope:** Webhook DoS prevention, health endpoint observability, worker lifecycle tracing.

---

## Executive Summary
Three operational blind spots were closed: webhook endpoints now reject oversized payloads before parsing, health endpoints distinguish and log DB degradation vs. disconnection, and worker lifecycle methods carry distributed-tracing spans.

---

## Fix 1 — Webhook Body Limit Too Lax
**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Weakness:** Global `DefaultBodyLimit::max(2 * 1024 * 1024)` applied to all routes, including webhook receivers. External attackers could POST 2 MB payloads to `/api/webhooks/*`, forcing allocation and JSON parsing before signature validation.
**Remediation:** Added `.layer(axum::extract::DefaultBodyLimit::max(256 * 1024))` to the webhook sub-router in both `create_router` and `create_router_with_payments`. Oversized payloads are rejected at the Axum layer before reaching the handler.
**Impact:** Closes a trivial application-layer DoS vector on webhook endpoints.

---

## Fix 2 — Health Endpoint Swallows DB Errors
**File:** `rings/BRONZE-RING-SRV/src/health.rs`
**Weakness:** `health_check_with_db` used `_ =>` for the error arm, conflating `Ok(false)` (DB reachable but unhealthy) and `Err(e)` (DB unreachable / query failed). Neither case was logged, leaving operators guessing why the health check returned 503.
**Remediation:** Split the match:
- `Ok(false)` → `warn!` with body `{"db": "unhealthy"}`
- `Err(e)` → `error!` with body `{"db": "disconnected"}`
Both return `503`, but the log level and response body now reflect the actual severity.
**Impact:** Operators can now correlate 503 responses with precise DB-state logs.

---

## Fix 3 — WorkerPool Lifecycle Missing Spans
**File:** `rings/SILVER-RING-JB00/src/worker.rs`
**Weakness:** `WorkerPool::new`, `register`, `spawn`, and `shutdown` lacked `#[tracing::instrument]`. Worker pool startup and registration were invisible in distributed traces, complicating root-cause analysis when a worker task panicked or stalled.
**Remediation:** Added `#[tracing::instrument(skip_all)]` to all four methods, with `fields(job_type = %job_type.as_str())` on `register` and `fields(handlers = self.handlers.len())` on `spawn`.
**Impact:** Worker lifecycle events are now visible in traces, enabling latency attribution from pool creation to job execution.

---

## Metrics
- DoS vectors closed: 1 (webhook body limit)
- Observability gaps closed: 2 (health error conflation, worker tracing)
- Compilation warnings: 0

---

## Cooperation Variants for Wave 212
1. **Database f64 → Money Migration** — Begin migrating `Database` trait methods (`get_balance`, `deduct_balance`, `add_balance`, `complete_robokassa_payment`) from `f64` to the integer-based `Money` type to eliminate floating-point financial drift.
2. **Secret Cache SecretString Migration** — Migrate `SecretCache` internal storage from `String` to `secrecy::SecretString` so that secret buffers are zeroised on drop.
3. **CSP Header Injection** — Add a `Content-Security-Policy` header to the `edge_hardening` middleware (default `default-src 'none'`) to close the XSS window if a web UI is ever introduced.
