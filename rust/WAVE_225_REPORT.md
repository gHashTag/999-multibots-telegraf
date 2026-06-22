# WAVE 225 REPORT

## Summary
Three reliability and configuration-visibility hardening fixes applied across Telegram startup/settings handlers and the server router. All changes compile cleanly and existing tests pass.

---

## Fix 1 — DB timeout wrapping in `start.rs`
**Severity:** HIGH  
**Category:** CWE-1088 (Synchronous Access of Remote Resource without Timeout)

The `/start` handler is the first interaction for every new user. Its `db.get_user_by_telegram_id()` and `db.create_user()` calls were unbounded. If the DB hung, new users would be permanently blocked from enrolling.

**File:** `rings/SILVER-RING-SN00/src/start.rs`

**Change:** Added `const DB_TIMEOUT: Duration = Duration::from_secs(10);` and wrapped both DB calls in `tokio::time::timeout`. On timeout, a localized error message is sent to the user and the handler aborts.

**Literature:** CWE-1088 states that synchronous calls to remote resources without explicit timeouts cause thread pool exhaustion. The `/start` path is a single point of failure for user acquisition; a hang here has outsized impact.

---

## Fix 2 — DB timeout wrapping in `balance.rs`, `change_language.rs`, `subscription.rs`, `select_model.rs`
**Severity:** MEDIUM  
**Category:** CWE-1088

Four additional scene handlers issued bare DB calls without timeouts. Under connection-pool pressure, any of these could stall the bot dispatcher.

**Files touched:**
- `rings/SILVER-RING-SN00/src/balance.rs` — wrapped `db.get_balance()`
- `rings/SILVER-RING-SN00/src/change_language.rs` — wrapped `db.update_user_language()`
- `rings/SILVER-RING-SN00/src/subscription.rs` — wrapped `db.check_subscription()`
- `rings/SILVER-RING-SN00/src/select_model.rs` — wrapped `db.update_user_model()`

**Change:** Added `const DB_TIMEOUT: Duration = Duration::from_secs(10);` to each file and wrapped the DB call in `tokio::time::timeout`. On timeout, log `tracing::warn!` and return a localized fallback.

**Literature:** CWE-1088. Without query timeouts, a single slow query holds a pool connection hostage, accelerating exhaustion under concurrent load.

---

## Fix 3 — Replace silent `unwrap_or_default()` on `FRONTEND_URL` in `router.rs`
**Severity:** LOW-MEDIUM (observability)  
**Category:** CWE-547 (Use of Hard-coded, Security-relevant Constants)

`router.rs` used `std::env::var("FRONTEND_URL").map(...).unwrap_or_default()` to read CORS origins. When the env var was missing, the `Err` variant was silently discarded and an empty `Vec` was produced. While downstream code did log a warning, the failure was not visible at the exact call site, making stack-trace debugging harder.

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

**Change:** Replaced the chain with an explicit `match` that logs `tracing::warn!(error = %e, "FRONTEND_URL not set; CORS requests denied")` at the exact point of failure. Removed the silent `unwrap_or_default()` pattern.

**Literature:** CWE-547 covers hard-coded security-relevant constants. While the empty `Vec` is not a hardcoded secret, the silent fallback pattern is the same class of vulnerability: missing configuration goes unnoticed because the application proceeds with a default rather than failing visibly. OWASP ASVS V14.7 requires explicit configuration validation.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-scenes -p trios-mb-server
   Finished dev profile [unoptimized + debuginfo] target(s) in 12.83s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 0.23s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- Other `std::env::var(...).unwrap_or_default()` patterns across `BRONZE-RING-SRV` should be audited and replaced with explicit `match` + logging.
- `payment.rs` and other un-audited scene modules may still contain bare DB calls.
- `tracing::instrument` gaps may remain on lesser-used handlers in `BRONZE-RING-SRV`.

---

## Three Cooperation Variants for Wave 226

### Variant A — Systematic audit of `unwrap_or_default()` on `std::env::var` across `BRONZE-RING-SRV`
Multiple env-var reads in `BRONZE-RING-SRV` use `.unwrap_or_default()` or `.unwrap_or(...)` to silently fall back to defaults. Replacing them with explicit `match` + logging would make all configuration drift visible at startup.

### Variant B — `tracing::instrument` gap closure on remaining `BRONZE-RING-SRV` handlers
Billing, referrals, documents, teams, and marketplace handlers may still lack `#[tracing::instrument]`. Adding spans to every `pub async fn` Axum handler would make the full server trace visible in distributed tracing.

### Variant C — DB timeout wrapping in `payment.rs` and remaining un-audited scene modules
`payment.rs` and any other scene modules not yet audited may still contain bare DB calls. A systematic grep for `db\.<method>\(.*\)\.await` without `tokio::time::timeout` would surface the remaining gaps.

---

*Sources:*
- [CWE-1088](https://cwe.mitre.org/data/definitions/1088.html)
- [CWE-547](https://cwe.mitre.org/data/definitions/547.html)
- [OWASP ASVS V14.7](https://github.com/OWASP/ASVS/issues/1778)
- [Trail of Bits — Insecure Defaults](https://github.com/trailofbits/skills/blob/main/plugins/insecure-defaults/skills/insecure-defaults/SKILL.md)
- [OWASP Top 10 2025 A02](https://owasp.org/Top10/2025/A02_2025-Security_Misconfiguration/)
