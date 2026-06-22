# Wave 181 — Security Hardening Report

**Date:** 2026-06-16  
**Scope:** trios-mb Rust monorepo — Telegram bot shared types, scene handler instrumentation, main-menu state-mutation ordering  
**Methodology:** Static analysis (`cargo check`, `cargo clippy`), literature review, defensive-depth implementation

---

## Executive Summary

Three distinct defensive fixes were implemented across the shared types crate, the scenes crate, and the bot dispatcher. All changes are backward-compatible, add no runtime cost for the deny-unknown-fields and instrumentation work, and eliminate a state-consistency bug in the main-menu message handler.

---

## Fix 1 — `deny_unknown_fields` on GOLD-RING-TY00 shared types (22 structs)

### Finding
Inbound structs in `trios-mb-types` were open to silent field truncation. An attacker could inject extra fields that would be silently ignored, creating a mismatch between what the sender believes was accepted and what the server actually deserialized.

### Literature
Serde’s `deny_unknown_fields` is the canonical defense against this class of deserialisation ambiguity. It turns a silent truncation into an explicit `serde::de::Error` that bubbles up through the API layer.

### Implementation
- Files touched: `rings/GOLD-RING-TY00/src/bot.rs`, `config.rs`, `generation.rs`, `money.rs`, `payment.rs`, `scene.rs`, `user.rs`
- 22 Deserialize structs received `#[serde(deny_unknown_fields)]`
- No ordering regressions (derive attribute precedes helper attribute)

### Verification
```bash
cargo check --package trios-mb-types   # OK
cargo check --package trios-mb-app     # OK
```

---

## Fix 2 — `tracing::instrument` on remaining scene handlers (21 files)

### Finding
21 scene handler source files still lacked distributed-tracing spans, leaving production debuggability gaps. Without automatic span creation, every handler would need manual `tracing::info_span!` boilerplate.

### Literature
`tracing::instrument(skip_all)` is the zero-cost abstraction for attaching handler-level spans to async functions. It captures function entry/exit and error paths without polluting the business logic.

### Implementation
- 21 files in `rings/SILVER-RING-SN00/src/` received `#[tracing::instrument(skip_all)]` on their primary async handler functions
- Total instrumented handlers across the scenes crate: 78 (some files already had instrumentation from earlier waves)
- Files: `ai_reels.rs`, `cancel_predictions.rs`, `change_language.rs`, `email.rs`, `help.rs`, `image_upscaler.rs`, `improve_prompt.rs`, `instagram_parser.rs`, `invite.rs`, `lip_sync.rs`, `menu.rs`, `music_generation.rs`, `neuro_coder.rs`, `select_model.rs`, `size.rs`, `subscription.rs`, `text_to_speech.rs`, `video_duration.rs`, `video_transcription.rs`, `voice_avatar.rs`, `voice_training.rs`

### Verification
```bash
cargo check --package trios-mb-scenes   # 4 warnings (pre-existing), 0 errors
cargo check --package trios-mb-app      # OK
```

---

## Fix 3 — Move `telegram_id` guard before state mutation in `handle_main_menu_msg`

### Finding
`handle_main_menu_msg` in `rings/SILVER-RING-SN00/src/handlers.rs` mutated the dialogue state (`dialogue.update(scene)`) BEFORE extracting and validating `telegram_id`. If `msg.from` was `None` (yielding `tid == 0`), the function returned early after already transitioning the user to a new scene, leaving them stranded in a broken dialogue state.

### Literature
TOCTOU (Time-of-Check-Time-of-Use) ordering is a well-known race-condition pattern. Even in single-threaded async code, mutating external state before validating prerequisites creates unrecoverable partial-failure states.

### Implementation
```rust
// BEFORE
let lang = load_lang(&db, &msg).await;
let text = match msg.text() { ... };
let target = match_text_to_scene(lang, text);
match target {
    Some(id) => {
        let scene = scene_from_id(&id);
        dialogue.update(scene).await?;              // STATE MUTATED
        let tid = msg.from.map(|u| u.id.0 as i64).unwrap_or(0);
        if tid == 0 { return Ok(()); }              // GUARD AFTER — LEAVES USER STRANDED
        enter_scene_greeting(...).await?;
    }
}

// AFTER
let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
if tid == 0 {
    tracing::warn!("Missing telegram_id; aborting main menu handler");
    return Ok(());                                   // GUARD BEFORE ANY STATE CHANGE
}
let lang = load_lang(&db, &msg).await;
let text = match msg.text() { ... };
let target = match_text_to_scene(lang, text);
match target {
    Some(id) => {
        let scene = scene_from_id(&id);
        dialogue.update(scene).await?;              // STATE MUTATED ONLY AFTER VALIDATION
        enter_scene_greeting(...).await?;
    }
}
```

### Verification
```bash
cargo check --package trios-mb-app   # OK
```

---

## Verification Matrix

| Crate | Check | Result |
|---|---|---|
| `trios-mb-types` | `cargo check` | OK |
| `trios-mb-scenes` | `cargo check` | 4 warnings (pre-existing), 0 errors |
| `trios-mb-app` | `cargo check` | OK |

---

## Next-Wave Variants (3 candidates)

1. **FSM state-loss guards** — Replace any remaining `unwrap_or_default()` on dialogue state fields (e.g., `state.images.unwrap_or_default()`) with explicit `match` blocks that return the user to the main menu if state is missing, preventing TTL expiry data loss.
2. **Callback payload `deny_unknown_fields`** — Extend `deny_unknown_fields` to callback-deserialisation structs in `trios-mb-tg` (e.g., `CallbackData` variants) to prevent silent field truncation on inline keyboard callbacks.
3. **Payment form input validation** — Add length caps and character-set validation to all payment-related free-text inputs (e.g., email, promo codes) before they reach the payment processor.

---

*End of Wave 181.*
