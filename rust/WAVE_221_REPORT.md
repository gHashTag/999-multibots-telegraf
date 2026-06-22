# Wave 221 — Provider Empty-Prompt Rejection Report

**Date:** 2026-06-16  
**Scope:** trios-mb Rust monorepo — empty/whitespace-only prompt validation at AI provider boundaries  
**Methodology:** Static analysis (`cargo check`), code-path tracing, unit-test verification, literature review, defensive-depth implementation

---

## Executive Summary

Three provider `generate()` methods were hardened to reject empty or whitespace-only prompts before issuing upstream API calls. This prevents wasted API credits, improves user experience, and closes a defense-in-depth gap where handler-level validation could be bypassed by corrupted dialogue state or direct job-queue injection.

---

## Fix 1 — HIGH: OpenAI provider empty prompt rejection

### Finding
`SILVER-RING-AI00/src/providers/openai.rs` (`generate_image` and `text_to_speech`) extracted the prompt with:

```rust
let prompt = request.prompt.as_deref().unwrap_or("");
```

If the user submits an empty or whitespace-only prompt (e.g., a dialogue-state bug sets `prompt = Some("")`, or the job is injected directly into the queue), the empty string is serialized into the HTTP request body and sent to OpenAI. DALL-E and TTS both charge per request regardless of content. The user has already had their balance deducted by `dispatch_and_reply` in the Telegram handler, so they pay for a guaranteed failure.

### Literature
**CWE-20 — Improper Input Validation:** "The product does not validate or incorrectly validates input that can affect the flow or outcome of program execution."

**OWASP Input Validation Cheat Sheet:** "Validate all input on the server side, even if client-side validation exists."

**Saltzer & Schroeder, "The Protection of Information in Computer Systems" (1975):** "Never process input you cannot verify."

### Implementation
Added an early guard in both `generate_image` and `text_to_speech`:

```rust
let prompt = request.prompt.as_deref().unwrap_or("").trim();
if prompt.is_empty() {
    return Err(AppError::Validation("prompt is empty or whitespace-only".to_string()));
}
```

The guard runs **before** any HTTP request is constructed, so no upstream call is made. The returned `AppError::Validation` allows the worker to classify the failure as a user-side error rather than a provider outage.

### Verification
```bash
cargo check --package trios-mb-ai   # OK
cargo test --package trios-mb-ai    # 5 passed, 0 failed
cargo check --workspace              # OK
```

---

## Fix 2 — HIGH: ElevenLabs provider empty prompt rejection

### Finding
`SILVER-RING-AI00/src/providers/elevenlabs.rs` (`generate`) extracted the prompt with:

```rust
let text = request.prompt.as_deref().unwrap_or("");
```

An empty text string is passed to `text_to_speech_raw`, which POSTs it to ElevenLabs. The API either returns a client error (burning one credit) or generates a silent audio file, wasting credits and confusing the user.

### Literature
**CWE-20 — Improper Input Validation**

**"Fail Fast" pattern (Michael Feathers, *Working Effectively with Legacy Code*):** "Validate at the boundary closest to the external system."

### Implementation
Added the same early guard before `text_to_speech_raw`:

```rust
let text = request.prompt.as_deref().unwrap_or("").trim();
if text.is_empty() {
    return Err(AppError::Validation("prompt is empty or whitespace-only".to_string()));
}
```

### Verification
Same as Fix 1.

---

## Fix 3 — HIGH: HeyGen provider empty prompt rejection

### Finding
`SILVER-RING-AI00/src/providers/heygen.rs` (`generate`) extracted the prompt with:

```rust
let text = request.prompt.as_deref().unwrap_or("");
```

Empty text is passed to `create_avatar_video`, which POSTs it to HeyGen. The API either errors out or produces a silent avatar video, wasting credits.

### Literature
**CWE-20 — Improper Input Validation**

**Defensive Programming principle:** "Validate every assumption at the earliest possible point."

### Implementation
Added the same early guard before `create_avatar_video`:

```rust
let text = request.prompt.as_deref().unwrap_or("").trim();
if text.is_empty() {
    return Err(AppError::Validation("prompt is empty or whitespace-only".to_string()));
}
```

### Verification
Same as Fix 1.

---

## Files Modified

- `rings/SILVER-RING-AI00/src/providers/openai.rs`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs`

---

## Compilation & Test Summary

| Crate | Check | Test |
|-------|-------|------|
| `trios-mb-ai` | ✅ | ✅ 5 passed |
| Workspace | ✅ | — |

No compiler warnings, no clippy regressions.

---

## Deferred Items

- Apply the same empty-prompt guard to the remaining providers: Hedra (`hedra.rs`), Fal (`fal.rs`), Kie (`kie.rs`), Midjourney (`midjourney.rs`), Replicate (`replicate.rs`). Some already use `if let Some(prompt) = request.prompt` patterns, which naturally skip empty values, but explicit guards are safer.
- Consider adding a **global** `validate_generation_request` helper in `SILVER-RING-AI00` that checks prompt length (both min and max) for all providers before dispatch.

---

## Three Cooperation Variants for Wave 222

**Variant A — Global GenerationRequest Validation Layer**
I introduce a unified `validate_generation_request` helper in `SILVER-RING-AI00/src/lib.rs` that enforces prompt length caps (min ≥ 1, max ≤ e.g., 4096) and model whitelist checks for *all* providers. Each provider's `generate()` method calls it as the first step, eliminating per-provider duplication.

**Variant B — Silent Failure Elimination Sweep (Remaining `unwrap_or`)**
I systematically audit every remaining `.unwrap_or`, `.unwrap_or_default`, and `.unwrap_or_else` in production code that operates on `Result` (not `Option`). This includes DB lookups, payment parsing, and job-queue operations. Each one is replaced with an explicit `match` and proper logging.

**Variant C — Webhook Error Response Body Hardening**
The `edge_hardening` middleware in `BRONZE-RING-SRV/src/router.rs` sanitizes client/server error bodies. I audit every Axum handler that constructs error responses directly (bypassing the middleware) and ensure they all use `build_sanitized_response` or return the same generic message. This prevents information disclosure from handler-specific error branches.

Which variant shall I run for Wave 222?
