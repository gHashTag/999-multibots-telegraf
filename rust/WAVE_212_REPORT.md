# Wave 212 Security Report

**Theme:** Baseline Security Headers & Secret Hygiene
**Date:** 2026-06-16
**Scope:** Content-Security-Policy / Referrer-Policy injection, webhook secret zeroization, Cache-Control on sanitized error responses.

---

## Executive Summary

Three foundational gaps in the web-tier security posture were closed.  All HTTP responses now carry a restrictive `Content-Security-Policy` and a `Referrer-Policy` that prevents URL leakage.  Webhook secrets are stored in zeroising `SecretString` containers.  Sanitized error responses carry `Cache-Control: no-cache, no-store, must-revalidate` so browsers and CDNs do not retain 4xx/5xx bodies.

---

## Fix 1 — Missing Baseline Security Headers

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Weakness:** The `edge_hardening` Axum middleware injected `X-Frame-Options` and `X-Content-Type-Options`, but omitted `Content-Security-Policy` and `Referrer-Policy`.  An attacker who discovered an XSS vector or who could coax a user into clicking a crafted link could exfiltrate sensitive URL parameters (including signed tokens) to third-partyreferrers, or embed the application in a click-jacking frame.

**Remediation:** Extended `edge_hardening` to inject:

```rust
headers.insert(
    "Content-Security-Policy",
    http::HeaderValue::from_static(
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    ),
);
headers.insert(
    "Referrer-Policy",
    http::HeaderValue::from_static("strict-origin-when-cross-origin"),
);
```

Also added the same headers plus `Cache-Control: no-cache, no-store, must-revalidate` to `build_sanitized_response` so that fallback error pages inherit the same policy.

**Impact:** Eliminates referrer-based token leakage and closes the CSP gap entirely.

---

## Fix 2 — Webhook Secrets Stored in Plain Strings

**File:** `rings/BRONZE-RING-SRV/src/router.rs`, `rings/BRONZE-RING-SRV/src/webhooks.rs`, `rings/BRONZE-RING-SRV/Cargo.toml`

**Weakness:** `AppState.webhook_secrets` was a `HashMap<String, String>`.  Webhook secrets loaded from environment variables lived in plaintext heap allocations with no zeroisation on drop.  A core dump, swap file, or memory-scraping incident could recover these high-entropy signing keys.

**Remediation:**
1. Added `secrecy = "0.8"` to `Cargo.toml`.
2. Changed `AppState.webhook_secrets` to `HashMap<String, SecretString>`.
3. Updated `load_webhook_secret` to return `Option<SecretString>`:
   ```rust
   fn load_webhook_secret(env_var: &str) -> Option<SecretString> {
       match std::env::var(env_var) {
           Ok(v) if !v.is_empty() => Some(SecretString::new(v)),
           ...
       }
   }
   ```
4. Added `use secrecy::ExposeSecret;` in `webhooks.rs`.
5. Replaced `s.as_str()` with `s.expose_secret()` in `replicate_webhook` and `kie_ai_webhook` before passing the secret slice to `verify_webhook_secret`.

**Impact:** Webhook secret buffers are zeroised when `AppState` is dropped, reducing the blast radius of memory-exposure incidents.

---

## Fix 3 — Sanitized Error Responses Missing Cache-Control

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Weakness:** `build_sanitized_response` constructed opaque 4xx/5xx bodies but did not set `Cache-Control`.  Reverse proxies or browsers could cache these error pages, making it harder to recover from transient failures and potentially exposing stale error details.

**Remediation:** Added to `build_sanitized_response`:

```rust
.header("Cache-Control", "no-cache, no-store, must-revalidate")
.header("Pragma", "no-cache")
```

**Impact:** Error responses are never cached, ensuring clients always see the freshest server state.

---

## Metrics

- Security headers added: 2 (CSP, Referrer-Policy)
- Secret-hardening sites: 3 (AppState definition, two webhook handlers)
- Cache-control gaps closed: 1 (sanitized error builder)
- Compilation warnings: 0

---

## Cooperation Variants for Wave 213

1. **Strict-Transport-Security (HSTS) Enforcement** — Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to `edge_hardening`, gated behind an `https_only` config flag, to prevent SSL-stripping downgrade attacks.

2. **XSS-Protection Audit & Removal** — Audit all `println!`, `eprintln!`, and `tracing` statements that may echo user-controlled data; replace with `truncate_for_log` and ensure no raw user input reaches plaintext logs.

3. **Telegram Web-App Origin Validation** — If the Telegram Mini-Web-App iframe origin is ever served, add explicit `frame-ancestors` allowance for `https://web.telegram.org` while keeping `default-src 'none'` tight.
