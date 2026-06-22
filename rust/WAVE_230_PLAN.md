# WAVE 230 PLAN

## Overview
Three input-validation and resource-guard fixes targeting the main-menu text dispatcher, LipSync media upload handler, and Morphing cancel-keyword handler. All changes are scoped to the `trios-mb-scenes` crate and are compile-time verifiable.

---

## Fix 1 — Empty-prompt guard + length cap in `handlers.rs` (main menu text dispatcher)
**Severity:** MEDIUM  
**CWE:** CWE-20 (Improper Input Validation)  
**File:** `rings/SILVER-RING-SN00/src/handlers.rs`

In `handle_main_menu_msg`, user text is extracted with `msg.text()` and immediately passed to `match_text_to_scene()` without checking for empty/whitespace or enforcing a maximum length. Whitespace-only messages silently fall through to the main menu with no user feedback, and unbounded-length messages waste CPU on string comparisons.

**Change:**
1. Add `const MAX_MENU_TEXT_LEN: usize = 500;`.
2. After extracting `text` from `msg.text()`, check `text.trim().is_empty()` first. If true, send a localized error and return.
3. Then check `text.len() > MAX_MENU_TEXT_LEN`. If true, send a localized "text too long" error and return.
4. Only then pass `text` to `match_text_to_scene()`.

---

## Fix 2 — Media file size validation in `lip_sync.rs`
**Severity:** HIGH  
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)  
**File:** `rings/SILVER-RING-SN00/src/lip_sync.rs`

The LipSync handler accepts video, audio, and voice files without checking their size. Telegram Bot API provides `file.size: Option<u32>` on all media types. A multi-gigabyte upload would waste provider quota, exhaust bandwidth, and could cause downstream resource exhaustion.

**Change:**
1. Add constants:
   - `MAX_LIP_SYNC_VIDEO_BYTES: u64 = 100 * 1024 * 1024` (100 MB)
   - `MAX_LIP_SYNC_AUDIO_BYTES: u64 = 50 * 1024 * 1024` (50 MB)
2. In the `msg.video()` branch, check `video.file.size` against `MAX_LIP_SYNC_VIDEO_BYTES` and reject oversized videos with a localized error.
3. In the `msg.audio()` branch, check `audio.file.size` against `MAX_LIP_SYNC_AUDIO_BYTES`.
4. In the `msg.voice()` branch, check `voice.file.size` against `MAX_LIP_SYNC_AUDIO_BYTES`.

---

## Fix 3 — Cancel keyword trim + empty text guard in `morphing.rs`
**Severity:** MEDIUM  
**CWE:** CWE-20 (Improper Input Validation)  
**File:** `rings/SILVER-RING-SN00/src/morphing.rs`

In the Morphing handler's step-1 text branch, `text.contains("Отмена") || text.contains("Cancel")` is checked without `trim()` and without rejecting empty/whitespace input. Whitespace-only messages silently fall through with no feedback. A message like `"  Cancel  "` should match the cancel intent, but a message with unrelated text containing "Cancel" as a substring could accidentally trigger it.

**Change:**
1. Add `const MAX_MORPHING_TEXT_LEN: usize = 500;`.
2. Extract `let trimmed = text.trim();`.
3. Check `trimmed.is_empty()` first. If true, send a localized error and return.
4. Check `text.len() > MAX_MORPHING_TEXT_LEN`. If true, send a "text too long" error and return.
5. Replace `text.contains("Отмена") || text.contains("Cancel")` with `trimmed.eq_ignore_ascii_case("отмена") || trimmed.eq_ignore_ascii_case("cancel")` for exact keyword matching.
6. Add a catch-all localized error for unrecognized text messages in the morphing scene.

---

## Verification
- `cargo check -p trios-mb-scenes` must pass with zero warnings.
- `cargo test -p trios-mb-ai` must continue to pass.
- `cargo test -p trios-mb-db` must continue to pass (pre-existing failures acknowledged).

---

## Scientific Literature
- CWE-20: Improper Input Validation — empty and oversized inputs must be rejected at the earliest chokepoint.
- CWE-770: Allocation of Resources Without Limits or Throttling — unbounded file uploads lead to resource exhaustion and downstream DoS.
- OWASP Input Validation Cheat Sheet: all user-supplied data (text, files, callback data) must be validated before processing.
- CERT C EXP19-C: Use of insufficiently random values is not applicable here, but the principle of validating all external inputs is.

---

## Three Cooperation Variants for Wave 231

### Variant A — Magic-number timeout extraction in provider files
Extract remaining bare `Duration::from_secs(N)` literals in `providers/mod.rs`, `elevenlabs.rs`, `openai.rs`, and `main.rs` to named module-level constants. This completes the timeout-hardening started in Waves 228–229.

### Variant B — `format!` sanitization for user-interpolated strings in `avatar_brain.rs`, `ai_cover.rs`, and `email.rs`
These handlers build display strings with `format!` using user-provided text (`company name`, `audio title`, `email address`). While not currently exploitable for injection, adding a helper that strips Markdown/HTML special characters before interpolation would prevent future injection vectors and ensure clean Telegram message rendering.

### Variant C — DB timeout wrapping in remaining scene handlers
Several scene handlers (e.g., `lip_sync.rs` callback, `hedra_render.rs` callback) still call DB methods without `tokio::time::timeout`. A systematic sweep of all remaining unwrapped DB calls in the `trios-mb-scenes` crate would close the final timeout gaps.
