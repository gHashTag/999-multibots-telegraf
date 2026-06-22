# Wave 242 Security Plan

**Date:** 2026-06-16
**Theme:** Final provider reqwest timeout extraction + media input validation

---

## Fix 1: Extract named reqwest timeout constants in `midjourney.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/midjourney.rs`

**Problem:** `MidjourneyProvider::new` is the last provider still using bare `Duration::from_secs(N)` literals (120, 10, 90). All other providers have been migrated to named constants in previous waves.

**Solution:**
- Add named constants: `REQWEST_TIMEOUT`, `REQWEST_CONNECT_TIMEOUT`, `REQWEST_POOL_IDLE_TIMEOUT`.
- Replace bare literals in `new()` with named constants.

---

## Fix 2: Extract body-read timeout constant in `openai.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** The TTS response body read uses a bare `std::time::Duration::from_secs(30)` literal. This is inconsistent with the named timeout constants used elsewhere in the file and across providers.

**Solution:**
- Add `const BODY_READ_TIMEOUT: Duration = Duration::from_secs(30);`
- Replace the bare literal with the named constant.

---

## Fix 3: Add video size validation in `video_transcription.rs` (HIGH)

**File:** `rings/SILVER-RING-SN00/src/video_transcription.rs`

**Problem:** `handle_video_transcription_msg` step 1 accepts a video via `msg.video()` without checking file size. A user could upload an oversized video file, causing storage exhaustion or degraded service.

**Solution:**
- Add `const MAX_VIDEO_TRANSCRIPTION_BYTES: u64 = 100 * 1024 * 1024;`
- After extracting the video, check `video.file.size as u64 > MAX_VIDEO_TRANSCRIPTION_BYTES`
- Return a localized error if the limit is exceeded.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-SN00` and `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Provider constructor consolidation
Extract the near-identical reqwest client builder blocks across all providers into a shared helper function in `providers/mod.rs`.

### Variant B — Scene handler unwrap_or(0) sentinel guard sweep
Audit remaining scene handlers for `unwrap_or(0)` telegram_id extraction and ensure all have the `if tid == 0 { return Ok(()); }` sentinel guard.

### Variant C — Audio/video handler size validation completion
Add size caps to any remaining handlers accepting audio/video/media files that still lack size validation.
