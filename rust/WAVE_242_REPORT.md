# Wave 242 Security Report

**Date:** 2026-06-16
**Theme:** Final provider reqwest timeout extraction + media input validation

---

## Summary

Wave 242 completes the provider reqwest timeout constant extraction (the last provider — Midjourney — was migrated) and adds an overdue media size validation to the video transcription handler. All changes compiled on first attempt with zero warnings.

---

## Fix 1: Extract named reqwest timeout constants in `midjourney.rs`

**File:** `rings/SILVER-RING-AI00/src/providers/midjourney.rs`
**Severity:** MEDIUM

`MidjourneyProvider::new` was the last provider still using bare `Duration::from_secs(N)` literals for timeout, connect_timeout, and pool_idle_timeout. All other providers in the codebase had already been migrated to named constants in prior waves.

**Changes:**
- Added `const REQWEST_TIMEOUT: Duration = Duration::from_secs(120);`
- Added `const REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
- Added `const REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
- Replaced the three bare literals in `reqwest::Client::builder()` with the named constants.

This ensures the Midjourney provider follows the same maintainability and auditability patterns established across the rest of the provider module.

---

## Fix 2: Extract body-read timeout constant in `openai.rs`

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`
**Severity:** MEDIUM

The TTS response body read (`resp.bytes()`) was guarded by a bare `Duration::from_secs(30)` literal. This was inconsistent with the named timeout constants used for all other timeouts in the file and across providers.

**Changes:**
- Added `const BODY_READ_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);` inside the `text_to_speech` method.
- Replaced the inline literal with the named constant.

This closes a readability gap and makes future timeout tuning a single-line change.

---

## Fix 3: Add video size validation in `video_transcription.rs`

**File:** `rings/SILVER-RING-SN00/src/video_transcription.rs`
**Severity:** HIGH

`handle_video_transcription_msg` step 1 accepted any video message without checking file size. A user could upload a multi-gigabyte video, causing storage exhaustion, downstream job-queue pressure, or service degradation.

**Changes:**
- Added `const MAX_VIDEO_TRANSCRIPTION_BYTES: u64 = 100 * 1024 * 1024;` (100 MB).
- After extracting the video, added a guard: `if video.file.size as u64 > MAX_VIDEO_TRANSCRIPTION_BYTES { ... }`
- On violation, sends a localized error message with the back/cancel keyboard and returns early.

This brings video transcription into line with the size-cap patterns already applied to image/video/audio handlers in prior waves.

---

## Verification

```
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-ai -p trios-mb-scenes
    Checking trios-mb-ai v0.1.0
    Checking trios-mb-scenes v0.1.0
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 4.90s
```

Zero errors, zero warnings.

---

## Cooperation Variants for Next Wave

### Variant A — Provider constructor consolidation
Extract the near-identical reqwest client builder blocks across all providers into a shared helper function in `providers/mod.rs`.

### Variant B — Scene handler unwrap_or(0) sentinel guard sweep
Audit remaining scene handlers for `unwrap_or(0)` telegram_id extraction and ensure all have the `if tid == 0 { return Ok(()); }` sentinel guard.

### Variant C — Audio/video handler size validation completion
Add size caps to any remaining handlers accepting audio/video/media files that still lack size validation.

---

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
