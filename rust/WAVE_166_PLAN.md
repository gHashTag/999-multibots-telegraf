# Wave 166 Security Plan

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** HTTP edge defense, security headers, request timeouts, Content-Type enforcement

---

## Scientific Literature

- **OWASP Secure Headers Project** ([OWASP](https://owasp.org/www-project-secure-headers/))  
  Missing security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`) allow MIME-sniffing, clickjacking, and downgrade attacks. APIs serving JSON should always set `X-Content-Type-Options: nosniff`.

- **RFC 7231 — Content-Type Semantics** ([RFC 7231](https://tools.ietf.org/html/rfc7231#section-3.1.1.5))  
  Servers that process request bodies without validating `Content-Type` may misinterpret payload encoding, leading to parser confusion, injection, and bypass of downstream validation.

- **CVE-2007-6750 — Slowloris**  
  Slow, incomplete HTTP requests can exhaust connection pools. `tower_http::timeout::TimeoutLayer` with a generous but finite total-request timeout closes slowloris-style attacks before worker starvation.

- **OWASP API8:2023 — Security Misconfiguration**  
  Endpoints without `Cache-Control` may be cached by CDNs or proxies, leaking health status, user data, or webhook responses. Dynamic endpoints must declare `Cache-Control: no-store`.

---

## Task Breakdown

### #159 (CRITICAL) — Security Headers Middleware
**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Problem:** The Axum router does not emit any security headers. Browsers may MIME-sniff responses, embed endpoints in frames, or downgrade HTTPS.  
**Fix:** Add a `tower_http::set_header::SetResponseHeaderLayer` (or custom middleware) that injects:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Cache-Control: no-store` (on non-health routes; health keeps `no-cache`)

### #160 (CRITICAL) — Request Timeout Layer
**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Problem:** No global request timeout exists. A slowloris-style attack or a hung upstream callback could hold connections indefinitely, exhausting Tokio worker threads.  
**Fix:** Add `tower_http::timeout::TimeoutLayer::new(Duration::from_secs(30))` to the router. The 30-second total-request cap is generous enough for webhook processing while preventing indefinite stalls.

### #161 (HIGH) — Webhook Content-Type Enforcement
**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Problem:** Webhook handlers accept `application/x-www-form-urlencoded` or even `text/plain` when they expect JSON. This causes deserialization errors (500) and wastes CPU on garbage input.  
**Fix:** Add a small middleware or custom extractor wrapper that rejects POSTs without `Content-Type: application/json` with `415 Unsupported Media Type`. Alternatively, add an explicit guard inside each webhook handler.

### #162 (HIGH) — Health Endpoint Cache Control
**File:** `rings/BRONZE-RING-SRV/src/health.rs`  
**Problem:** `health_check` and `health_check_with_db` return JSON with no `Cache-Control` header. Proxies/CDNs may cache the response, serving stale "ok" status during outages.  
**Fix:** Add `Cache-Control: no-cache, no-store, must-revalidate` header to both health responses.

### #163 (MEDIUM) — Info Disclosure in 500 Responses
**File:** `rings/BRONZE-RING-SRV/src/router.rs` (implicit)  
**Problem:** Axum's default rejection handlers for deserialisation failures include field paths and types (e.g., `missing field `signature_value` at line 1 column 123`). This leaks internal struct layout to attackers probing the API.  
**Fix:** Register a custom fallback handler with `axum::handler::Handler` that maps all `415`, `422`, and `405` rejections to generic `"Bad Request"` / `"Unsupported Media Type"` bodies without internal detail.

### #164 (MEDIUM) — `tracing::instrument` on Webhook Handlers Completion
**Files:** `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`  
**Problem:** While `replicate_webhook` and `kie_ai_webhook` have `#[tracing::instrument]`, `robokassa_callback` only has a manual span via `fields(inv_id)`. Consistency improves observability.  
**Fix:** Add `#[tracing::instrument(skip(state, form), fields(inv_id = %form.inv_id))]` to `robokassa_callback`.

---

## Deferred
- HSTS preload list inclusion is out of scope (requires domain registration & submission).
- CSP (`Content-Security-Policy`) is irrelevant for a JSON-only API with no HTML responses.
- Rate-limit per-user granularity remains deferred.

---

## Verification Criteria
- `cargo check` passes.
- Security headers visible in responses (test with curl `-I`).
- Webhook with `Content-Type: text/plain` returns `415`.
- Timeout layer compiles and integrates with Axum `Router`.
