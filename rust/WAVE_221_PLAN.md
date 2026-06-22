# Wave 221 Plan

## Objective
Eliminate empty-prompt generation requests that waste API credits and degrade user experience across the three most-used AI providers.

---

## Fix 1 — OpenAI provider empty prompt rejection

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`  
**Finding:** `generate_image` extracts the prompt with `request.prompt.as_deref().unwrap_or("")`. If the user somehow submits an empty or whitespace-only prompt (e.g., dialogue state corruption, a bug in a handler, or a direct API call), the empty string is serialized into the DALL-E request body and sent to OpenAI. The API call consumes credits and typically returns a 400-level error or a meaningless image. The user has already had their balance deducted by `dispatch_and_reply` before this point, so they pay for a guaranteed failure.

The same issue exists in `text_to_speech`.

**Literature:**
- CWE-20 — Improper Input Validation: "The product does not validate or incorrectly validates input that can affect the flow or outcome of program execution."
- OWASP Input Validation Cheat Sheet: "Validate all input on the server side, even if client-side validation exists."
- Defensive Programming (Saltzer & Schroeder): "Never process input you cannot verify."

**Implementation:**
Add an early guard in `generate_image` and `text_to_speech` that trims the prompt and returns `AppError::Validation` if it is empty after trimming. This fails the job immediately, preventing an unnecessary upstream HTTP call and allowing the worker to treat it as a validation failure (which may trigger a refund path in future waves).

**Verification:**
`cargo check --package trios-mb-ai`, `cargo test --package trios-mb-ai`, `cargo check --workspace`

---

## Fix 2 — ElevenLabs provider empty prompt rejection

**File:** `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`  
**Finding:** `generate` extracts the prompt with `request.prompt.as_deref().unwrap_or("")`. An empty or whitespace-only text is passed to `text_to_speech_raw`, which POSTs it to ElevenLabs. The API returns an error or generates silence, burning credits. The user has already paid.

**Literature:**
- CWE-20 — Improper Input Validation
- "Fail Fast" pattern (Michael Feathers, *Working Effectively with Legacy Code*): Validate at the boundary closest to the external system.

**Implementation:**
Add an early guard before `text_to_speech_raw` that trims the prompt and returns `AppError::Validation` if empty.

**Verification:**
`cargo check --package trios-mb-ai`, `cargo test --package trios-mb-ai`

---

## Fix 3 — HeyGen provider empty prompt rejection

**File:** `rings/SILVER-RING-AI00/src/providers/heygen.rs`  
**Finding:** `generate` extracts the prompt with `request.prompt.as_deref().unwrap_or("")`. Empty text is passed to `create_avatar_video`, which POSTs it to HeyGen. The API either errors out or produces a silent video, wasting credits.

**Literature:**
- CWE-20 — Improper Input Validation
- Saltzer & Schroeder, "The Protection of Information in Computer Systems" (1975): "Complete mediation: every access to every object must be checked for authority." Applied to inputs, every value used by an external API must be validated.

**Implementation:**
Add an early guard before `create_avatar_video` that trims the prompt and returns `AppError::Validation` if empty.

**Verification:**
`cargo check --package trios-mb-ai`, `cargo test --package trios-mb-ai`, `cargo check --workspace`

---

## Success Criteria
- All three fixes compile cleanly (`cargo check --workspace`).
- Unit tests pass.
- No clippy warnings introduced.
