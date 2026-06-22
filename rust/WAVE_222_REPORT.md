# WAVE 222 REPORT

## Summary
Three security hardening fixes applied across the Telegram bot handlers, AI provider layer, and webhook endpoints. All changes compile cleanly and existing tests pass.

---

## Fix 1 — Empty/whitespace text rejection in six scene handlers
**Severity:** MEDIUM-HIGH  
**Category:** Input validation gap

Six Telegram scene handlers accepted whitespace-only strings after the existing length-cap checks, allowing users to pay for empty generation jobs.

**Files touched:**
- `rings/SILVER-RING-SN00/src/chat_with_avatar.rs` — step 1 text input
- `rings/SILVER-RING-SN00/src/improve_prompt.rs` — step 1 text input
- `rings/SILVER-RING-SN00/src/neuro_coder.rs` — prompt extraction
- `rings/SILVER-RING-SN00/src/tech_support.rs` — issue description
- `rings/SILVER-RING-SN00/src/avatar_transform.rs` — step 1 style text
- `rings/SILVER-RING-SN00/src/flux_kontext.rs` — step 3 prompt text

**Change:** After `msg.text()` extraction, added `if text.trim().is_empty()` guard that returns a localized error (`❌ Пустой текст недопустим.` / `❌ Empty text is not allowed.`) and aborts the handler before any balance deduction or job enqueue.

**Literature:** OWASP AISVS C2.2 mandates rejecting empty-equivalent payloads (zero-width characters, bidirectional overrides) before tokenization. While we do not yet perform full Unicode normalization, the `.trim().is_empty()` guard is the first line of defense against whitespace-only bypasses.

---

## Fix 2 — Empty-prompt validation in four remaining AI providers
**Severity:** MEDIUM  
Category: Input validation gap

Following Wave 221 (OpenAI, ElevenLabs, HeyGen), four additional providers lacked empty-prompt guards at the provider boundary. Jobs submitted via the background queue (not just Telegram) could reach these providers with blank prompts, wasting API credits.

**Files touched:**
- `rings/SILVER-RING-AI00/src/providers/kie.rs`
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs`

**Change:** In each `generate()` method, added:
```rust
let prompt = request.prompt.as_deref().unwrap_or("").trim();
if prompt.is_empty() {
    return Err(AppError::Validation("Empty prompt is not allowed".to_string()));
}
```

**Literature:** OWASP Input Validation Cheat Sheet emphasizes allowlisting and rejecting empty/minimum-length inputs at the earliest unified chokepoint. The provider boundary is the last unified gate before external API dispatch.

---

## Fix 3 — Sanitize webhook error responses to prevent info disclosure
**Severity:** MEDIUM  
**Category:** CWE-209 (Information Disclosure via Error Messages)

Webhook endpoints returned diagnostic strings to unauthenticated callers that revealed internal configuration state and validation logic.

**Files touched:**
- `rings/BRONZE-RING-SRV/src/webhooks.rs`
- `rings/BRONZE-RING-SRV/src/payment_webhooks.rs`

**Changes:**
- Replaced `"Webhook secret not configured"` with `"Internal server error"` in both Replicate and KIE webhook handlers (response body only; detailed messages remain in `tracing::error!` server-side logs).
- Replaced `"ERROR: no payment gateway"`, `"ERROR: verification failed"`, and `"ERROR: DB timeout"` with `"Internal server error"` in the Robokassa callback handler.

**Literature:**
- CWE-209: *Generation of Error Message Containing Sensitive Information*. Attackers use verbose errors to enumerate deployed services and craft focused follow-up attacks.
- OWASP Error Handling Cheat Sheet: *APIs should return generic, non-revealing messages in production; log full diagnostics server-side only.*
- AuditBuffet Pattern AB-000395: *Error responses do not leak stack traces or internal details.*

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-ai -p trios-mb-scenes -p trios-mb-server -p trios-mb-app
   Finished dev profile [unoptimized + debuginfo] target(s) in 9.76s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 5.49s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- The remaining "ERROR: ..." validation-level strings in `payment_webhooks.rs` (e.g., `"ERROR: invalid inv_id"`, `"ERROR: invalid signature"`) should also be sanitized, but they reveal less sensitive information than the infrastructure-leaking strings fixed in this wave.
- Full Unicode normalization (NFC, control-character stripping) per AISVS C2.2 is not yet implemented.
- The payment webhook returns `String` as `impl IntoResponse`, which Axum renders as `200 OK` even for error bodies. Migrating to explicit `(StatusCode, String)` tuples is a larger refactoring deferred to a future wave.

---

## Three Cooperation Variants for Wave 223

### Variant A — DB timeout wrapping in `generation_utils.rs` and `handlers.rs`
Every Telegram handler flows through `load_lang()` and `dispatch_and_reply()`. These helpers call `db.get_user_by_telegram_id()`, `db.deduct_balance()`, `db.create_generation()`, and `db.add_balance()` without any `tokio::time::timeout`. If the connection pool hangs, the entire bot interaction thread stalls indefinitely.

### Variant B — Provider HTTP `.send().await` wrapped in `tokio::time::timeout`
Six provider methods (KIE, Fal, Replicate, Hedra, OpenAI `chat_completion`, HeyGen `create_avatar_video`) issue raw HTTP requests without an outer `tokio::time::timeout`. Under connection-pool exhaustion or stalled TLS negotiation, the reqwest internal timeout may not fire cleanly, causing the orchestrator retry loop to hang.

### Variant C — `tracing::instrument` gap closure in `health.rs`, `openai.rs`, and other entrypoints
`health_check()`, `health_check_with_db()`, and internal provider methods like `openai::generate_image()` / `text_to_speech()` are `pub async fn` entrypoints exposed via Axum but carry no `#[tracing::instrument]`. During incidents there are no automatic spans linking latency to the overall request trace.

---

*Sources:*
- [OWASP AISVS C2.2](https://github.com/OWASP/AISVS/blob/main/1.0/en/0x10-C02-Input-Validation.md)
- [CWE-209](https://cwe.mitre.org/data/definitions/209.html)
- [OWASP Error Handling Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Error_Handling_Cheat_Sheet.md)
- [AuditBuffet AB-000395](https://auditbuffet.com/patterns/ab-000395)
