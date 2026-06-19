# Wave 214 Security Plan

**Theme:** Transport Security Consistency, Log Sanitization, Infisical Secret Zeroization
**Date:** 2026-06-16

---

## Fix 1 — Missing HSTS on Sanitized Error Responses

**Severity:** HIGH
**File:** `rings/BRONZE-RING-SRV/src/router.rs`
**Weakness:** `build_sanitized_response` injects CSP, Referrer-Policy, X-Content-Type-Options, X-Frame-Options, and Cache-Control, but omits `Strict-Transport-Security`. When a client hits an error path (e.g., 400, 404, 500), the response lacks the HSTS header, creating a downgrade window if the client later encounters a non-error path over plain HTTP.

**Remediation:** Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` to `build_sanitized_response`.

**Literature:** RFC 6797 (HTTP Strict Transport Security); OWASP Transport Layer Protection Cheat Sheet.

---

## Fix 2 — Raw Webhook Payload Data in Logs Without Truncation

**Severity:** HIGH
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
**Weakness:** The Replicate webhook handler logs `weights = %weights` directly from the JSON payload without `truncate_for_log`. A malicious or compromised provider could embed multi-kilobyte strings in the weights field, causing log flooding and audit-trail corruption.

**Remediation:** Wrap the `weights` value with `truncate_for_log(..., MAX_LOG_FIELD_LEN)` before interpolation.

**Literature:** CWE-117 (Improper Output Neutralization for Logs); OWASP Logging Cheat Sheet.

---

## Fix 3 — InfisicalStore.client_secret Stored as Plain String

**Severity:** CRITICAL
**File:** `rings/SILVER-RING-SC00/src/store.rs`, `rings/GOLD-RING-PR00/src/infisical.rs`
**Weakness:** `InfisicalStore.client_secret` is the OAuth client secret for the secret-management backend itself. It is stored as a plain `String`, only protected by a hand-written `Debug` redaction. A core dump or swap file could expose the credential that protects all other secrets.

**Remediation:**
1. Change `InfisicalStore.client_secret` to `secrecy::SecretString`.
2. Update `InfisicalStore::new` to accept and wrap the secret.
3. Expose the raw value only at the HTTP JSON boundary via `.expose_secret()`.
4. Add `secrecy` dependency to `SILVER-RING-SC00/Cargo.toml`.

**Literature:** `secrecy` crate docs; OWASP Secrets Management guidelines.

---

## Deferred Items (MEDIUM/LOW)
- `AppConfig.database_url` SecretString migration (requires DB connection refactoring).
- `BotConfig.token` SecretString migration (requires SeaORM entity changes).
- Additional log-sanitization audit across all `tracing` statements.
