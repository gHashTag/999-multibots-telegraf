# WAVE 227 PLAN

## Objective
Close the last unwrapped Telegram API timeout gap, add an empty-prompt guard to a newly-discovered handler, and externalize a hardcoded AI provider model digest to prevent deployment breakage on digest rotation.

---

## Finding 1 — `bot.get_me()` without timeout in Instagram handlers
**Severity:** HIGH (CWE-1088)

`instagram_scraping.rs` and `instagram_parser.rs` both call `bot.get_me().await` directly without wrapping it in `tokio::time::timeout`. If the Telegram API stalls during this call, the bot worker thread hangs indefinitely. Unlike `send_message` and `answer_callback_query` which were systematically wrapped in earlier waves, `get_me()` was missed because it is used only in the Instagram feature.

**Remediation:**
- Add `const TELEGRAM_API_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);` in both files.
- Wrap each `bot.get_me().await` in `tokio::time::timeout(TELEGRAM_API_TIMEOUT, ...)`.
- On timeout, log `tracing::warn!` and return `Ok(())`.

**Literature:** CWE-1088. Synchronous access to remote resources without explicit timeouts causes thread-pool exhaustion. A single stalled `get_me()` call blocks one Tokio worker; under concurrent load, repeated stalls can exhaust the runtime.

---

## Finding 2 — Missing empty-prompt validation in `neuro_photo.rs`
**Severity:** MEDIUM (CWE-20)

`neuro_photo.rs` accepts user text in step 2 (after an image has been uploaded). It checks `text.len() > MAX_DIALOGUE_TEXT_LEN` but never rejects empty or whitespace-only prompts. An empty prompt is forwarded to the AI provider, consuming generation credits for no output.

**Remediation:**
- Add `if text.trim().is_empty()` immediately after entering the text-processing block.
- Send localized error and return `Ok(())`.

**Literature:** CWE-20. Empty/whitespace input should be rejected at the earliest chokepoint before downstream resource allocation. OWASP Input Validation Cheat Sheet.

---

## Finding 3 — Hardcoded Replicate model digest
**Severity:** MEDIUM (CWE-547 / operational resilience)

`replicate.rs::resolve_model_version` bakes the exact SDXL model digest into source code:
`"stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc"`.
If Replicate deprecates or rotates this digest, image rendering fails for all users until a code rebuild and redeploy. Externalizing it to an environment variable with the current digest as a safe fallback allows ops to update the model without recompiling.

**Remediation:**
- Add `std::sync::LazyLock<String>` env var reader `REPLICATE_SDXL_MODEL` with hardcoded fallback.
- Update `resolve_model_version` `"sdxl"` arm to use the `LazyLock` value.

**Literature:** CWE-547 — use of hard-coded security-relevant constants. While a model digest is not a secret, it is a deployment-critical constant that should be configurable without recompilation. Twelve-Factor App methodology mandates config in environment variables.

---

## Implementation Order
1. `instagram_scraping.rs` + `instagram_parser.rs` — `bot.get_me()` timeout
2. `neuro_photo.rs` — empty-prompt guard
3. `replicate.rs` — SDXL model digest env var

## Verification Steps
- `CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-scenes -p trios-mb-ai`
- `CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai`

---

## Deferred Items
- Media file size / duration validation in `lip_sync.rs`, `voice_training.rs`, `ai_cover.rs`, `hedra_render.rs`
- Webhook handler owned-method migration (requires `telegram_id` extraction refactor)
- `database_url` SecretString migration (custom Debug already redacts; wider refactor needed)
- Remaining photo handlers without count limits (`face_swap.rs`, `digital_avatar_body.rs`, `ai_photoshop.rs`)
