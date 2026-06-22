# Wave 181 Plan

Date: 2026-06-16  
Status: IN PROGRESS  

## Literature Review

### 1. Shared Type Contracts in Polyglot Systems
Michael Nygard, *Release It!* 2nd Ed. — "Integration Points" chapter emphasizes that shared type libraries (the "types" or "primitives" crate in a monorepo) are the single most impactful place for defensive deserialization. A single struct in a shared types module can be deserialized in dozens of call sites (webhooks, API endpoints, config loaders, job payloads). Applying `deny_unknown_fields` at the shared type boundary provides defense-in-depth for all downstream consumers without touching each call site individually.

### 2. Observability Completeness
Google SRE Book, *Site Reliability Engineering* — "Monitoring Distributed Systems" chapter: partial tracing coverage is worse than no coverage because it creates blind spots that mislead operators during incident response. Every user-facing entrypoint must carry instrumentation so traces form a complete graph from user action through all service boundaries.

### 3. State Consistency in Transactional Flows
Martin Kleppmann, *Designing Data-Intensive Applications* — In any flow that mutates state then validates preconditions, the validation must precede the mutation. Mutating state before validation creates irreversible partial states that require complex rollback or leave the system inconsistent.

## Selected Fixes

### Fix 1 — `deny_unknown_fields` on GOLD-RING-TY00 shared types (HIGH)

**Problem:** The shared types module `GOLD-RING-TY00` contains 29 deserialization structs/enums across 7 files that lack `#[serde(deny_unknown_fields)]`. These types are used throughout the monorepo for inbound data from webhooks, API calls, config files, and job payloads. A single unguarded struct in the shared types module exposes all consumers to silent field truncation.

**Files:**
- `rings/GOLD-RING-TY00/src/bot.rs` — 2 structs/enums
- `rings/GOLD-RING-TY00/src/config.rs` — 1 struct
- `rings/GOLD-RING-TY00/src/generation.rs` — 4 structs/enums
- `rings/GOLD-RING-TY00/src/money.rs` — 1 struct
- `rings/GOLD-RING-TY00/src/payment.rs` — 3 structs/enums
- `rings/GOLD-RING-TY00/src/scene.rs` — 5 structs/enums
- `rings/GOLD-RING-TY00/src/user.rs` — 7 structs/enums

**Solution:** Add `#[serde(deny_unknown_fields)]` to all Deserialize structs in the shared types module.

### Fix 2 — `tracing::instrument` on remaining 19 scene handlers (MEDIUM)

**Problem:** 19 scene handler files still lack `#[tracing::instrument]` on their `pub async fn handle_*` functions. These include both simple handlers (`help`, `menu`, `change_language`) and more complex ones (`ai_reels`, `voice_avatar`, `video_transcription`). Without spans, these handlers are invisible in distributed traces.

**Solution:** Add `#[tracing::instrument(skip_all)]` to all `pub async fn handle_*` functions in the 19 remaining scene handler files.

**Files:**
- `rings/SILVER-RING-SN00/src/ai_reels.rs`
- `rings/SILVER-RING-SN00/src/cancel_predictions.rs`
- `rings/SILVER-RING-SN00/src/change_language.rs`
- `rings/SILVER-RING-SN00/src/email.rs`
- `rings/SILVER-RING-SN00/src/help.rs`
- `rings/SILVER-RING-SN00/src/image_upscaler.rs`
- `rings/SILVER-RING-SN00/src/improve_prompt.rs`
- `rings/SILVER-RING-SN00/src/instagram_parser.rs`
- `rings/SILVER-RING-SN00/src/invite.rs`
- `rings/SILVER-RING-SN00/src/lip_sync.rs`
- `rings/SILVER-RING-SN00/src/menu.rs`
- `rings/SILVER-RING-SN00/src/music_generation.rs`
- `rings/SILVER-RING-SN00/src/neuro_coder.rs`
- `rings/SILVER-RING-SN00/src/select_model.rs`
- `rings/SILVER-RING-SN00/src/size.rs`
- `rings/SILVER-RING-SN00/src/subscription.rs`
- `rings/SILVER-RING-SN00/src/text_to_speech.rs`
- `rings/SILVER-RING-SN00/src/video_duration.rs`
- `rings/SILVER-RING-SN00/src/video_transcription.rs`
- `rings/SILVER-RING-SN00/src/voice_avatar.rs`
- `rings/SILVER-RING-SN00/src/voice_training.rs`

### Fix 3 — Early `telegram_id` guard in `handlers.rs` main menu dispatcher (MEDIUM)

**Problem:** In `handle_main_menu_msg`, the `telegram_id` extraction and sentinel guard occurs AFTER `dialogue.update(scene).await?`. If `tid == 0`, the user's dialogue state has already been mutated to the target scene, but the handler returns early without sending the scene greeting. This leaves the user in an inconsistent dialogue state.

**Solution:** Move the `telegram_id` extraction and `tid == 0` guard to the very top of `handle_main_menu_msg`, before `load_lang` and before any state mutation.

## Verification

- `cargo check --workspace` must pass.
- No new `panic!` paths introduced.

## Deferred

- `deny_unknown_fields` on outbound Serialize-only types (low priority).
- Additional centralized handler guard placement audits (deferred to handler-consistency wave).
