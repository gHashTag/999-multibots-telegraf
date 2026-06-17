# Wave 154 Security Plan — Panic Elimination & Stub Honesty

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate panic paths, make provider cancellation stubs honest, add webhook task_id validation

---

## Phase 1: Telegram Message Text Panic Elimination

**Problem:** 4 handlers in `SILVER-RING-SN00` call `msg.text().unwrap().to_string()` without checking if the message actually contains text. If the user sends a photo, sticker, or voice message while in these states, the bot panics.

**Files:**
- `SILVER-RING-SN00/src/instagram_scraping.rs:24`
- `SILVER-RING-SN00/src/instagram_parser.rs:25`
- `SILVER-RING-SN00/src/neuro_coder.rs:27`
- `SILVER-RING-SN00/src/tech_support.rs:25`

**Fix:** Replace `msg.text().unwrap()` with `match msg.text()` that returns a localized error message if no text is present.

---

## Phase 2: Provider Cancel Stub Honesty

**Problem:** Most AI providers (`openai`, `fal`, `hedra`, `kie`, `elevenlabs`, `midjourney`, `heygen`) implement `cancel()` as a silent no-op returning `Ok(())`. This misleads callers into believing resources were freed while upstream providers continue charging.

**Files:**
- `SILVER-RING-AI00/src/providers/{openai,fal,hedra,kie,elevenlabs,midjourney,heygen}.rs`

**Fix:** Replace `Ok(())` with a clear `AppError::Ai(AiError::Provider { ... })` stating that cancellation is not supported by the provider.

---

## Phase 3: Webhook Task ID Anti-Pattern

**Problem:** `kie_ai_webhook` in `BRONZE-RING-SRV/src/webhooks.rs:81` uses `payload.task_id.as_deref().unwrap_or_default()`. An empty/missing task_id becomes an empty string, which then fails UUID parsing. While the parse_uuid guard catches it, the pattern itself is an anti-pattern.

**File:** `BRONZE-RING-SRV/src/webhooks.rs`

**Fix:** Replace `unwrap_or_default()` with explicit `match` that returns a clear error if task_id is missing.

---

## Phase 4: Morphing / Flux Training State Guards

**Problem:** `morphing.rs` and `train_flux_model.rs` use `state.images.clone().unwrap_or_default()`. An empty images list bypasses the `images.len() >= N` guard in some code paths and can cause downstream failures.

**Files:**
- `SILVER-RING-SN00/src/morphing.rs:41,111,166`
- `SILVER-RING-SN00/src/train_flux_model.rs:40`

**Fix:** Add explicit guards that return the user to the menu with a warning if required state fields are missing or empty.

---

## Phase 5: file_id Sentinel Guard

**Problem:** Multiple handlers extract `file_id` from photos with `photos.last().map(|p| p.file.id.clone()).unwrap_or_default()`. An empty `file_id` string gets stored in state and passed to downstream providers, causing cryptic errors.

**Files:** ~15 files in `SILVER-RING-SN00/src/`

**Fix:** Replace `unwrap_or_default()` with `ok_or_else()` that returns an error if no photo file_id is found.

---

## Verification

- `cargo check --target aarch64-apple-darwin`
- Confirm no new `unwrap()` or `unwrap_or_default()` introduced on critical paths

---

## Commit Message Template

```
feat: Wave 154 security hardening (rust)

- Eliminated 4 panic paths from msg.text().unwrap() in SN00 handlers
- Provider cancel stub honesty: 7 providers now return clear error instead of silent Ok(())
- Webhook task_id validation: removed unwrap_or_default anti-pattern
- State field guards in morphing and flux training (empty image list protection)
- file_id sentinel guard across 15 photo handlers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
