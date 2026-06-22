# Wave 204 — Security Hardening Plan

## Theme
**Unbounded response body reads & secret-store defense-in-depth**

## Background
The `SILVER-RING-SC00/src/store.rs` (Infisical secret store) still uses unbounded `resp.text().await` and `resp.json().await` calls at 4 sites. A compromised or misbehaving Infisical endpoint can stream an infinite response, causing OOM and DoS. Additionally, error bodies are embedded verbatim into `AppError` strings without truncation, amplifying the DoS into error-message bloat. Finally, `InfisicalStore` lacks a `Debug` impl, creating a latent risk of accidental secret logging if a derive is added later.

## Fixes (exactly 3)

### Fix 1 — Byte-cap + timeout helpers for all HTTP body reads in `store.rs`
**File:** `rings/SILVER-RING-SC00/src/store.rs`
- Add two private async helpers:
  - `read_body_limited(resp, max_bytes)` — uses `tokio::time::timeout` around `resp.bytes()`, checks length, returns `String` (via `String::from_utf8_lossy`).
  - `read_json_limited<T>(resp, max_bytes)` — same timeout + bytes cap, then `serde_json::from_slice`.
- Set `MAX_BODY_BYTES: usize = 1_048_576` (1 MiB) — generous for Infisical JSON responses.
- Replace 4 unbounded calls:
  - Line 103: `resp.text().await` in error path of `authenticate`
  - Line 108: `resp.json().await` in success path of `authenticate`
  - Line 138: `resp.text().await` in error path of `load_secrets`
  - Line 143: `resp.json().await` in success path of `load_secrets`
- **Scientific basis:** OOM prevention via bounded response buffering (CWE-770, CWE-400).

### Fix 2 — Truncate error bodies before embedding in error messages
**File:** `rings/SILVER-RING-SC00/src/store.rs`
- In the two error-path branches (lines ~103-105 and ~138-140), after reading the body (now via `read_body_limited`), truncate it with `trios_mb_types::truncate_for_log(body, 4096)` before including it in `SecretsError::Auth` / `SecretsError::Api` messages.
- This prevents a large/malicious error page from becoming a large `AppError` allocation that propagates through the stack and into logs.
- **Scientific basis:** Log-injection / error-amplification DoS mitigation (CWE-779).

### Fix 3 — Custom `Debug` impl for `InfisicalStore` with secret redaction
**File:** `rings/SILVER-RING-SC00/src/store.rs`
- Implement `std::fmt::Debug` for `InfisicalStore` manually.
- Redact `client_id`, `client_secret`, `project_id`, and `access_token` fields to `[REDACTED]` or `[REDACTED:len=N]`.
- Expose safe fields (`environment`, `http`, `cache`) normally.
- **Scientific basis:** Defense-in-depth against accidental credential disclosure via logging or crash dumps (CWE-532).

## Verification
1. `cargo check --target aarch64-apple-darwin -p trios-mb-secrets` must pass with zero warnings.
2. Review diff to confirm all 4 `.text().await` / `.json().await` calls are removed.
3. Confirm `Debug` output does not contain secret substrings.

## Deferred
- Migrate `client_id` / `client_secret` to `secrecy::SecretString` (requires constructor signature change across all callers).
- Add `deny_unknown_fields` structs for Infisical auth/secrets JSON responses (moderate refactor).

## Cooperation Variants for Wave 205
1. **Provider reqwest constructor audit** — Verify every provider `reqwest::Client::builder()` chain includes `.redirect(Policy::none())`, `.connect_timeout()`, and `.pool_max_idle_per_host()`.
2. **Job-queue SQL param validation** — Add length caps and charset validation on all dynamic parameters passed to SeaORM raw SQL in `GOLD-RING-TR00`.
3. **Webhook payload schema hardening** — Apply `deny_unknown_fields` + per-field length caps to remaining webhook DTOs in `BRONZE-RING-SRV`.
