# Wave 176 Security Report

Date: 2026-06-16
Status: COMPLETE

## 1. NavigationRouter max entry cap

**Risk:** The `NavigationRouter` in `SILVER-RING-TG00` tracks per-chat scene history in `HashMap<i64, Vec<SceneId>>` with TTL eviction every 1000 `enter()` calls, but no absolute maximum entry count. A burst of new chats (viral traffic, spam bot swarm) could grow the map beyond available memory before the periodic eviction fires, causing OOM and process termination.

**Fix:** Added `MAX_NAVIGATION_ENTRIES: usize = 50_000`. On every `enter()`, after inserting the chat, if `history.len() > MAX_NAVIGATION_ENTRIES`, the entry with the oldest `last_accessed` timestamp is evicted. A `tracing::warn!` is emitted with the evicted `chat_id` and remaining count so operators are alerted if the cap is hit.

**Files changed:**
- `rings/SILVER-RING-TG00/src/navigation.rs`

## 2. f64 provider parameter is_finite() guards

**Risk:** AI provider request builders parse `duration`, `speed`, and `temperature` from `request.params` (a `serde_json::Value` map populated from user input) using `.as_f64()`. While `serde_json` rejects standard JSON `NaN`/`Infinity`, non-standard serializers or future custom parsers could inject them. A `NaN` duration or speed reaching a downstream provider API causes undefined behavior, silent failures, or corrupted billing.

**Fix:** Added `is_finite() && d > 0.0` guards before inserting `duration` into provider payloads in:
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/kie.rs` (both video and music paths)
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`

Added `is_finite() && *s > 0.0 && *s <= 4.0` guard on `speed` in:
- `rings/SILVER-RING-AI00/src/providers/openai.rs` (TTS)

Added `is_finite() && *t >= 0.0 && *t <= 2.0` guard on `temperature` in:
- `rings/SILVER-RING-AI00/src/providers/openai.rs` (`chat_completion`)

Invalid values are silently filtered to `None` (or the default), preventing bad parameters from reaching external APIs.

**Files changed:**
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/kie.rs`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`
- `rings/SILVER-RING-AI00/src/providers/openai.rs`

## 3. Input length caps on text handlers

**Risk:** `payment.rs` parsed user-entered payment amounts with `text.parse::<f64>()` without capping `text.len()` first. A multi-megabyte paste bomb could cause excessive CPU consumption during float parsing. `train_flux_model.rs` accepted `trigger_word` and `model_name` text without length limits, risking oversized state and downstream API rejection.

**Fix:**
- `payment.rs`: Added `MAX_PAYMENT_TEXT_LEN: usize = 32` before `parse::<f64>()`. Returns a localized error if exceeded.
- `train_flux_model.rs`: Added `MAX_TRIGGER_WORD_LEN = 64` and `MAX_MODEL_NAME_LEN = 64` caps with trim-and-validate logic. Returns localized errors if exceeded.

**Files changed:**
- `rings/SILVER-RING-SN00/src/payment.rs`
- `rings/SILVER-RING-SN00/src/train_flux_model.rs`

## Literature Review

- **Unbounded HashMap growth / DoS** — CWE-400 (Uncontrolled Resource Consumption) and CWE-770 (Allocation of Resources Without Limits). NIST SP 800-53 guidance (SI-10) requires all in-memory caches to have hard capacity ceilings to prevent resource exhaustion.
- **NaN/Inf in floating-point computations** — IEEE 754 standard specifies `NaN` is unordered (all comparisons return false). OWASP Input Validation Cheat Sheet recommends `is_finite()` on all floating-point inputs from untrusted sources to prevent silent bypass of range checks.
- **Input length validation** — OWASP Input Validation Cheat Sheet: "Validate all input lengths before parsing. Reject overly long inputs at the application boundary to prevent CPU exhaustion and buffer-overflow-style issues."

## Patterns catalog

| Pattern | Where applied |
|---------|---------------|
| HashMap max entry cap | `navigation.rs` |
| f64 `is_finite()` guard on provider params | `fal.rs`, `kie.rs`, `replicate.rs`, `openai.rs` |
| Input length cap before float parsing | `payment.rs` |
| Input length cap on state fields | `train_flux_model.rs` |

## Co-operation options for next Wave

1. **InMemStorage bounded migration** — `SILVER-RING-TG00/src/dispatcher.rs` uses `InMemStorage` which grows without bound and loses state on restart. Migrate to Redis-backed storage or add a hard TTL + max cap with eviction.
2. **Provider response struct `deny_unknown_fields`** — Add `#[serde(deny_unknown_fields)]` to payment callback structs in `GOLD-RING-PR00/src/payment.rs` (we control the contract for these). For provider response structs, add optional field tolerance with strict validation on critical fields.
3. **Global per-chat outgoing rate limit** — Add a `tokio::sync::Semaphore` or `governor` per `chat_id` in the Telegram bot layer to cap outgoing messages at 1 msg/sec, preventing spam loops and API rate-limit exhaustion.
