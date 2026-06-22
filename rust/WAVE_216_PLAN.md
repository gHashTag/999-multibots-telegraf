# Wave 216 Security Plan

**Theme:** Timing Side-Channel Elimination, Secret Exposure Scope Minimization
**Date:** 2026-06-16

---

## Fix 1 — Webhook Secret Length Timing Side-Channel

**Severity:** CRITICAL
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
**Weakness:** `verify_webhook_secret` performs an explicit `expected.len() != provided.len()` check before calling `subtle::ConstantTimeEq::ct_eq`. This early return leaks the secret length via timing: an attacker sending requests with different-length secrets can measure which one triggers the slower byte-by-byte comparison path inside `subtle`.

`subtle::ConstantTimeEq::ct_eq` for slices already handles different lengths by returning `Choice(0)` — but the internal length branch is unavoidable. Adding an explicit length branch BEFORE `subtle`'s branch doubles the signal-to-noise ratio for a timing attacker.

**Remediation:** Remove the explicit length check. Rely on `subtle::ct_eq` alone.

**Literature:** `subtle` crate docs (slice `ct_eq` notes); CWE-208 (Observable Timing Discrepancy); Bernstein, "Cache-timing attacks on AES" (2005).

---

## Fix 2 — Robokassa Signature Length Timing Side-Channel

**Severity:** HIGH
**File:** `rings/SILVER-RING-PY00/src/robokassa.rs`
**Weakness:** `verify_callback_signature` repeats the same anti-pattern: an explicit `expected.len() != signature_value.len()` check before `subtle::ct_eq`. Robokassa signatures are hex-encoded SHA-256 hashes (always 64 chars), so the length check is nominally redundant. However, if an attacker crafts a callback with a non-hex or truncated signature, the early return leaks that the length was wrong — a timing side-channel.

**Remediation:** Remove the explicit length check. `subtle::ct_eq` already returns `Choice(0)` for different lengths.

**Literature:** Same as Fix 1.

---

## Fix 3 — Webhook Secret Exposed in Caller Stack Frame

**Severity:** MEDIUM
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`
**Weakness:** `verify_webhook_secret` accepts `expected: &str`, forcing the caller (`replicate_webhook`, `kie_ai_webhook`) to call `.expose_secret()` before invoking the function. The raw secret `&str` lives in the caller's stack frame for the duration of the webhook handler, widening the window where a core dump or panic message could capture the plaintext.

**Remediation:** Change `verify_webhook_secret` signature to accept `&SecretString`. The caller passes the `SecretString` directly; `.expose_secret()` is called only inside the comparison body, minimizing the exposure window to a single expression.

**Literature:** OWASP Secrets Management guidelines; `secrecy` crate best practices.

---

## Deferred Items
- Bulkhead semaphore per provider (architectural, not a immediate vulnerability)
- Retry-budget sliding window for provider failures
- Hash-based constant-time comparison for variable-length secrets (SHA-256 digest both sides first)
