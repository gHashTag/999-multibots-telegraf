# Wave 214 Security Report

**Theme:** Transport Security Consistency, Log Sanitization, Infisical Secret Zeroization
**Date:** 2026-06-16
**Scope:** Sanitized error responses, webhook logging, InfisicalStore client_secret.

---

## Executive Summary

Three infrastructure hygiene gaps were closed.  Sanitized error responses now carry `Strict-Transport-Security` to prevent downgrade attacks.  The Replicate webhook handler truncates the `weights` field before logging, closing a log-flooding vector.  The Infisical secret-management backend now stores its own OAuth `client_secret` in a `SecretString` that zeroises on drop.

---

## Fix 1 — Missing HSTS on Sanitized Error Responses

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Weakness:** `build_sanitized_response` set CSP, Referrer-Policy, X-Frame-Options, X-Content-Type-Options, and Cache-Control on 4xx/5xx fallback responses, but omitted `Strict-Transport-Security`.  A client that first hits an error path (404, 500, etc.) would not receive the HSTS pin, leaving a downgrade window if a subsequent request arrived over plain HTTP.

**Remediation:** Added:
```rust
.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
```
to `build_sanitized_response`.

**Impact:** Error responses now enforce HTTPS for the domain and all subdomains for one year, consistent with the success-path `edge_hardening`middleware.

**Literature:** RFC 6797 (HTTP Strict Transport Security); OWASP Transport Layer Protection Cheat Sheet.

---

## Fix 2 — Raw Webhook Payload Data in Logs Without Truncation

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

**Weakness:** The Replicate webhook handler interpolated `weights = %weights` directly from the JSON payload.  A malicious or compromised provider could embed arbitrarily large strings in the `weights` field, causing log-buffer exhaustion and audit-trail corruption.

**Remediation:** Wrapped the value with `truncate_for_log`:
```rust
let weights_truncated = trios_mb_types::truncate_for_log(&weights, 256);
tracing::info!(
    id = %payload.id,
    weights = %weights_truncated,
    "Training completed, weights available"
);
```

**Impact:** The logged `weights` field is capped at 256 UTF-8 characters regardless of payloadsize.

**Literature:** CWE-117 (Improper Output Neutralization for Logs); OWASP Logging Cheat Sheet.

---

## Fix 3 — InfisicalStore.client_secret Stored as Plain String

**File:** `rings/SILVER-RING-SC00/src/store.rs`

**Weakness:** `InfisicalStore.client_secret` is the OAuth client secret for the secret-management backend.  Stored as plain `String`, it relied only on a hand-written `Debug` redaction.  A core dump, swap file, or memory-scraping incident could recover the credential that protects every other secret in thesystem.

**Remediation:**
1. Added `secrecy = "0.8"` to `SILVER-RING-SC00/Cargo.toml`.
2. Changed `client_secret` from `String` to `secrecy::SecretString`.
3. Updated `InfisicalStore::new` to wrap the secret:
   ```rust
   client_secret: SecretString::new(client_secret.to_string()),
   ```
4. Exposed the raw value only at the HTTP JSON boundary:
   ```rust
   "clientSecret": self.client_secret.expose_secret(),
   ```

**Impact:** The client secret buffer is zeroised when `InfisicalStore` is dropped, reducing the blast radius of memory-exposureincidents.

**Literature:** `secrecy` crate documentation; OWASP Secrets Managementguidelines.

---

## Metrics

- Security headers added: 1 (HSTS on sanitized errors)
- Log-sanitization gaps closed: 1 (webhook weights truncation)
- Secret-hardening sites: 1 (InfisicalStore.client_secret)
- Compilation warnings: 0

---

## Cooperation Variants for Wave 215

1. **AppConfig.database_url SecretString Migration** — Migrate `AppConfig.database_url` from `String` to `SecretString`. The database connection string contains embedded credentials that remain in plaintext heap memory. Expose the raw URL only at the SQLx `PgPoolOptions::connect` boundary.

2. **BotConfig.token SecretString Migration** — Migrate `BotConfig.token` and the corresponding SeaORM `bots::Model.token` field to `SecretString`. Telegram bot tokens are high-value secrets; zeroising them on drop prevents recovery from coredumps.

3. **Cross-Crate Log Sanitization Audit** — Systematically audit every `tracing` statement in `SILVER-RING-JB00`, `SILVER-RING-DB00`, and `SILVER-RING-SN00` that interpolates raw user-controlled or external error strings. Replace with `truncate_for_log` and add a lint or CI check to preventregressions.
