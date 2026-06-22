# WAVE 228 PLAN

## Objective
Extract magic-number timeouts to named constants in the AI orchestrator, add an empty-prompt guard to the music generation handler, and enforce the advertised duration limits on voice-training audio uploads.

---

## Finding 1 — Magic-number timeouts in `orchestrator.rs`
**Severity:** MEDIUM (CWE-547 / maintainability)

`orchestrator.rs` contains three bare `Duration::from_secs(N)` literals inline:
- `120` — global dispatch timeout
- `30` — `check_status` timeout
- `30` — `get_result` timeout

These magic numbers obscure intent, complicate ops tuning, and create inconsistency risk: a future developer might change one occurrence and miss the others. Named constants make timeouts visible, centralize tuning, and enable grep-based auditing.

**Remediation:**
- Add module-level constants: `DISPATCH_TIMEOUT_SECS: u64 = 120`, `CHECK_STATUS_TIMEOUT_SECS: u64 = 30`, `GET_RESULT_TIMEOUT_SECS: u64 = 30`.
- Replace inline `Duration::from_secs(...)` with the named constants.

**Literature:** CWE-547 — use of hard-coded constants. The CERT C Secure Coding Standard (EXP19-C) prohibits unexplained numeric literals in security-relevant code. While Rust has no formal CERT standard, the principle transfers directly: timeout values are security controls and must be named.

---

## Finding 2 — Missing empty-prompt validation in `music_generation.rs`
**Severity:** MEDIUM (CWE-20)

`music_generation.rs` accepts user text in step 1 and checks `text.len() > 4000` but never rejects empty or whitespace-only prompts. An empty prompt is stored in `MusicGenerationState`, dispatched to the music provider, and consumes credits for no output.

**Remediation:**
- Add `if text.trim().is_empty()` immediately after extracting text.
- Send localized error and return `Ok(())`.

**Literature:** CWE-20 — empty/whitespace input should be rejected at the earliest chokepoint. OWASP Input Validation Cheat Sheet recommends rejecting empty values before length checks.

---

## Finding 3 — Voice training duration not enforced in `voice_training.rs`
**Severity:** MEDIUM-HIGH (CWE-20 / product integrity)

The handler tells users to upload audio "30 sec – 3 min" but the code accepts any audio or voice file without inspecting `duration`. A 30-second clip and a 10-minute clip are treated identically. Long clips waste provider training quota (most providers bill by duration or reject oversized samples), and extremely short clips produce low-quality models that lead to support tickets.

**Remediation:**
- Add `MIN_VOICE_TRAINING_DURATION: u32 = 30` and `MAX_VOICE_TRAINING_DURATION: u32 = 180` (seconds).
- Read `audio.duration` or `voice.duration` at ingestion.
- Reject files outside the range with a localized error.

**Literature:** CWE-20. Input validation must enforce semantic constraints, not just syntactic presence. The product spec ("30 sec – 3 min") is a semantic contract; failing to enforce it creates resource waste and degrades output quality.

---

## Implementation Order
1. `orchestrator.rs` — named timeout constants
2. `music_generation.rs` — empty-prompt guard
3. `voice_training.rs` — duration enforcement

## Verification Steps
- `CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-ai -p trios-mb-scenes`
- `CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai`

---

## Deferred Items
- Magic-number timeouts in `providers/mod.rs` (10s, 30s), `elevenlabs.rs` (30s), `openai.rs` (30s), `main.rs` (5s)
- Webhook handler owned-method migration
- `database_url` SecretString migration
- Media file size validation in `lip_sync.rs`, `ai_cover.rs`, `hedra_render.rs`
- Complete model digest externalization in `replicate.rs`
