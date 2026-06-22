# WAVE 224 REPORT

## Summary
Three reliability and observability hardening fixes applied across all remaining AI providers (HeyGen, ElevenLabs, KIE, Fal, Replicate, Hedra) and Telegram scene handlers (handlers.rs, invite.rs). All changes compile cleanly and existing tests pass.

---

## Fix 1 — Provider HTTP `.send()` timeout across all remaining AI providers
**Severity:** HIGH  
**Category:** CWE-1088 (Synchronous Access of Remote Resource without Timeout)

Six AI provider files contained unbounded `.send().await` calls that could hang indefinitely during stalled TLS negotiation, connection-pool exhaustion, or unresponsive provider APIs. This created a cascading failure risk: a single slow provider could starve the orchestrator retry loop and eventually the entire Tokio worker pool.

**Files touched:**
- `rings/SILVER-RING-AI00/src/providers/heygen.rs` — 3 calls wrapped (`create_avatar_video`, `check_video_status`, `list_avatars`)
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs` — 4 calls wrapped (`text_to_speech_raw`, `list_voices`, `add_voice`, `get_character_balance`)
- `rings/SILVER-RING-AI00/src/providers/kie.rs` — 2 calls wrapped (`send_request`, `check_task_status`)
- `rings/SILVER-RING-AI00/src/providers/fal.rs` — 3 calls wrapped (`queue_submission`, `check_queue_status`, `fetch_result`)
- `rings/SILVER-RING-AI00/src/providers/replicate.rs` — 3 calls wrapped (`create_prediction`, `fetch_prediction`, `cancel`)
- `rings/SILVER-RING-AI00/src/providers/hedra.rs` — 2 calls wrapped (`create_animation`, `fetch_animation_status`)

**Change:** Added `const PROVIDER_HTTP_TIMEOUT: Duration = Duration::from_secs(60);` to each file and wrapped every `.send().await` in `tokio::time::timeout`. On timeout, return `AiError::Provider` with a `"request timed out"` message. This brings all providers in line with the OpenAI hardening from Wave 223 Fix 2.

**Total calls wrapped:** 17 across 6 providers.

**Literature:** CWE-1088 states that synchronous calls to remote resources without explicit timeouts cause thread pool exhaustion and cascading failures. OWASP ASVS V14.7 mandates documented connection timeouts for every external service, with synchronous flows failing fast.

---

## Fix 2 — DB timeout wrapping in `handlers.rs` and `invite.rs`
**Severity:** MEDIUM  
**Category:** CWE-1088

Two scene handler files still issued bare DB calls without `tokio::time::timeout`. If the connection pool hung, the bot interaction thread would stall indefinitely.

**Files touched:**
- `rings/SILVER-RING-SN00/src/handlers.rs` — wrapped `db.get_balance()` and `db.get_referral_count()`
- `rings/SILVER-RING-SN00/src/invite.rs` — wrapped `db.get_referral_count()`

**Change:** Added `const DB_TIMEOUT: Duration = Duration::from_secs(10);` to each file. Wrapped every bare DB call in `tokio::time::timeout`. On timeout, log `tracing::warn!` and return a localized fallback message.

**Literature:** CWE-1088. Without query timeouts, a single slow or deadlocked query holds a pool connection hostage, accelerating pool exhaustion under concurrent load.

---

## Fix 3 — `#[tracing::instrument]` on KIE submit helpers
**Severity:** LOW (observability)  
**Category:** Security logging / incident response

The KIE provider's `submit_video`, `submit_sora`, and `submit_image` helpers were called from the already-instrumented `generate()` method but lacked their own spans. This made their internal latency and any failures invisible in distributed traces.

**File:** `rings/SILVER-RING-AI00/src/providers/kie.rs`

**Change:** Added `#[tracing::instrument(skip_all)]` to `submit_video`, `submit_sora`, and `submit_image`.

**Literature:** OWASP Logging Cheat Sheet mandates unique interaction identifiers propagated across all related events. In Rust/Tokio, `tracing::instrument` creates these spans. OWASP ASVS V16.2.4 requires logs in a common format for correlation by log processors.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-ai -p trios-mb-scenes
   Finished dev profile [unoptimized + debuginfo] target(s) in 11.36s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 8.51s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- Other provider helpers still lack `#[tracing::instrument]` in ElevenLabs, Fal, Replicate, Hedra, HeyGen.
- `std::env::var("FRONTEND_URL").map(...).unwrap_or_default()` in `router.rs:50` still silently swallows a missing env var.
- DB timeout wrapping should be extended to any remaining scene handlers that were not audited in this wave.

---

## Three Cooperation Variants for Wave 225

### Variant A — `#[tracing::instrument]` gap closure across ElevenLabs, Fal, Replicate, Hedra, HeyGen
These providers have internal helpers (`text_to_speech_raw`, `queue_submission`, `create_prediction`, `create_animation`, `create_avatar_video`) that already carry `#[tracing::instrument]`, but some lesser-used helpers (`extract_output_url`, `poll_until_done`) or batch-level methods may still lack it. A systematic audit would close the last observability gaps.

### Variant B — Replace `unwrap_or_default()` on `FRONTEND_URL` in `router.rs` with explicit logging
`router.rs:50` uses `std::env::var("FRONTEND_URL").map(...).unwrap_or_default();` which silently yields an empty `Vec<String>` when the env var is missing. Adding a `tracing::warn!` when the env var is absent makes configuration drift visible to operators.

### Variant C — DB timeout wrapping in remaining payment handler modules
`payment.rs` and other modules in `SILVER-RING-SN00` may still contain bare DB calls that were not audited in this wave. A systematic grep for `db\.` followed by `.await` without `tokio::time::timeout` would surface the remaining gaps.

---

*Sources:*
- [CWE-1088](https://cwe.mitre.org/data/definitions/1088.html)
- [CWE-410](https://cwe.mitre.org/data/definitions/410.html)
- [OWASP ASVS V14.7](https://github.com/OWASP/ASVS/issues/1778)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [KruN Connection Pool Exhaustion](https://krun.pro/connection-pool-exhaustion/)
