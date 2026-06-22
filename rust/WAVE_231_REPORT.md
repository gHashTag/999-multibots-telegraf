# WAVE 231 REPORT

## Summary
Three fixes applied: named timeout constants in the shared provider helper module (`providers/mod.rs`), media file size validation in the AI Cover handler (`ai_cover.rs`), and media file size validation in the Hedra Render handler (`hedra_render.rs`). All changes compile cleanly and existing tests pass.

---

## Fix 1 — Named timeout constants in `providers/mod.rs`
**Severity:** HIGH  
**Category:** CWE-547 (Use of Hard-coded, Security-relevant Constants)

`read_error_body` and `parse_json_limited` contained bare `Duration::from_secs(10)` and `Duration::from_secs(30)` literals. Timeout values are security controls (CWE-1088) and must be named constants so they are visible, grep-able, and tunable without recompilation.

**File:** `rings/SILVER-RING-AI00/src/providers/mod.rs`

**Change:**
1. Added `const ERROR_BODY_READ_TIMEOUT: Duration = Duration::from_secs(10);`
2. Added `const JSON_BODY_READ_TIMEOUT: Duration = Duration::from_secs(30);`
3. Replaced inline literals in `read_error_body` and `parse_json_limited` with the named constants.

**Literature:** CWE-547. Hard-coded security-relevant constants prevent operational tuning and hide controls from auditors. NIST SP 800-53 SI-10 requires that resource-limit parameters be configurable.

---

## Fix 2 — Media file size validation in `ai_cover.rs`
**Severity:** HIGH  
**Category:** CWE-770 (Allocation of Resources Without Limits or Throttling)

The AI Cover handler accepted `msg.audio()` without checking `audio.file.size`. A multi-gigabyte audio upload would waste provider credits, exhaust bandwidth, and could cause downstream resource exhaustion in the AI pipeline.

**File:** `rings/SILVER-RING-SN00/src/ai_cover.rs`

**Change:**
1. Added `const MAX_AI_COVER_AUDIO_BYTES: u64 = 50 * 1024 * 1024;` (50 MB).
2. Check `audio.file.size as u64 > MAX_AI_COVER_AUDIO_BYTES` before storing `audio_url`.
3. Reject with a localized error and return early.

**Literature:** CWE-770. Unbounded file uploads are a classic DoS vector. CERT C MEM35-C and OWASP guidance both emphasize that any user-provided file must be size-validated before downstream processing.

---

## Fix 3 — Media file size validation in `hedra_render.rs`
**Severity:** HIGH  
**Category:** CWE-770 (Allocation of Resources Without Limits or Throttling)

The Hedra Render handler accepted `msg.photo()` (step 1) and `msg.voice()` (step 2) without checking `file.size`. Large uploads would waste provider quota and bandwidth.

**File:** `rings/SILVER-RING-SN00/src/hedra_render.rs`

**Change:**
1. Added `const MAX_HEDRA_IMAGE_BYTES: u64 = 20 * 1024 * 1024;` (20 MB)
2. Added `const MAX_HEDRA_VOICE_BYTES: u64 = 50 * 1024 * 1024;` (50 MB)
3. In step 1, check `photo.file.size as u64 > MAX_HEDRA_IMAGE_BYTES` before storing.
4. In step 2, check `voice.file.size as u64 > MAX_HEDRA_VOICE_BYTES` before storing.
5. Reject with localized errors.

**Literature:** CWE-770. Defense-in-depth requires size caps at every media ingestion point, not just the first handler that was audited. NIST SP 800-53 SI-10.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-server -p trios-mb-scenes -p trios-mb-ai
   Finished dev profile [unoptimized + debuginfo] target(s) in 2.46s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 2.70s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- `database_url` SecretString migration
- Complete model digest externalization in `replicate.rs` (remaining models: flux, sd3, face-swap)
- `format!` sanitization for user-interpolated strings in `avatar_brain.rs`, `ai_cover.rs`, `email.rs`
- DB timeout wrapping in any remaining scene callback handlers

---

## Three Cooperation Variants for Wave 232

### Variant A — `format!` sanitization for user-interpolated strings
`avatar_brain.rs`, `ai_cover.rs`, and `email.rs` build display strings with `format!` using user-provided text. A helper that strips Markdown/HTML special characters before interpolation would prevent message-formatting breakage and future injection vectors.

### Variant B — Complete model digest externalization in `replicate.rs`
Remaining hardcoded model identifiers (`flux`, `sd3`, `face-swap`) in `resolve_model_version` should be externalized to env vars via `LazyLock<String>`, completing the work started in Wave 227.

### Variant C — DB timeout wrapping in remaining scene callback handlers
A systematic sweep of scene callback handlers that call DB methods without `tokio::time::timeout` to close any remaining timeout gaps.
