# Wave 155 Security Plan — Crash Elimination & Silent-Failure Hardening

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate production crash paths, close silent-default anti-patterns, add input guards

---

## Phase 1: CRITICAL — SeaORM ActiveModel `unwrap()` on balance

**Problem:** `rings/SILVER-RING-DB00/src/repository.rs` lines ~294 and ~314 call `active.balance.unwrap()` inside SeaORM ActiveModel updates. If a user row has `balance = NULL` (migrated from an old schema or corrupted), the worker thread panics, leaving jobs stuck.

**File:** `SILVER-RING-DB00/src/repository.rs`

**Fix:** Replace `active.balance.unwrap() - amount` with `active.balance.as_ref().map(|b| b - amount).unwrap_or(0.0)` or handle `None` explicitly.

---

## Phase 2: HIGH — Secret-store silent defaults + TCP bind panic

**Problem A:** `rings/BRONZE-RING-APP/src/main.rs` uses `unwrap_or_default()` on mandatory secrets (`ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD1`, `ROBOKASSA_PASSWORD2`, `BOT_TOKEN_1`). If Infisical is unreachable, the app starts with empty secrets and fails later with cryptic auth errors.

**Problem B:** The same file `unwrap()`s on `TcpListener::bind` and `axum::serve`, crashing the process if the port is in use.

**Fix A:** Fail fast with `expect("... is required")` for mandatory secrets.
**Fix B:** Replace `unwrap()` with `match` that logs a fatal error and exits cleanly.

---

## Phase 3: HIGH — `q.chat_id().unwrap()` in 34 callback handlers

**Problem:** 34 callback-query handlers in `SILVER-RING-SN00/src/` call `q.chat_id().unwrap()`. Callbacks from inline keyboards in channels or from older Telegram clients may lack a chat context, causing dispatcher task panics.

**Fix:** Replace with `match q.chat_id() { Some(id) => id, None => return Ok(()) }` in all 34 occurrences.

---

## Phase 4: MEDIUM — Free-text input length guards

**Problem:** SN00 message handlers accept arbitrarily long text strings and forward them to downstream AI providers or the DB without truncation. This risks DoS, high API bills, and DB column overflows.

**Files:** Representative high-impact handlers:
- `text_to_image.rs` (prompt)
- `text_to_video.rs` (prompt)
- `music_generation.rs` (prompt)
- `chat_with_avatar.rs` (message)
- `improve_prompt.rs` (prompt)
- `neuro_coder.rs` (prompt)
- `tech_support.rs` (user_message)
- `instagram_scraping.rs` (URL)
- `instagram_parser.rs` (URL)

**Fix:** Add a uniform `MAX_INPUT_LEN: usize = 4000` guard. If exceeded, return a localized error and exit.

---

## Phase 5: MEDIUM — Provider response field hardening

**Problem:** Several AI providers extract required JSON fields with `.unwrap_or_default()`, silently producing empty strings on malformed responses instead of surfacing an error.

**Files:**
- `hedra.rs:64`
- `replicate.rs:54`
- `kie.rs:64`
- `elevenlabs.rs:71`
- `openai.rs:82,99,111`
- `heygen.rs:114`

**Fix:** Replace `unwrap_or_default()` with `ok_or_else(...)?` for required fields.

---

## Verification

- `cargo check --target aarch64-apple-darwin`
- Confirm no new `unwrap()` or `unwrap_or_default()` on critical paths

---

## Commit Message Template

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
