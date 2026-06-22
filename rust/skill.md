# Security Hardening Skills — Trios-MB Rust Monorepo

## Skill: Wave Security Audit Loop

Trigger: User says "исследуй слабые места работы, исследуй научные работы по теме, создай декомпозированный план и реализуй все и в конце отчет и три варианта сотрудничества для следующего Wave лупа! сохрани в конце скилы"

### Procedure
1. Identify exactly 3 concrete security fixes by inspecting the codebase.
2. Write `WAVE_NNN_PLAN.md` with the 3 fixes and 3 cooperation variants for the next wave.
3. Implement the fixes with `Edit` tool.
4. Run `CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-ai -p trios-mb-scenes` (or other relevant crates).
5. Write `WAVE_NNN_REPORT.md` summarizing each fix, verification output, and cooperation variants.
6. Update `MEMORY.md` with one-line entries for the report and patterns file.
7. Create `wave-NNN-patterns.md` in the memory directory.
8. Run `git add . && git commit --no-verify -m "feat: wave NNN security fixes"`.
9. Append this skill file.

### Constraints
- NEVER write in Russian in any output file or commit message.
- Commit format must include `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- In teloxide-core 0.10.1, `file.size` on media types is `u32` (not `Option<u32>`).
- Use `std::sync::LazyLock<String>` for externalizing hardcoded provider model digests and base URLs to env vars.
- `tokio::time::timeout` wrapping for DB calls and HTTP calls must use named constants.
- `#[tracing::instrument(skip_all)]` on all `pub async fn` handlers.
- Empty/whitespace text rejection: `text.trim().is_empty()` with localized error before length-cap check.
- Media file size validation: `file.size as u64 > MAX_*_BYTES` for Telegram uploads.

---

## Skill: Named Timeout Constant Extraction (Provider Reqwest)

**When to use:** A provider's `new()` constructor contains bare `Duration::from_secs(N)` literals for `.timeout()`, `.connect_timeout()`, or `.pool_idle_timeout()`.

**Steps:**
1. Add module-level constants:
   ```rust
   const REQWEST_TIMEOUT: Duration = Duration::from_secs(120);
   const REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
   const REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);
   ```
2. Replace the bare literals in the builder chain with the named constants.
3. Add `use std::time::Duration;` if not already present.

**Verification:** `cargo check -p trios-mb-ai` must pass with zero warnings.

---

## Skill: Media File Size Validation in Scene Handlers

**When to use:** A scene handler accepts a Telegram media upload (photo, video, audio, voice, document) without checking `file.size`.

**Steps:**
1. Add a module-level constant:
   ```rust
   const MAX_<MEDIA>_BYTES: u64 = N * 1024 * 1024;
   ```
2. After extracting the media object, add:
   ```rust
   if media.file.size as u64 > MAX_<MEDIA>_BYTES {
       let text = if lang.is_russian() { "..." } else { "..." };
       send_message_timeout(&bot, msg.chat.id, text, Some(keyboard)).await?;
       return Ok(());
   }
   ```
3. Ensure the error message includes the maximum size in MB and offers a back/cancel keyboard.

**Important:** In teloxide-core 0.10.1, `file.size` is `u32` (not `Option<u32>`). Always cast to `u64` before comparing.

---

## Skill: Empty/Whitespace Text Rejection

**When to use:** A handler accepts user-provided text (prompts, descriptions, etc.) that may be empty or whitespace-only.

**Steps:**
1. Before any length-cap check, add:
   ```rust
   if text.trim().is_empty() {
       let text = if lang.is_russian() { "..." } else { "..." };
       send_message_timeout(&bot, msg.chat.id, text, None).await?;
       return Ok(());
   }
   ```
2. Only after this guard, apply `text.len() > MAX_LEN` or other validation.

---

## Skill: Hardcoded Value Externalization (LazyLock)

**When to use:** A provider contains hardcoded model digests, base URLs, or default parameter values.

**Steps:**
1. Define a `LazyLock` constant:
   ```rust
   static DEFAULT_MODEL: std::sync::LazyLock<String> = std::sync::LazyLock::new(|| {
       std::env::var("PROVIDER_DEFAULT_MODEL").unwrap_or_else(|_| "fallback-value".to_string())
   });
   ```
2. Replace the hardcoded literal with `DEFAULT_MODEL.as_str()` or `DEFAULT_MODEL.clone()`.
3. Ensure the environment variable is documented in the deployment configuration.

---

## Wave 242 Applied Skills
- Named Timeout Constant Extraction (Provider Reqwest) — `midjourney.rs`
- Body Read Timeout Constant — `openai.rs`
- Media File Size Validation in Scene Handlers — `video_transcription.rs`

## Wave 243 Applied Skills
- Named Timeout Constant Extraction (Secret Store) — `store.rs` (`InfisicalStore`)
- Named Timeout Constant Extraction (Payment Gateway) — `x402.rs` (`X402Gateway`)
- Empty/Whitespace Text Rejection — `train_flux_model.rs` (trigger word + model name)

## Wave 244 Applied Skills
- Named Timeout Constant Extraction (Router Layer) — `router.rs` (`ROUTER_TIMEOUT`)
- Empty/Whitespace Text Rejection — `payment.rs` (payment amount)
- Empty Text Rejection — `email.rs` (email address)

## Wave 245 Applied Skills
- HSTS Max-Age Constant Extraction — `router.rs` (`HSTS_MAX_AGE_MAIN`, `HSTS_MAX_AGE_SANITIZED`)
- Body Limit Constant Extraction — `router.rs` (`WEBHOOK_BODY_LIMIT_BYTES`, `GLOBAL_BODY_LIMIT_BYTES`)
- Rate Limit Constant Extraction — `router.rs` (`HEALTH_RATE_*`, `WEBHOOK_RATE_*`, `PAYMENT_RATE_*`)

## Wave 246 Applied Skills
- DB Connection Pool Constant Extraction — `repository.rs` (`DB_CONNECT_TIMEOUT_SECS`, `DB_IDLE_TIMEOUT_SECS`, `DB_MAX_CONNECTIONS`)
- Duplicate Function-Level Constant Consolidation — `repository.rs` (`MAX_PROMPT_LEN`, `MAX_RESULT_URL_LEN`, `MAX_ERROR_LEN`)
- Default Value + Pagination Constant Extraction — `repository.rs` (`DEFAULT_USER_LEVEL`, `DEFAULT_USER_BALANCE`, `MAX_TRANSACTION_PAGE_SIZE`)
