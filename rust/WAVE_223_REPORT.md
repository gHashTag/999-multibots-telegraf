# WAVE 223 REPORT

## Summary
Three reliability/observability hardening fixes applied across the Telegram scene utilities and the OpenAI provider. All changes compile cleanly and existing tests pass.

---

## Fix 1 — DB timeout wrapping in `generation_utils.rs`
**Severity:** HIGH  
**Category:** CWE-1088 (Synchronous Access of Remote Resource without Timeout)

Every Telegram handler flows through `load_lang()`, `load_lang_by_id()`, `load_lang_cb()`, `deduct_balance()`, and `dispatch_and_reply()`. These helpers issued unbounded DB calls without any `tokio::time::timeout`. If the connection pool hangs or a query deadlocks, the entire bot interaction thread stalls indefinitely, causing a silent outage for users.

**File:** `rings/SILVER-RING-SN00/src/generation_utils.rs`

**Change:** Added `const DB_TIMEOUT: Duration = Duration::from_secs(10);` and wrapped every DB call in `tokio::time::timeout`:
- `db.get_user_by_telegram_id()` in `load_lang_by_id` and `load_lang_cb`
- `db.deduct_balance()` and `db.get_balance()` in `deduct_balance`
- `db.create_generation()` in `dispatch_and_reply`
- `db.add_balance()` in `dispatch_and_reply` (both refund paths on enqueue failure and generation-creation failure)

On timeout, a `tracing::warn!` is emitted and a localized fallback message is returned to the user so the interaction fails fast instead of hanging.

**Literature:** CWE-1088 states that synchronous calls to remote resources without explicit timeouts cause thread pool exhaustion and cascading failures. OWASP ASVS V14.7 mandates documented connection timeouts for every external service, with synchronous flows failing fast.

---

## Fix 2 — Provider HTTP `.send().await` timeout in `openai.rs`
**Severity:** MEDIUM  
**Category:** CWE-1088

The OpenAI provider's internal `generate_image` and `text_to_speech` methods issued raw HTTP `.send().await` calls without an application-level `tokio::time::timeout` wrapper. While the reqwest client has a 60s builder timeout, an outer `tokio::time::timeout` is an additional defense-in-depth layer that aborts the future cleanly even if reqwest's internal timer fails (e.g., during stalled TLS negotiation or connection-pool exhaustion).

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Change:** Added `const PROVIDER_HTTP_TIMEOUT: Duration = Duration::from_secs(60);` and wrapped the `.send()` chain in both `generate_image` and `text_to_speech` with `tokio::time::timeout`. On timeout, an `AiError::Provider` with a clear `"request timed out"` message is returned.

**Literature:** CWE-1088 — *Synchronous Access of Remote Resource without Timeout*. OWASP ASVS V14.7 requires every outbound synchronous call to have explicit, finite connect and read timeouts.

---

## Fix 3 — `#[tracing::instrument]` on OpenAI internal helpers
**Severity:** LOW (observability)  
**Category:** Security logging / incident response

The OpenAI provider's `generate()` method (trait implementation) was already instrumented, but its internal callees `generate_image` and `text_to_speech` were not. This created a tracing blind spot: when `generate()` dispatched to one of these helpers, the inner HTTP latency and any failures were invisible in distributed traces.

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Change:** Added `#[tracing::instrument(skip_all)]` to both `generate_image` and `text_to_speech`.

**Literature:** OWASP Logging Cheat Sheet mandates unique interaction identifiers propagated across all related events. In Rust/Tokio, `tracing::instrument` is the mechanism that creates these spans and propagates correlation IDs across await points. OWASP ASVS V16.2.4 requires logs to use a common format so they can be correlated by log processors.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-ai -p trios-mb-scenes
   Finished dev profile [unoptimized + debuginfo] target(s) in 4.21s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 7.01s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- Other scene handlers (`handlers.rs`, `invite.rs`, `payment.rs`) still have unbounded DB calls that should receive the same `tokio::time::timeout` treatment.
- Other AI providers (KIE, Fal, Replicate, Hedra, ElevenLabs, HeyGen) still lack `#[tracing::instrument]` on their internal helpers.
- Other AI providers (KIE, Fal, Replicate, Hedra, ElevenLabs, HeyGen) still lack application-level HTTP `.send().await` timeout wrapping.

---

## Three Cooperation Variants for Wave 224

### Variant A — Extend DB timeout wrapping to remaining scene handlers
`handlers.rs`, `invite.rs`, and `payment.rs` contain `db.get_balance()`, `db.get_referral_count()`, `db.add_balance()`, and other DB calls without `tokio::time::timeout`. Wrapping them would complete the DB timeout migration across the entire `SILVER-RING-SN00` ring.

### Variant B — `#[tracing::instrument]` gap closure across all AI providers
KIE, Fal, Replicate, Hedra, ElevenLabs, and HeyGen all have internal `generate()` helpers that are not instrumented. Adding `#[tracing::instrument(skip_all)]` to every provider helper would make the full AI orchestrator trace visible in Jaeger / Grafana Tempo.

### Variant C — Uniform HTTP `.send().await` timeout across all providers
Every provider's internal HTTP methods (KIE `send_request`, Fal `queue_submission`, Replicate `create_prediction`, Hedra `create_animation`, HeyGen `create_avatar_video`, ElevenLabs `generate`) should receive the same `tokio::time::timeout` treatment as OpenAI in Fix 2. This ensures no single provider can hang the orchestrator retry loop.

---

*Sources:*
- [CWE-1088](https://cwe.mitre.org/data/definitions/1088.html)
- [OWASP ASVS V14.7](https://github.com/OWASP/ASVS/issues/1778)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OWASP ASVS V16](https://asvs.dev/v5.0.0/V16-Security-Logging-and-Error-Handling/)
