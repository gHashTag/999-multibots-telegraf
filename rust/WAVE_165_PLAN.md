# Wave 165 Security Plan

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** HTTP edge hardening, CORS correctness, server supervision, webhook resilience

---

## Scientific Literature

- **OWASP API8:2023 — Security Misconfiguration** ([OWASP](https://owasp.org/API-Security/editions/2023/en/0xa8-security-misconfiguration/))  
  CORS misconfiguration is a top-10 API risk. Permissive defaults (`Access-Control-Allow-Origin: *`) allow arbitrary cross-origin requests with authenticated headers, enabling data exfiltration from victim browsers.

- **JFrog Security Research — CVE-2022-3212** ([JFrog](https://research.jfrog.com/vulnerabilities/axum-core-dos/))  
  `axum-core` ≤ 0.2.7 had a DoS because `Bytes::from_request` did not enforce a default body limit. An attacker could send an oversized `Content-Length` and crash the process via OOM. Even though Axum now defaults to 2 MB, explicit per-route or per-router limits are recommended for untrusted traffic (e.g., public webhooks).

- **HALURust: Exploiting Hallucinations of Large Language Models to Detect Vulnerabilities in Rust** (arXiv 2025)  
  Explicitly treats **Input Validation** (CWE-20) as a primary vulnerability class in Rust codebases. Highlights that framework defaults (e.g., CORS, body limits) are often trusted blindly, leading to exploitable misconfigurations.

- **ICSE 2025 — Prompt-to-SQL Injections in LLM-Integrated Web Applications** ([IEEE/ACM](https://www.dpss.inesc-id.pt/~dcastro/assets/pdf/ICSE2025.pdf))  
  Demonstrates that even modern web apps with parameterised queries remain vulnerable when input reaches LLM pipelines. Reinforces the need for strict length limits, type validation, and fail-closed deserialization at every ingestion point.

---

## Task Breakdown

### #153 (CRITICAL) — CORS Deny-All Fallback Fix
**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Problem:** When `FRONTEND_URL` is not set, the code logs `"CORS requests denied"` but actually constructs a `CorsLayer::new()` without restricting `allow_origin`. In `tower-http` 0.5 the default is `AllowOrigin::Any`, so any origin can issue cross-origin requests with `Authorization` headers.  
**Fix:** Explicitly set `allow_origin(tower_http::cors::AllowOrigin::list(Vec::new()))` in the empty-branch so that no origin matches and the browser blocks the request.

### #154 (CRITICAL) — HTTP Server Supervision
**File:** `rings/BRONZE-RING-APP/src/main.rs`  
**Problem:** The Axum HTTP server task is spawned with raw `tokio::spawn`. A panic in any middleware, extractor, or handler would kill the listener task permanently with no restart.  
**Fix:** Wrap the `server_handle` spawn in the existing `spawn_traced` helper (with appropriate description string) so panics trigger exponential backoff restart.

### #155 (HIGH) — Webhook Body Size Limit
**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Problem:** Public webhook and payment callback endpoints accept request bodies. Axum's 2 MB default is a coarse global limit; explicit `RequestBodyLimitLayer` or `DefaultBodyLimit` should be applied to the router for defense-in-depth.  
**Fix:** Add `DefaultBodyLimit::max(2_000_000)` or `RequestBodyLimitLayer::new(2_000_000)` to the router.

### #156 (HIGH) — `tracing::instrument` for Webhook Handlers
**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Problem:** Async webhook handlers lack `#[tracing::instrument]`, making latency/debugging impossible in production.  
**Fix:** Add `#[tracing::instrument(skip_all, fields(provider, event_id))]` to all `POST` handler functions.

### #157 (MEDIUM) — `unwrap_or_default()` Hardening in CallbackData
**File:** `rings/GOLD-RING-PR00/src/telegram.rs`  
**Problem:** `CallbackData::navigate`, `action`, `action_with_payload` use `serde_json::to_string(...).unwrap_or_default()`. Serialization of a plain struct with strings cannot fail, but returning `""` on the impossible path would produce a broken inline keyboard callback string.  
**Fix:** Replace with `expect("CallbackData is always serializable")` (which is more honest than swallowing) or keep `unwrap_or_default` but add a `debug_assert!`. Since these are infallible, a plain `expect` with a static message is acceptable and signals intent. **Correction:** after discussion, keep `unwrap_or_default()` but add `tracing::warn!` on failure path to detect hypothetical regressions.

Actually, looking more carefully: `serde_json::to_string` can fail only if a type's `Serialize` implementation returns an error. For our simple struct with `String` and `Option<Value>`, this is infallible in practice. However, if `payload` contains a `Value::Number` with a non-finite float, `serde_json` might return an error. So it's not strictly impossible. **Better fix:** map the error to `AppError::Internal` and propagate, or at least log it. For a proto file, we can log and return a safe default.

### #158 (MEDIUM) — Router Content-Type Validation
**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Problem:** POST webhooks accept any `Content-Type`. An attacker sending `text/plain` or malformed JSON to a JSON-expecting handler causes deserialization errors that generate 500 responses (info disclosure) or waste CPU.  
**Fix:** Add `axum::extract::DefaultBodyLimit` and optionally a small middleware or route-level guard that rejects non-JSON POSTs to webhook routes with `415 Unsupported Media Type`.

---

## Deferred
- `AppConfig` full redaction already addressed in Wave 160; no regression found.
- `f64` balance migration to `Money` type deferred pending DB schema migration tooling.
- Bot command argument length caps deferred to Wave 166 (input surface expansion).

---

## Verification Criteria
- `cargo check` passes.
- CORS preflight test with missing `FRONTEND_URL` returns no `Access-Control-Allow-Origin` header.
- Webhook payload > 2 MB rejected with `413 Payload Too Large`.
- All new `tracing::instrument` entries compile.
