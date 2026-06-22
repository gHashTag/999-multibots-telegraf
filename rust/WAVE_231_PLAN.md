# WAVE 231 PLAN

## Overview
Three fixes: named timeout constants in the shared provider helper module, media file size validation in the AI Cover handler, and media file size validation in the Hedra Render handler. All are compile-time verifiable and close resource-exhaustion gaps.

---

## Fix 1 — Named timeout constants in `providers/mod.rs`
**Severity:** HIGH  
**CWE:** CWE-547 (Use of Hard-coded, Security-relevant Constants)
**File:** `rings/SILVER-RING-AI00/src/providers/mod.rs`

`read_error_body` and `parse_json_limited` both contain bare `Duration::from_secs(10)` and `Duration::from_secs(30)` literals. These are security-relevant timeout controls; they should be named constants so ops can grep, audit, and tune them.

**Change:**
1. Add `const ERROR_BODY_READ_TIMEOUT: Duration = Duration::from_secs(10);`
2. Add `const JSON_BODY_READ_TIMEOUT: Duration = Duration::from_secs(30);`
3. Replace inline literals in `read_error_body` and `parse_json_limited`.

---

## Fix 2 — Media file size validation in `ai_cover.rs`
**Severity:** HIGH  
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
**File:** `rings/SILVER-RING-SN00/src/ai_cover.rs`

The AI Cover handler accepts `msg.audio()` without checking `audio.file.size`. A multi-gigabyte audio upload would waste provider credits and bandwidth.

**Change:**
1. Add `const MAX_AI_COVER_AUDIO_BYTES: u64 = 50 * 1024 * 1024;` (50 MB).
2. Check `audio.file.size as u64 > MAX_AI_COVER_AUDIO_BYTES` before storing `audio_url`.
3. Reject with a localized error and return early.

---

## Fix 3 — Media file size validation in `hedra_render.rs`
**Severity:** HIGH  
**CWE:** CWE-770 (Allocation of Resources Without Limits or Throttling)
**File:** `rings/SILVER-RING-SN00/src/hedra_render.rs`

The Hedra Render handler accepts `msg.photo()` (step 1) and `msg.voice()` (step 2) without checking `file.size`. Large uploads would waste provider quota.

**Change:**
1. Add `const MAX_HEDRA_IMAGE_BYTES: u64 = 20 * 1024 * 1024;` (20 MB)
2. Add `const MAX_HEDRA_VOICE_BYTES: u64 = 50 * 1024 * 1024;` (50 MB)
3. In step 1, check `photo.file.size as u64 > MAX_HEDRA_IMAGE_BYTES` before storing.
4. In step 2, check `voice.file.size as u64 > MAX_HEDRA_VOICE_BYTES` before storing.
5. Reject with localized errors.

---

## Verification
- `cargo check -p trios-mb-ai -p trios-mb-scenes`
- `cargo test -p trios-mb-ai`

---

## Literature
- CWE-547: Hard-coded constants prevent operational tuning and hide security controls.
- CWE-770: Unbounded file uploads lead to resource exhaustion and downstream DoS.
- CERT C EXP19-C: Use sufficiently random values is not directly applicable, but the principle of validating all external inputs is.

---

## Three Cooperation Variants for Wave 232

### Variant A — `format!` sanitization for user-interpolated strings
`avatar_brain.rs`, `ai_cover.rs`, and `email.rs` build display strings with `format!` using user-provided text. A helper that strips Markdown/HTML special characters before interpolation would prevent message-formatting breakage.

### Variant B — Complete model digest externalization in `replicate.rs`
Remaining hardcoded model identifiers (`flux`, `sd3`, `face-swap`) in `resolve_model_version` should be externalized to env vars via `LazyLock<String>`, completing the work started in Wave 227.

### Variant C — DB timeout wrapping in remaining scene callback handlers
A systematic sweep of scene callback handlers that call DB methods without `tokio::time::timeout` to close any remaining timeout gaps.
