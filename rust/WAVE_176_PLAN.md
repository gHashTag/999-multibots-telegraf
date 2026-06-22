# Wave 176 Plan

Date: 2026-06-16

## Research Summary

### Weaknesses identified

1. **NavigationRouter unbounded entries (MEDIUM)** — `navigation.rs` has per-chat `history: HashMap<i64, Vec<SceneId>>` and `last_accessed: HashMap<i64, Instant>` with TTL eviction every 1000 `enter()` calls, but no absolute maximum entry count. A burst of new chats (e.g., bot going viral) could grow the map beyond available memory before the periodic eviction fires.

2. **f64 provider parameter NaN/Inf injection (MEDIUM)** — AI provider structs (`FalUpscaleParams.scale`, `ReplicateTrainParams.learning_rate`, `ElevenLabsVoiceSettings.stability/similarity_boost/style`, `FalWebhookPayload.guidance_scale`) use bare `f64` without `is_finite()` guards. Malformed JSON or malicious provider responses could inject `NaN`/`Inf`, causing silent corruption in downstream API calls or DB writes.

3. **Text length caps missing in key handlers (MEDIUM)** — `payment.rs` parses user-entered payment amount with `text.parse::<f64>()` without capping `text.len()` first. A multi-megabyte paste could cause CPU DoS during float parsing. `neuro_coder.rs`, `tech_support.rs`, and `train_flux_model.rs` accept free-text input without length guards.

### Literature

- **Unbounded HashMap growth / DoS** — CWE-400 (Uncontrolled Resource Consumption), CWE-770 (Allocation of Resources Without Limits). NIST guidance: all in-memory caches must have hard capacity ceilings.
- **NaN/Inf in floating-point computations** — IEEE 754 standard specifies that `NaN` is unordered (all comparisons return false). OWASP Input Validation Cheat Sheet recommends `is_finite()` on all floating-point inputs from untrusted sources.
- **Input length validation** — OWASP Input Validation Cheat Sheet: "Validate all input lengths before parsing. Reject overly long inputs at the application boundary to prevent CPU exhaustion and buffer-overflow-style issues."

## Selected Fixes (3 items)

### Fix 1: NavigationRouter max entry cap
**File:** `rings/SILVER-RING-TG00/src/navigation.rs`
- Add `MAX_NAVIGATION_ENTRIES: usize = 50_000`.
- On every `enter()`, after `last_accessed.insert`, check if `self.history.len() > MAX_NAVIGATION_ENTRIES`. If so, find the chat_id with the oldest `last_accessed` timestamp and remove both `history` and `last_accessed` entries.
- Emit `tracing::warn!` when eviction occurs.

### Fix 2: f64 provider parameter is_finite() guards
**Files:**
- `rings/GOLD-RING-PR00/src/fal.rs` — `scale` and `guidance_scale`
- `rings/GOLD-RING-PR00/src/replicate.rs` — `learning_rate`, `guidance_scale`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs` — `stability`, `similarity_boost`, `style`

- Add `is_finite()` checks when these values are read from user input or deserialized from external JSON.
- Reject with `AppError::Validation` if any parameter is `NaN` or `Inf`.

### Fix 3: Input length caps on text handlers
**Files:**
- `rings/SILVER-RING-SN00/src/payment.rs` — cap `text.len()` before `parse::<f64>()`
- `rings/SILVER-RING-SN00/src/neuro_coder.rs` — cap prompt length
- `rings/SILVER-RING-SN00/src/tech_support.rs` — cap support message length
- `rings/SILVER-RING-SN00/src/train_flux_model.rs` — cap text prompts in all stages

- Use `const MAX_PAYMENT_TEXT_LEN: usize = 32` (payment amounts are short).
- Use `const MAX_DIALOGUE_TEXT_LEN: usize = 2000` (consistent with existing handlers) for creative prompts.
- Return a localized error and `return Ok(())` when exceeded.

## Verification Steps

1. `cargo check -p trios-mb-tg` for navigation changes.
2. `cargo check -p trios-mb-proto -p trios-mb-ai` for provider guard changes.
3. `cargo check -p trios-mb-scenes` for text cap changes.
4. Run `cargo test` for e2e if available.
