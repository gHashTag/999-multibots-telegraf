# Wave 211 Plan — Operational Visibility & Resource Exhaustion Hardening

## Theme
Close remaining operational blind spots: oversized webhook payloads, health-endpoint error conflation, and missing distributed-tracing spans on worker lifecycle methods.

## Literature References
1. OWASP DoS Cheat Sheet — "Request Body Size Limits": unbounded body acceptance is the #1 vector for application-layer DoS on webhook endpoints.
2. Google SRE Book, Chapter 6 — Health endpoints must distinguish "degraded" from "unreachable" and log the underlying failure so operators can diagnose root cause.
3. OpenTelemetry Distributed Tracing Specification — every async entry point must carry a span so that latency attribution and causal analysis remain possible across service boundaries.

---

## Fix 1 — Webhook Body Limit Too Lax
### File
`rings/BRONZE-RING-SRV/src/router.rs`
### Weakness
The global `DefaultBodyLimit::max(2 * 1024 * 1024)` applies to **all** routes, including external webhook receivers (`/api/webhooks/replicate`, `/api/webhooks/kie-ai`). Webhook payloads from Replicate/KIE are small JSON blobs (< 10 KB). Allowing 2 MB opens a trivial DoS vector: an attacker can POST a 2 MB payload to a webhook endpoint, forcing the server to allocate and parse it before signature validation even runs.
### Remediation
Add a per-route `.layer(axum::extract::DefaultBodyLimit::max(256 * 1024))` to the webhook sub-router so that oversized payloads are rejected at the Axum body-limit layer **before** reaching the handler.

---

## Fix 2 — Health Endpoint Swallows DB Errors
### File
`rings/BRONZE-RING-SRV/src/health.rs`
### Weakness
`health_check_with_db` matches `state.db.health_check().await` with `_ =>` for the error arm, conflating `Ok(false)` (DB reachable but reporting unhealthy) and `Err(e)` (DB unreachable / query failed). The operator sees `503` in both cases but never learns *why* the DB check failed, because the error is not logged.
### Remediation
Split the match arm:
- `Ok(false)` → `warn!` (DB reachable but unhealthy)
- `Err(e)` → `error!` (DB unreachable / query failed)
Both still return `503`, but the log level and message now match the severity.

---

## Fix 3 — WorkerPool Lifecycle Missing Spans
### File
`rings/SILVER-RING-JB00/src/worker.rs`
### Weakness
`WorkerPool::spawn`, `WorkerPool::register`, and `WorkerPool::shutdown` lack `#[tracing::instrument]`. When a worker pool is spawned during startup, there is no trace span capturing the worker type, concurrency level, or timeout configuration. If a panic or latency spike occurs inside `spawn_traced`, the trace ends at the anonymous task boundary with no parent span linking it to the pool configuration.
### Remediation
Add `#[tracing::instrument(skip(self, ...), fields(...))]` to the three `WorkerPool` methods so that worker lifecycle events are visible in distributed traces.

---

## Decomposition Checklist
- [ ] Fix 1 implemented
- [ ] Fix 2 implemented
- [ ] Fix 3 implemented
- [ ] `cargo check` passes with zero warnings
- [ ] `WAVE_211_REPORT.md` written
- [ ] `wave-211-patterns.md` written
- [ ] `MEMORY.md` updated
- [ ] `skill.md` updated
- [ ] Committed

## Cooperation Variants for Wave 212
1. **Database f64 → Money Migration** — Begin migrating `Database` trait methods (`get_balance`, `deduct_balance`, `add_balance`, `complete_robokassa_payment`) from `f64` to the integer-based `Money` type to eliminate floating-point financial drift.
2. **Secret Cache SecretString Migration** — Migrate `SecretCache` internal storage from `String` to `secrecy::SecretString` so that secret buffers are zeroised on drop.
3. **CSP Header Injection** — Add a `Content-Security-Policy` header to the `edge_hardening` middleware (default `default-src 'none'`) to close the XSS window if a web UI is ever introduced.
