# WAVE 228 REPORT

## Summary
Three maintainability and input-validation fixes applied: named timeout constants in the AI orchestrator, empty-prompt guard in music generation, and voice-training audio duration enforcement. All changes compile cleanly and existing tests pass.

---

## Fix 1 — Named timeout constants in `orchestrator.rs`
**Severity:** MEDIUM  
**Category:** CWE-547 (Use of Hard-coded, Security-relevant Constants)

`orchestrator.rs` contained three bare `Duration::from_secs(N)` literals inline: `120` for global dispatch, `30` for `check_status`, and `30` for `get_result`. Magic numbers obscure intent, complicate operations tuning, and create inconsistency risk: a future developer might change one occurrence and miss others. Named constants make timeouts visible, centralize tuning, and enable grep-based auditing.

**File:** `rings/SILVER-RING-AI00/src/orchestrator.rs`

**Change:** Added module-level constants:
- `DISPATCH_TIMEOUT_SECS: u64 = 120`
- `CHECK_STATUS_TIMEOUT_SECS: u64 = 30`
- `GET_RESULT_TIMEOUT_SECS: u64 = 30`

Replaced inline `Duration::from_secs(...)` with the named constants and updated log messages to interpolate the constant value.

**Literature:** CWE-547 covers hard-coded constants. The CERT C Secure Coding Standard (EXP19-C) prohibits unexplained numeric literals in security-relevant code; the principle transfers directly to Rust. Timeout values are security controls (CWE-1088); they must be named and tunable.

---

## Fix 2 — Empty-prompt guard in `music_generation.rs`
**Severity:** MEDIUM  
**Category:** CWE-20 (Improper Input Validation)

`music_generation.rs` accepted user text in step 1 and checked `text.len() > 4000` but never rejected empty or whitespace-only prompts. An empty prompt was stored in `MusicGenerationState` and dispatched to the music provider, consuming credits for no output.

**File:** `rings/SILVER-RING-SN00/src/music_generation.rs`

**Change:** Added `if text.trim().is_empty()` immediately after extracting text, before the length check. Sends a localized error ("❌ Empty prompt is not allowed") and returns `Ok(())`.

**Literature:** CWE-20 — empty/whitespace input should be rejected at the earliest chokepoint. OWASP Input Validation Cheat Sheet recommends rejecting empty values before length checks.

---

## Fix 3 — Voice training duration enforcement in `voice_training.rs`
**Severity:** MEDIUM-HIGH  
**Category:** CWE-20 (Improper Input Validation)

The handler told users to upload audio "30 sec – 3 min" but the code accepted any audio or voice file without inspecting `duration`. A 5-second clip and a 10-minute clip were treated identically. Long clips waste provider training quota (most providers bill by duration or reject oversized samples), and extremely short clips produce low-quality models that lead to support tickets.

**File:** `rings/SILVER-RING-SN00/src/voice_training.rs`

**Change:**
- Added `MIN_VOICE_TRAINING_DURATION: u32 = 30` and `MAX_VOICE_TRAINING_DURATION: u32 = 180`.
- Changed audio ingestion to extract `audio.duration.seconds()` (or `voice.duration.seconds()`).
- Added a guard that rejects files outside the range with a localized error showing the exact bounds.

**Literature:** CWE-20. Input validation must enforce semantic constraints, not just syntactic presence. The product spec ("30 sec – 3 min") is a semantic contract; failing to enforce it creates resource waste and degrades output quality. NIST SP 800-53 SI-10 (Information Input Validation) requires that inputs be validated for syntax, type, and range.

---

## Verification
```bash
$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-ai -p trios-mb-scenes
   Finished dev profile [unoptimized + debuginfo] target(s) in 7.17s

$ CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai
   Finished test profile [unoptimized + debuginfo] target(s) in 5.57s
   test result: ok. 5 passed; 0 failed
```

---

## Deferred Items
- Magic-number timeouts in `providers/mod.rs` (10s, 30s), `elevenlabs.rs` (30s), `openai.rs` (30s), `main.rs` (5s)
- Webhook handler owned-method migration (requires retaining `GenerationResult` through match arms)
- `database_url` SecretString migration
- Media file size validation in `lip_sync.rs`, `ai_cover.rs`, `hedra_render.rs`
- Complete model digest externalization in `replicate.rs`
- Empty-prompt guard in `instagram_scraping.rs` (link input)

---

## Three Cooperation Variants for Wave 229

### Variant A — Magic-number timeout extraction across remaining AI providers
`providers/mod.rs` (10s, 30s), `elevenlabs.rs` (30s), and `openai.rs` (30s) still contain bare `Duration::from_secs(N)` literals. Systematically extracting them to named constants would complete the timeout-hardening of the AI provider layer.

### Variant B — Webhook handler owned-method migration
Replicate and KIE webhook handlers use non-owned `update_generation_status` and `get_generation` without user-scoping. Refactoring the match arms to retain `GenerationResult` and then calling `update_generation_status_owned(generation_id, gen.telegram_id, ...)` adds defense-in-depth ownership checks. Six call sites across `webhooks.rs` need migration.

### Variant C — Media file size validation in `lip_sync.rs` + `ai_cover.rs` + `hedra_render.rs`
These handlers accept video, audio, and voice files without enforcing file size or duration limits. `lip_sync.rs` accepts video + audio + voice; `ai_cover.rs` accepts audio; `hedra_render.rs` accepts voice. Adding per-media-type caps prevents oversized uploads from wasting provider quota and bandwidth.
