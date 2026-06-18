# Wave 204 Security Report — Unbounded Response Body Reads & Secret-Store Defense-in-Depth

## Summary
This wave closes the last remaining unbounded `resp.text().await` and `resp.json().await` call sites in the monorepo, all located in the Infisical secret-store client (`SILVER-RING-SC00`). It also hardens error-body propagation and adds custom `Debug` redaction to prevent accidental credential disclosure.

## Fix 1 — Byte-cap + timeout helpers for all HTTP body reads in `store.rs`
**File:** `rings/SILVER-RING-SC00/src/store.rs`
**Threat model:** A compromised or misbehaving Infisical API endpoint could stream an infinitely large response. Without a byte cap, `resp.text().await` or `resp.json().await` buffers the entire stream into memory, leading to OOM and service-wide DoS (CWE-770, CWE-400).
**Change:**
- Introduced `MAX_BODY_BYTES = 1_048_576` (1 MiB) and `BODY_READ_TIMEOUT_SECS = 10`.
- Added `read_body_limited(resp, max_bytes)` — wraps `resp.bytes()` in a `tokio::time::timeout`, checks length, converts via `String::from_utf8_lossy`.
- Added `read_json_limited<T>(resp, max_bytes)` — same timeout + bytes cap, then `serde_json::from_slice`.
- Replaced 4 unbounded calls:
  - `authenticate` error path (line 103): `resp.text().await` → `read_body_limited(resp, MAX_BODY_BYTES).await`
  - `authenticate` success path (line 108): `resp.json().await` → `read_json_limited(resp, MAX_BODY_BYTES).await`
  - `load_secrets` error path (line 138): `resp.text().await` → `read_body_limited(resp, MAX_BODY_BYTES).await`
  - `load_secrets` success path (line 143): `resp.json().await` → `read_json_limited(resp, MAX_BODY_BYTES).await`
**Verification:** `cargo check --target aarch64-apple-darwin -p trios-mb-secrets` passes with zero warnings.

## Fix 2 — Truncate error bodies before embedding in error messages
**File:** `rings/SILVER-RING-SC00/src/store.rs`
**Threat model:** Even with a 1 MiB cap, a 1 MiB HTML error page from a reverse proxy would be concatenated verbatim into `SecretsError::Auth` / `SecretsError::Api` messages. These strings propagate through the error stack and may be logged or returned, amplifying the memory impact and creating log-injection vectors (CWE-779).
**Change:**
- In both error-path branches (`authenticate` and `load_secrets`), after reading the body via `read_body_limited`, apply `trios_mb_types::truncate_for_log(&body, 4096)` before including it in the error message.
- This bounds the worst-case error string to ~4 KiB regardless of the response body size.

## Fix 3 — Custom `Debug` impl for `InfisicalStore` and `SecretCache` with secret redaction
**File:** `rings/SILVER-RING-SC00/src/store.rs`
**Threat model:** Without an explicit `Debug` implementation, a future `#[derive(Debug)]` (or `dbg!` / `?` formatting via a generic context) would leak `client_id`, `client_secret`, `project_id`, and cached `access_token` into logs, crash dumps, or telemetry (CWE-532).
**Change:**
- Implemented `std::fmt::Debug` for `InfisicalStore` manually:
  - `client_id`, `client_secret`, `project_id` → `[REDACTED]`
  - `environment`, `http`, `cache` exposed normally
- Implemented `std::fmt::Debug` for `SecretCache` manually:
  - `access_token` → `[REDACTED]`
  - `secrets` → `[N entries]` (count only, no keys or values exposed)
  - `token_expires_at` exposed normally

## Scientific Literature
- **CWE-770: Allocation of Resources Without Limits or Throttling** — Unbounded `resp.json().await` allocates memory proportional to the remote peer's output, violating resource-throttling principles.
- **CWE-400: Uncontrolled Resource Consumption** — Large response bodies from a misbehaving upstream become an uncontrolled resource sink.
- **CWE-532: Insertion of Sensitive Information into Log File** — Default derived `Debug` on structs holding credentials is a well-known source of secret leakage in Rust services.
- **CWE-779: Logging of Excessive Data** — Error bodies of arbitrary size should be truncated before log emission to prevent log amplification attacks.

## Impact
- All unbounded response body reads in the monorepo are now eliminated.
- Secret-store error messages are capped to ~4 KiB.
- Accidental credential disclosure via `Debug` formatting is structurally prevented.

## Files Modified
- `rings/SILVER-RING-SC00/src/store.rs`

## Compilation
```
cargo check --target aarch64-apple-darwin -p trios-mb-secrets
```
Result: **PASS** (zero warnings, zero errors).
