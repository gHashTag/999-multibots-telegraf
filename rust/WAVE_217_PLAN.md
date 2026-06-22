# Wave 217 Security Plan

**Theme:** Connection Pool Lifecycle Hardening, Observability Gaps in Security-Critical Paths
**Date:** 2026-06-16

---

## Fix 1 — Reqwest Connection Pools Lack Idle Timeout

**Severity:** CRITICAL
**Files:** `rings/SILVER-RING-AI00/src/providers/*.rs`, `rings/SILVER-RING-SC00/src/store.rs`, `rings/SILVER-RING-PY00/src/x402.rs`
**Weakness:** Every reqwest client in the codebase sets `pool_max_idle_per_host(10)` but omits `pool_idle_timeout`. The reqwest default is **no idle timeout**, meaning connections can remain in the pool indefinitely. After an API key rotation (e.g., a provider key is revoked and replaced), old connections that were authenticated with the revoked key can linger in the pool and be reused for subsequent requests. This creates a window — potentially hours or days — where a compromised key remains usable.

**Remediation:** Add `.pool_idle_timeout(Duration::from_secs(90))` to every reqwest `Client::builder()` chain. A 90-second idle timeout is conservative: it prevents connection churn while ensuring rotated keys are flushed from the pool within minutes.

**Literature:** reqwest docs (`pool_idle_timeout`); OWASP Transport Layer Protection Cheat Sheet (connection lifecycle management).

---

## Fix 2 — Replicate Provider cancel() Not Instrumented

**Severity:** MEDIUM
**File:** `rings/SILVER-RING-AI00/src/providers/replicate.rs`
**Weakness:** The `ReplicateProvider::cancel()` method (line 301) is the only provider `cancel` implementation that performs actual HTTP work (POST to `/v1/predictions/{id}/cancel`). All other providers' `cancel` methods are no-op stubs. Despite doing real network I/O, `cancel()` lacks `#[tracing::instrument]`, creating a blind spot in distributed traces. If a cancel operation fails or hangs, there is no span to diagnose the issue.

**Remediation:** Add `#[tracing::instrument(skip_all, fields(generation_id = %generation_id))]` to `cancel()`.

**Literature:** OpenTelemetry tracing best practices; "Distributed Systems Observability" (Honeycomb).

---

## Fix 3 — verify_webhook_secret Not Instrumented

**Severity:** MEDIUM
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
**Weakness:** `verify_webhook_secret` performs constant-time comparison of webhook secrets — a security-critical operation. It is not decorated with `#[tracing::instrument]`. While failures are logged by callers, there is no dedicated span for the verification itself. This makes it impossible to:
- Detect timing-attack probes (repeated requests with invalid secrets)
- Correlate secret verification latency with other operations
- Audit webhook authentication events in distributed traces

**Remediation:** Add `#[tracing::instrument(skip_all)]` to `verify_webhook_secret`.

**Literature:** OpenTelemetry security event tracing guidelines; SRE best practices for authentication spans.

---

## Deferred Items
- Hash-then-compare for variable-length webhook secrets (defense-in-depth).
- Bulkhead semaphore per provider in orchestrator dispatch.
- Retry-budget sliding window for provider failures.
