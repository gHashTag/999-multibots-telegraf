# Wave 217 Security Report

**Theme:** Connection Pool Lifecycle Hardening, Observability Gaps in Security-Critical Paths
**Date:** 2026-06-16
**Scope:** 11 reqwest client constructors, ReplicateProvider::cancel, verify_webhook_secret.

---

## Executive Summary

Three operational-security and observability gaps were closed. Every reqwest HTTP client in the codebase now enforces a 90-second idle timeout on pooled connections, preventing indefinitely lingering connections that could reuse revoked API keys after rotation. The Replicate provider's `cancel` method — the only provider whose `cancel` performs actual HTTP work — is now instrumented with `#[tracing::instrument]`. The webhook secret verifier, a security-critical function that performs constant-time comparison, is also now instrumented.

---

## Fix 1 — Reqwest Connection Pools Lack Idle Timeout

**Files:** `rings/SILVER-RING-AI00/src/providers/{replicate,fal,kie,openai,elevenlabs,heygen,hedra,midjourney}.rs`, `rings/SILVER-RING-SC00/src/store.rs`, `rings/SILVER-RING-PY00/src/x402.rs`

**Weakness:** All 11 reqwest client constructors set `pool_max_idle_per_host(10)` but omitted `pool_idle_timeout`. The reqwest default is **no idle timeout** — connections can remain in the pool indefinitely. After an API key rotation (e.g., a provider revokes a leaked key and issues a replacement), old connections that were authenticated with the revoked key can linger and be reused for subsequent requests. This creates a window — potentially hours or days — where a compromised key remains usable.

**Remediation:** Added `.pool_idle_timeout(Duration::from_secs(90))` to every reqwest `Client::builder()` chain. A 90-second idle timeout is conservative: it prevents connection churn while ensuring rotated keys are flushed from the pool within minutes.

```rust
// BEFORE (vulnerable — connections linger forever)
let http = reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .connect_timeout(Duration::from_secs(10))
    .redirect(reqwest::redirect::Policy::none())
    .pool_max_idle_per_host(10)
    .build()?;

// AFTER (hardened — idle connections evicted after 90s)
let http = reqwest::Client::builder()
    .timeout(Duration::from_secs(120))
    .connect_timeout(Duration::from_secs(10))
    .redirect(reqwest::redirect::Policy::none())
    .pool_max_idle_per_host(10)
    .pool_idle_timeout(Duration::from_secs(90))
    .build()?;
```

**Impact:** After key rotation, any idle connection in the pool will be evicted within 90 seconds. Active connections are unaffected until they return to the pool.

**Literature:** reqwest crate docs (`pool_idle_timeout`); OWASP Transport Layer Protection Cheat Sheet (connection lifecycle management); "High Performance Browser Networking" (Ilya Grigorik), Chapter 11 — connection pool tuning.

---

## Fix 2 — Replicate Provider cancel() Not Instrumented

**File:** `rings/SILVER-RING-AI00/src/providers/replicate.rs`

**Weakness:** `ReplicateProvider::cancel()` is the only provider `cancel` implementation that performs actual HTTP work (POST to `/v1/predictions/{id}/cancel`). All other providers' `cancel` methods are no-op stubs that immediately return an error. Despite making real network I/O, `cancel()` lacked `#[tracing::instrument]`, creating a blind spot in distributed traces. If a cancel operation fails or hangs, there is no span to diagnose the issue.

**Remediation:**
```rust
#[tracing::instrument(skip_all, fields(generation_id = %generation_id))]
async fn cancel(&self, generation_id: &str) -> Result<(), AppError> {
```

**Impact:** Cancel operations now generate spans with the `generation_id` field, enabling trace-based debugging and latency analysis.

**Literature:** OpenTelemetry tracing best practices; Honeycomb, "Distributed Systems Observability".

---

## Fix 3 — verify_webhook_secret Not Instrumented

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

**Weakness:** `verify_webhook_secret` performs constant-time comparison of webhook secrets — a security-critical authentication step. It had no `#[tracing::instrument]` decoration. While callers logged failures, there was no dedicated span for the verification itself. This made it impossible to:
- Detect timing-attack probes (repeated requests with invalid secrets)
- Correlate secret verification latency with other operations
- Audit webhook authentication events in distributed traces

**Remediation:**
```rust
#[tracing::instrument(skip_all)]
fn verify_webhook_secret(headers: &HeaderMap, expected: &secrecy::SecretString) -> Result<(), (StatusCode, String)> {
```

**Impact:** Each webhook secret verification now generates a span. Security teams can query traces for repeated `verify_webhook_secret` failures as a signal of probing activity.

**Literature:** OpenTelemetry security event tracing guidelines; SRE best practices for authentication spans.

---

## Metrics

- Reqwest client pool idle timeouts added: 11 constructors across 10 files
- Provider methods instrumented: 1 (`ReplicateProvider::cancel`)
- Security-critical functions instrumented: 1 (`verify_webhook_secret`)
- Compilation warnings: 0
- Errors introduced: 0

---

## Cooperation Variants for Wave 218

1. **Hash-Then-Compare for Variable-Length Webhook Secrets** — Implement defense-in-depth for webhook secret verification: hash both expected and provided secrets with SHA-256 using a fixed salt, then compare 32-byte digests with `subtle::ct_eq`. This eliminates even `subtle`'s internal length branch because both sides are always the same fixed size. The salt can be a per-instance random value generated at startup and stored in `AppState`.

2. **Provider reqwest Client Builder Centralisation** — The reqwest client construction pattern (`timeout`, `connect_timeout`, `redirect`, `pool_max_idle_per_host`, `pool_idle_timeout`) is duplicated identically across 11 constructors. Extract a `build_provider_client(timeout_secs)` helper in `trios_mb_ai::providers::mod` that enforces the hardening policy centrally, preventing regressions when new providers are added.

3. **Circuit Breaker State Export for Health Checks** — The orchestrator maintains circuit-breaker states in an `Arc<RwLock<HashMap<String, CircuitBreaker>>>`. Add a read-only `circuit_breaker_summary()` method that returns the state (Closed, Open, HalfOpen) and last-failure timestamp for each provider. Wire this into the `/health` endpoint so load balancers can drain traffic from the app when too many circuits are open.
