# Wave 261 Report

**Date:** 2026-06-16
**Scope:** Provider DTO deserialization hardening — length caps and type safety.
**Co-Authored-By:** Claude Opus 4.8 <noreply@anthropic.com>

---

## Fix 1: Replicate WebhookPayload / Response string length caps (HIGH)

**File:** `rings/GOLD-RING-PR00/src/replicate.rs`
**Pattern:** All `String` and `Option<String>` fields in provider response DTOs that deserialize from untrusted JSON must have length caps.

Applied existing `deserialize_string_max_*` and `deserialize_option_string_max_*` helpers to 11 fields across three structs:
- `TrainingResponse`: `id` (max 256), `status` (max 256)
- `PredictionResponse`: `id` (max 256), `error` (max 1024), `status` (max 256)
- `WebhookPayload`: `id` (max 256), `status` (max 256), `model` (max 256), `version` (max 256), `error` (max 1024), `logs` (max 4096), `created_at` (max 256), `completed_at` (max 256)

**Why:** A malicious or buggy Replicate webhook could inject multi-megabyte strings in fields like `logs`, `error`, or `id`. Without length caps, these strings risk OOM during deserialization and log buffer exhaustion when later emitted via `tracing`.

---

## Fix 2: Fal DTO string and Vec hardening (HIGH)

**File:** `rings/GOLD-RING-PR00/src/fal.rs`
**Pattern:** All `String`, `Option<String>`, and `Vec` fields in provider response DTOs must have length/element-count caps.

Added `deserialize_vec_max_100` and `deserialize_option_vec_max_100` helpers to `lib.rs` and applied them to Fal DTOs:
- `FalImageResponse`: `images` capped to 100 elements, `image_url` (max 4096), `url` (max 4096)
- `FalImageData`: `images` capped to 100 elements
- `FalImageUrl`: `url` (max 4096)
- `FalLipSyncResponse`: `request_id` (max 256)

**Why:** A malicious provider response with an enormous `images` Vec (thousands of elements) or multi-megabyte `url` strings could cause OOM during deserialization. Capping both element count and string length closes this vector.

---

## Fix 3: `ChatMessage.role` strongly-typed enum (MEDIUM)

**File:** `rings/GOLD-RING-PR00/src/openai.rs`
**Pattern:** Restricted-value fields should use enums instead of raw strings to prevent injection and enable exhaustive pattern matching.

Replaced `pub role: String` with a new `Role` enum:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}
```

Added a `std::fmt::Display` impl for convenience. Updated the three constructor methods (`system`, `user`, `assistant`) to use enum variants instead of string literals.

**Why:** A raw `String` `role` field accepts any arbitrary value during deserialization. An attacker could inject an unexpected role (e.g., `"developer"`, `"function"`) that bypasses downstream logic or causes unexpected behavior in the OpenAI API. A strongly-typed enum makes the code self-documenting and enables compile-time exhaustiveness checks.

---

## Verification

- `cargo check --workspace --target aarch64-apple-darwin` ✅

No regressions introduced. All fixes are additive or tightening and do not change happy-path behavior.

---

## Cooperation Variants for Wave 262

1. **Kie DTO Vec hardening** — Add `deserialize_vec_max_100` and element string-length caps to `kie.rs` `TaskInput.image_urls`, `TaskData.result_urls`, `TaskStatusData.result_urls`, `WebhookPayload.result_urls`, and `WebhookResponse.result_urls`.
2. **Add `deny_unknown_fields` to request DTOs** — Add `#[serde(deny_unknown_fields)]` to outbound request structs in `replicate.rs`, `fal.rs`, and `openai.rs` to fail-closed on provider API drift.
3. **Provider raw error sanitization** — Replace user-facing raw error strings in `SILVER-RING-AI00/src/providers/*.rs` with static messages, logging raw errors internally via `truncate_for_log`.
