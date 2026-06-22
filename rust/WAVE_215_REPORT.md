# Wave 215 Security Report

**Theme:** Secret Cache Zeroization, AppConfig Secret Hardening, Orchestrator Log Sanitization
**Date:** 2026-06-16
**Scope:** SILVER-RING-SC00 SecretCache, GOLD-RING-TY00 AppConfig, SILVER-RING-AI00 orchestrator.

---

## Executive Summary

Three secret-hygiene and logging-hygiene gaps were closed.  The in-memory `SecretCache` now stores both the Infisical OAuth bearer token and every cached secret value as `SecretString`, so buffers are zeroised on drop.  `AppConfig.infisical_client_secret` was migrated from plain `String` to `SecretString` and the struct's serde derives were removed to prevent accidental serialization of credentials.  The AI orchestrator now truncates provider error messages to 256 characters before logging, eliminating a log-flooding vector from arbitrarily large provider error bodies.

---

## Fix 1 — SecretCache Stores OAuth Token and Secrets as Plain String

**File:** `rings/SILVER-RING-SC00/src/store.rs`

**Weakness:** Wave 214 hardened `InfisicalStore.client_secret` to `SecretString`, but `SecretCache` (the in-memory cache of Infisical results) still stored:
- `access_token: Option<String>` — the OAuth bearer token used for every subsequent Infisical request.
- `secrets: HashMap<String, (String, Instant)>` — every cached secret value (DB passwords, API keys, etc.) in plaintext heap memory.

A core dump or swap file would recover not just the Infisical bearer token but every cached secret simultaneously.

**Remediation:**
1. Changed `access_token` to `Option<SecretString>`.
2. Changed `secrets` HashMap value to `(SecretString, Instant)`.
3. Updated all cache read/write sites to wrap/unwrap with `SecretString::new(...)` and `.expose_secret()`.
4. Exposed values only at HTTP boundaries (`Authorization` header, JSON body).

**Impact:** All secret buffers in the cache are zeroised when `SecretCache` / `InfisicalStore` is dropped. `Debug` output remains redacted.

**Literature:** `secrecy` crate docs (v0.10); OWASP Secrets Management guidelines.

---

## Fix 2 — AppConfig.infisical_client_secret Stored as Plain String

**File:** `rings/GOLD-RING-TY00/src/config.rs`

**Weakness:** `AppConfig.infisical_client_secret` was a plain `String`, kept in plaintext heap memory for the entire application lifetime. The struct also derived `Serialize` and `Deserialize`, creating an accidental serialization risk if `AppConfig` were ever passed to a JSON encoder.

**Remediation:**
1. Changed `infisical_client_secret` from `String` to `secrecy::SecretString`.
2. Removed `Serialize` and `Deserialize` derives (and `#[serde(deny_unknown_fields)]`) from `AppConfig` — the struct is only constructed via `from_env()` and should never be serialized.
3. Updated `from_env()` to wrap the env var:
   ```rust
   infisical_client_secret: SecretString::new(
       std::env::var("INFISICAL_CLIENT_SECRET")?.into_boxed_str()
   ),
   ```
4. Updated `main.rs` to expose the secret only at the `InfisicalStore::new` boundary:
   ```rust
   config.infisical_client_secret.expose_secret()
   ```
5. Added `secrecy = { workspace = true }` to `GOLD-RING-TY00/Cargo.toml` and `BRONZE-RING-APP/Cargo.toml`.

**Impact:** The Infisical client secret is zeroised on `AppConfig` drop. The serde surface is removed, closing an accidental-info-disclosure vector.

**Literature:** `secrecy` crate docs; OWASP Secrets Management guidelines.

---

## Fix 3 — Orchestrator Logs Raw Provider Error Bodies

**File:** `rings/SILVER-RING-AI00/src/orchestrator.rs`

**Weakness:** When a provider call fails, the orchestrator logged the raw `AppError` without truncation. The error variant `AiError::Provider { message }` is populated by `read_error_body(resp, 64_000)` across all AI providers, meaning a single failed call could emit up to 64 KB of arbitrary attacker-controlled data into structured logs. This opens a log-buffer-exhaustion DoS vector.

**Remediation:** Truncated the error string to 256 UTF-8 characters before interpolation:
```rust
let err_msg = e.to_string();
let err_short = trios_mb_types::truncate_for_log(&err_msg, 256);
tracing::warn!(provider = %name, error = %err_short, "provider failed");
```

**Impact:** Provider error log lines are now capped at 256 characters regardless of response body size.

**Literature:** CWE-117 (Improper Output Neutralization for Logs); OWASP Logging Cheat Sheet.

---

## Side Fixes

### Secrecy v0.10 API Compatibility

The workspace upgraded from `secrecy = "0.8"` to `secrecy = { version = "0.10", features = ["serde"] }` in earlier waves. In v0.10, `SecretString::new()` requires `Box<str>` instead of `String`. All call sites were updated to use `.into_boxed_str()`:

- `rings/SILVER-RING-SC00/src/store.rs` (3 sites)
- `rings/SILVER-RING-PY00/src/robokassa.rs` (2 sites)
- `rings/BRONZE-RING-SRV/src/router.rs` (1 site)
- `rings/GOLD-RING-TY00/src/config.rs` (1 site)

### Reverted Broken DTO Migration

The original Fix 2 plan attempted to change `AuthRequest.client_secret` and `AuthResponse.access_token` in `rings/GOLD-RING-PR00/src/infisical.rs` to `SecretString`. These DTOs derive `Serialize`/`Deserialize`/`Clone`, but `secrecy::SecretString` (v0.10 `SecretBox<str>`) intentionally does **not** implement `Serialize`, `Deserialize`, or `Clone` because `str` is `?Sized` and the crate omits `SerializableSecret`/`CloneableSecret` impls for it. Since the DTOs are unused at runtime (the store uses inline `serde_json::Value`), they were reverted to plain `String` with redacted `Debug`.

---

## Metrics

- Secret-hardening sites: 3 (SecretCache access_token, SecretCache secrets map, AppConfig.infisical_client_secret)
- Log-sanitization gaps closed: 1 (orchestrator provider error truncation)
- Serde attack surface reduced: 1 (AppConfig Serialize/Deserialize derives removed)
- Secrecy v0.10 compatibility fixes: 7 call sites
- Compilation warnings: 0
- Errors introduced: 0

---

## Cooperation Variants for Wave 216

1. **Webhook Secret Startup Loading + Constant-Time Verification** — Move webhook secret loading from per-request env-var lookups to startup-time loading into `AppState.webhook_secrets: HashMap<String, SecretString>`. Replace the remaining hand-rolled XOR comparison in webhook handlers with `subtle::ConstantTimeEq`.

2. **Payment Gateway Secret String Hardening** — Migrate remaining payment gateway structs (`RobokassaCallbackForm`, `TelegramStarsConfig`, etc.) that store tokens or API keys as plain `String` to `SecretString`. Wrap/unexpose only at the HTTP boundary.

3. **Provider API Key SecretString Migration** — The AI provider constructors in `SILVER-RING-AI00` (OpenAI, FAL, Replicate, ElevenLabs, etc.) accept `api_key: String`. Migrate these to `SecretString` so provider API keys are zeroised on drop and redacted in Debug output.
