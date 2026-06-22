# WAVE 230 REPORT

## Summary
Three input-validation and resource-guard fixes applied: empty-prompt guard + length cap in the main menu text dispatcher, media file size validation in the LipSync handler, and cancel-keyword trim + empty text guard in the Morphing handler. All changes compile cleanly and existing tests pass.

---

## Fix 1 — Empty-prompt guard + length cap in `handlers.rs`
**Severity:** MEDIUM  
**Category:** CWE-20 (Improper Input Validation)

The `handle_main_menu_msg` dispatcher extracts user text with `msg.text()` and immediately passes it to `match_text_to_scene()` without checking for empty/whitespace input or enforcing a maximum length. Whitespace-only messages silently fell through to the main menu with no feedback. Unbounded-length messages wasted CPU cycles on string comparisons against localized menu labels.

**File:** `rings/SILVER-RING-SN00/src/handlers.rs`

**Change:**
1. Added `const MAX_MENU_TEXT_LEN: usize = 500;`.
2. After extracting `text`, check `text.trim().is_empty()` first. If true, send a localized error and return.
3. Then check `text.len() > MAX_MENU_TEXT_LEN`. If true, send a localized "text too long" error and return.
4. Only then pass `text` to `match_text_to_scene()`.

**Literature:** CWE-20. All user-supplied text must be validated at the earliest chokepoint. OWASP Input Validation Cheat Sheet recommends rejecting empty values before format-specific validation. Length caps prevent resource exhaustion from multi-megabyte paste bombs.

---

## Fix 2 — Media file size validation in `lip_sync.rs`
**Severity:** HIGH  
**Category:** CWE-770 (Allocation of Resources Without Limits or Throttling)

The LipSync handler accepted `msg.video()`, `msg.audio()`, and `msg.voice()` without checking `file.size` (available on all three media types in teloxide-core). A multi-gigabyte upload would waste provider quota, exhaust bandwidth, and could cause downstream resource exhaustion in the AI pipeline.

**File:** `rings/SILVER-RING-SN00/src/lip_sync.rs`

**Change:**
1. Added constants:
   - `MAX_LIP_SYNC_VIDEO_BYTES: u64 = 100 * 1024 * 1024` (100 MB)
   - `MAX_LIP_SYNC_AUDIO_BYTES: u64 = 50 * 1024 * 1024` (50 MB)
2. In the `msg.video()` branch, check `video.file.size as u64 > MAX_LIP_SYNC_VIDEO_BYTES` and reject oversized videos with a localized error.
3. In the `msg.audio()` branch, check `audio.file.size as u64 > MAX_LIP_SYNC_AUDIO_BYTES`.
4. In the `msg.voice()` branch, check `voice.file.size as u64 > MAX_LIP_SYNC_AUDIO_BYTES`.

**Literature:** CWE-770. Unbounded resource consumption is a classic DoS vector. CERT C MEM35-C and OWASP's Unvalidated Redirects and Forwards guidance both emphasize that any user-provided file must be size-validated before downstream processing. NIST SP 800-53 SI-10 requires resource-limit enforcement for information system inputs.

---

## Fix 3 — Cancel keyword trim + empty text guard in `morphing.rs`
**Severity:** MEDIUM  
**Category:** CWE-20 (Improper Input Validation)

In the Morphing handler's step-1 text branch, `text.contains("Отмена") || text.contains("Cancel")` was checked without first validating for empty/whitespace input or trimming the text. Whitespace-only messages silently fell through with no user feedback. Substring matching via `.contains()` could also accidentally trigger on unrelated text containing those words.

**File:** `rings/SILVER-RING-SN00/src/morphing.rs`

**Change:**
1. Added `const MAX_MORPHING_TEXT_LEN: usize = 500;`.
2. Extracted `let trimmed = text.trim();`.
3. Check `trimmed.is_empty()` first. If true, send a localized error and return.
4. Check `text.len() > MAX_MORPHING_TEXT_LEN`. If true, send a "text too long" error and return.
5. Replaced substring matching with exact case-insensitive comparison: `trimmed.eq_ignore_ascii_case("отмена") || trimmed.eq_ignore_ascii_case("cancel")`.
6. Added a catch-all localized error for unrecognized text messages in the morphing scene, so the user receives feedback instead of silent drop.

**Literature:** CWE-20. Empty and whitespace-only inputs must be rejected at the earliest chokepoint. Exact keyword matching is preferred over substring matching for command intents, as substring matching creates false-positive cancellation risks.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-server -p trios-mb-scenes -p trios-mb-ai
   Finished dev profile [unoptimized + debuginfo] target(s) in 5.14s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 0.14s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- Magic-number timeout extraction in `providers/mod.rs`, `elevenlabs.rs`, `openai.rs`, `main.rs`
- `database_url` SecretString migration
- Media file size validation in `ai_cover.rs` and `hedra_render.rs`
- Complete model digest externalization in `replicate.rs`
- `format!` sanitization for user-interpolated strings in `avatar_brain.rs`, `ai_cover.rs`, `email.rs`
- DB timeout wrapping in remaining scene handlers

---

## Three Cooperation Variants for Wave 231

### Variant A — Magic-number timeout extraction in provider files
Extract remaining bare `Duration::from_secs(N)` literals in `providers/mod.rs`, `elevenlabs.rs`, `openai.rs`, and `main.rs` to named module-level constants. This completes the timeout-hardening started in Waves 228–230.

### Variant B — `format!` sanitization for user-interpolated strings
Handlers in `avatar_brain.rs`, `ai_cover.rs`, and `email.rs` build display strings with `format!` using user-provided text (`company name`, `audio title`, `email address`). While not currently exploitable for injection, adding a helper that strips Markdown/HTML special characters before interpolation would prevent future injection vectors and ensure clean Telegram message rendering.

### Variant C — DB timeout wrapping in remaining scene handlers
Several scene handlers (e.g., `lip_sync.rs` callback, `hedra_render.rs` callback) still call DB methods without `tokio::time::timeout`. A systematic sweep of all remaining unwrapped DB calls in the `trios-mb-scenes` crate would close the final timeout gaps.
