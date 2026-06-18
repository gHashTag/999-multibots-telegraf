# Wave 212 Plan — Security Headers Hardening & Secret Storage Hygiene

## Theme
Inject missing security headers at the HTTP edge and migrate webhook secrets from plain `String` to `SecretString` with zeroization on drop.

## Literature References
1. OWASP Secure Headers Project — CSP and Referrer-Policy are mandatory baseline headers for any production web-facing service. Without CSP, XSS payloads can execute inline scripts even when input is sanitized elsewhere.
2. Mozilla Web Security Guidelines — `Referrer-Policy: strict-origin-when-cross-origin` prevents sensitive URL paths (e.g., `/admin/xxx`) from leaking to third-party analytics, social widgets, or CDN logs.
3. [Leapcell Blog](https://leapcell.io/blog/secure-configuration-and-secrets-management-in-rust-with-secrecy-and-environment-variables) — `secrecy::SecretString` wraps `String` with automatic zeroization on drop and redacts `Debug` output, preventing secret leakage in logs, backtraces, and core dumps.
4. CWE-522 — Insufficiently Protected Credentials — Storing secrets in plain `HashMap<String, String>` means the secret persists in memory after drop and appears in heap dumps; `SecretString` overwrites the buffer on drop.

---

## Fix 1 — CSP & Referrer-Policy Header Injection
### File
`rings/BRONZE-RING-SRV/src/router.rs`
### Weakness
The `edge_hardening` middleware injects `X-Content-Type-Options`, `X-Frame-Options`, and `HSTS`, but omits `Content-Security-Policy` (CSP) and `Referrer-Policy`. Without CSP, a reflected XSS payload that bypasses downstream sanitization can execute inline scripts. Without Referrer-Policy, full URLs (including bot tokens or admin paths in query strings) leak to external referrers.
### Remediation
Add two headers in `edge_hardening` and `build_sanitized_response`:
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'` (fail-closed default)
- `Referrer-Policy: strict-origin-when-cross-origin`

---

## Fix 2 — Webhook Secrets Stored as Plain String
### File
`rings/BRONZE-RING-SRV/src/router.rs` (AppState), `rings/BRONZE-RING-SRV/src/webhooks.rs`
### Weakness
`AppState.webhook_secrets` is declared as `HashMap<String, String>`. Webhook secrets (e.g., `REPLICATE_WEBHOOK_SECRET`) are loaded from environment variables into plain `String` objects that persist in memory indefinitely. If the process core-dumps, heap-dumps, or is inspected via `/proc/self/mem`, the secret is readable in plaintext. Additionally, the `String` value appears in `Debug` output of `AppState`.
### Remediation
1. Change `webhook_secrets: HashMap<String, String>` → `webhook_secrets: HashMap<String, SecretString>`.
2. In `load_webhook_secret`, wrap the loaded secret in `SecretString::new(Box::leak(secret.into_boxed_str()))` — actually we should use `SecretString::new(secret.into())`.
3. In `replicate_webhook` and `kie_ai_webhook`, replace `s.as_str()` with `s.expose_secret()` when passing to `verify_webhook_secret`.
4. Import `secrecy::SecretString` and `secrecy::ExposeSecret` in both files.
5. Add `secrecy` to `BRONZE-RING-SRV/Cargo.toml`.

---

## Fix 3 — Cache-Control on Error Responses
### File
`rings/BRONZE-RING-SRV/src/router.rs`
### Weakness
`build_sanitized_response` returns a generic error body but does not set `Cache-Control`. Under certain conditions (e.g., CDN in front of the Axum server), a 400 or 500 response could be cached, causing stale error pages to be served to subsequent legitimate requests.
### Remediation
Add `Cache-Control: no-cache, no-store, must-revalidate` to every response produced by `build_sanitized_response`.

---

## Decomposition Checklist
- [ ] Fix 1 implemented
- [ ] Fix 2 implemented
- [ ] Fix 3 implemented
- [ ] `cargo check` passes with zero warnings
- [ ] `WAVE_212_REPORT.md` written
- [ ] `wave-212-patterns.md` written
- [ ] `MEMORY.md` updated
- [ ] `skill.md` updated
- [ ] Committed

## Cooperation Variants for Wave 213
1. **Database f64 → Money Migration Start** — Begin migrating `get_balance`, `deduct_balance`, `add_balance` on the `Database` trait from `f64` to `Money(i64)`, adding repository shim conversions.
2. **InfisicalStore SecretString Migration** — Migrate `InfisicalStore` cached secrets from `HashMap<String, (String, Instant)>` to `HashMap<String, (SecretString, Instant)>` so that secret values are zeroized on cache eviction.
3. **Tracing Span Propagation Audit** — Verify that every async HTTP handler and background worker carries a parent span so that distributed traces do not break at `tokio::spawn` boundaries.
