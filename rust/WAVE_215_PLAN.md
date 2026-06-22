# Wave 215 Security Plan

**Theme:** Secret Cache Zeroization, Infisical DTO Hardening, Orchestrator Log Sanitization
**Date:** 2026-06-16

---

## Fix 1 — SecretCache Stores OAuth Token and Secrets as Plain String

**Severity:** CRITICAL
**File:** `rings/SILVER-RING-SC00/src/store.rs`
**Weakness:** Wave 214 hardened `InfisicalStore.client_secret` to `SecretString`, but `SecretCache` (the in-memory cache of Infisical results) still stores:
- `access_token: Option<String>` — the OAuth bearer token used for every subsequent Infisical request.
- `secrets: HashMap<String, (String, Instant)>` — every cached secret value (DB passwords, API keys, etc.) in plaintext heap memory.

A core dump or swap file would recover not just the Infisical bearer token but every cached secret simultaneously.

**Remediation:**
1. Change `access_token` to `Option<SecretString>`.
2. Change `secrets` HashMap value to `(SecretString, Instant)`.
3. Update all cache read/write sites to wrap/unwrap with `SecretString::new(...)` and `.expose_secret()`.
4. Expose values only at HTTP boundaries (`Authorization` header, JSON body).

**Literature:** `secrecy` crate docs; OWASP Secrets Management guidelines.

---

## Fix 2 — Infisical DTOs Store Credentials as Plain String

**Severity:** HIGH
**File:** `rings/GOLD-RING-PR00/src/infisical.rs`
**Weakness:** The transport DTOs `AuthRequest` and `AuthResponse` store `client_secret` and `access_token` as plain `String`. These structs are cloned every time the Infisical client authenticates, proliferating plaintext buffers across the heap. The custom `Debug` redaction only hides them from logs.

**Remediation:**
1. Change `AuthRequest.client_secret` to `SecretString`.
2. Change `AuthResponse.access_token` to `SecretString`.
3. Add `secrecy = "0.8"` to `GOLD-RING-PR00/Cargo.toml`.
4. Update `InfisicalStore` methods to wrap/unwrap at serialization/deserialization boundaries.
5. Keep `#[serde(deny_unknown_fields)]` on `AuthResponse`.

**Literature:** `secrecy` crate docs; OWASP Secrets Management guidelines.

---

## Fix 3 — Orchestrator Logs Raw Provider Error Bodies

**Severity:** MEDIUM
**File:** `rings/SILVER-RING-AI00/src/orchestrator.rs`
**Weakness:** When a provider call fails, the orchestrator logs the raw `AppError` without truncation. The error variant `AiError::Provider { message }` is populated by `read_error_body(resp, 64_000)` across all AI providers, meaning a single failed call can emit up to 64 KB of arbitrary attacker-controlled data into structured logs. This opens a log-buffer-exhaustion DoS vector.

**Remediation:** Truncate the error string to 256 UTF-8 characters before interpolation:
```rust
let err_short = trios_mb_types::truncate_for_log(&e.to_string(), 256);
tracing::warn!(provider = %name, error = %err_short, "provider failed");
```

**Literature:** CWE-117 (Improper Output Neutralization for Logs); OWASP Logging Cheat Sheet.

---

## Deferred Items
- `AppConfig.database_url` SecretString migration (requires wide-reaching SQLx connection refactoring).
- `BotConfig.token` SecretString migration (requires SeaORM entity mapping changes).
- Additional cross-crate log sanitization audit.
