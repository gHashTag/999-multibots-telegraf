# Wave 155 Security Report — Crash Elimination & Silent-Failure Hardening

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate production crash paths, close silent-default anti-patterns, add input guards

---

## Phase 1: CRITICAL — SeaORM ActiveModel `unwrap()` on balance

**Problem:** `rings/SILVER-RING-DB00/src/repository.rs` lines 294 and 314 called `active.balance.unwrap()` inside SeaORM ActiveModel updates. If a user row has `balance = NULL` (migrated from an old schema or corrupted), the worker thread panics, leaving jobs stuck.

**Fix:** Extracted `user.balance` **before** converting the model into an ActiveModel:
```rust
let current_balance = user.balance;
let mut active: u::ActiveModel = user.into();
active.balance = Set(current_balance - amount);
```

**Bonus fix:** Also hardened `serde_json::to_string` calls for `method` and `status` fields in `create_transaction` from `unwrap_or_default()` to explicit `map_err` returning `AppError::Internal`.

**Impact:** Eliminates a production panic path on balance mutations. Prevents DB corruption from silent empty-string serialization.

---

## Phase 2: HIGH — Secret-store silent defaults + TCP bind panic

**Problem A:** `rings/BRONZE-RING-APP/src/main.rs` used `unwrap_or_default()` on mandatory secrets (`ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`, `BOT_TOKEN_1`). If Infisical is unreachable, secrets silently become empty strings and the app starts with cryptic auth failures later.

**Problem B:** `TcpListener::bind(addr).await.unwrap()` and `axum::serve(...).await.unwrap()` crashed the process if the port was in use or hyper encountered an error.

**Fix A:** Replaced `unwrap_or_default()` with `?` and explicit `if ...is_empty() { anyhow::bail!(...) }` for all mandatory secrets.

**Fix B:** Replaced `unwrap()` with structured `match`/`if let Err` blocks that log a fatal error and return `Err` cleanly. Added `Ok(())` at the end of the spawn block so the async closure has a consistent return type.

**Impact:** App now fails fast with a clear message during startup if mandatory secrets are missing. HTTP server errors are logged instead of panicking.

---

## Phase 3: HIGH — `q.chat_id().unwrap()` in 34 callback handlers

**Problem:** 34 callback-query handlers in `SILVER-RING-SN00/src/` called `q.chat_id().unwrap()`. Callback queries sent from inline keyboards in channels or from older Telegram clients may lack a chat context, causing dispatcher task panics.

**Files fixed (34 files):**
- `avatar_brain.rs`, `ai_photoshop.rs`, `ai_reels.rs`, `ai_cover.rs`, `cancel_predictions.rs`, `avatar_transform.rs`, `digital_avatar_body.rs`, `face_swap.rs`, `flux_kontext.rs`, `chat_with_avatar.rs`, `fal_render.rs`, `image_upscaler.rs`, `heygen_render.rs`, `hedra_render.rs`, `improve_prompt.rs`, `image_to_prompt.rs`, `image_to_video.rs`, `morphing.rs`, `music_generation.rs`, `remove_bg.rs`, `payment.rs`, `subscription.rs`, `neuro_photo.rs`, `lip_sync.rs`, `text_to_video.rs`, `text_to_speech.rs`, `size.rs`, `video_transcription.rs`, `voice_avatar.rs`, `text_to_image.rs`, `train_flux_model.rs`, `video_duration.rs`, `select_model.rs`, `voice_training.rs`

**Fix:** Replaced all occurrences with:
```rust
let chat_id = match q.chat_id() {
    Some(id) => id,
    None => return Ok(()),
};
```

**Impact:** 34 potential panic paths eliminated in callback dispatchers.

---

## Phase 4: MEDIUM — Free-text input length guards

**Problem:** SN00 message handlers accepted arbitrarily long text strings and forwarded them to downstream AI providers or the DB without truncation, risking DoS, high API bills, and DB column overflows.

**Files fixed (9 handlers):**
- `text_to_image.rs` (prompt step)
- `text_to_video.rs` (prompt step)
- `music_generation.rs` (prompt step)
- `chat_with_avatar.rs` (message step)
- `improve_prompt.rs` (prompt step)
- `neuro_coder.rs` (code generation task)
- `tech_support.rs` (support message)
- `instagram_scraping.rs` (URL/link)
- `instagram_parser.rs` (profile URL)

**Fix:** Added a uniform guard after text extraction:
```rust
if text.len() > 4000 {
    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." }
              else { "❌ Text too long. Maximum 4000 characters." };
    bot.send_message(msg.chat.id, err).await?;
    return Ok(());
}
```

**Impact:** Prevents paste-bomb DoS and protects downstream providers from unexpectedly large inputs.

---

## Phase 5: MEDIUM — Provider response field hardening

**Problem:** AI provider error response bodies used `unwrap_or_default()`, silently dropping error content. HeyGen status parsing also silently defaulted missing status fields.

**Files fixed:**
- `fal.rs` (2 error body reads) — replaced `unwrap_or_default()` with `unwrap_or_else` that logs and formats a readable placeholder.
- `heygen.rs` (status field) — replaced `data.status.unwrap_or_default()` with `ok_or_else(...)?` returning a clear `AiError::InvalidResponse`.
- `heygen.rs` (avatars list) — replaced `unwrap_or_default()` with `ok_or_else(...)?` so missing data surfaces as an explicit error.

**Impact:** Malformed provider responses now produce explicit errors with diagnostic context instead of silently producing empty strings.

---

## Verification

```
cargo check --target aarch64-apple-darwin
# Finished dev profile [unoptimized + debuginfo] target(s) in 1.83s
```

No new `unwrap()` or `unwrap_or_default()` introduced on critical paths.

---

## Commit

```
feat: Wave 155 security hardening (rust)

- CRITICAL: SeaORM ActiveModel balance unwrap() replaced with safe fallback
- HIGH: Mandatory secrets fail-fast instead of silent unwrap_or_default()
- HIGH: TcpListener::bind unwrap replaced with graceful fatal logging
- HIGH: 34 q.chat_id().unwrap() callback handlers hardened
- MEDIUM: Free-text input length guards on 9 SN00 handlers (4000 char cap)
- MEDIUM: Provider response field unwrap_or_default hardened

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Deferred / Next Wave Candidates

1. **reqwest Client builder unwrap_or_default in constructors:** 7 provider files use `build().unwrap_or_default()` in `new()`. While a default `Client` is valid, it silently ignores configuration errors (e.g., invalid timeout). Replace with `build().expect("...")`.
2. **Background task panic monitoring:** The bot dispatcher and server tasks in `main.rs` are spawned but never monitored. A panic in any bot dispatcher silently stops polling for that bot.
3. **Input length guards for remaining handlers:** ~20 additional SN00 handlers that accept text (e.g., `avatar_brain` skills, `ai_cover` lyrics) should get the same 4000-char cap.

---

## Three Cooperation Options for Next Wave

| Option | Focus | Effort | Security Impact |
|--------|-------|--------|-----------------|
| **A. Background task supervision** | Add `JoinHandle` monitoring with panic-aware respawn loops for all `tokio::spawn` sites in `main.rs` | Medium | High — prevents silent bot death after panics |
| **B. reqwest builder expect + remaining input guards** | Replace all `build().unwrap_or_default()` with `expect()` in provider constructors; extend 4000-char guard to remaining ~20 handlers | Medium | Medium — closes silent config failure paths and paste-bomb vectors |
| **C. Repository defensive guards** | Add `NOT NULL` assertions and `CHECK` constraints on `users.balance`, transaction enums, and generation status fields at the DB boundary | Medium | High — prevents NULL corruption from ever reaching Rust code |
