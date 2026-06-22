# Wave 179 Plan

Date: 2026-06-16  
Status: IN PROGRESS  

## Literature Review

### 1. Graceful Degradation vs. Crash-Only Software
Michael Nygard, *Release It!* 2nd Ed. — Chapter on "Stability Patterns" emphasizes that production services must **fail gracefully** rather than crash. A `panic!` in startup code transforms a configuration error into a total service outage. The correct pattern is to return a structured error that allows the caller (orchestrator, init system) to report the failure without aborting the process.

### 2. Input Validation at Boundaries
OWASP Input Validation Cheat Sheet — All user-provided identifiers must be validated at the earliest boundary before reaching business logic or data stores. For Telegram bots, `callback_query.from.id` is attacker-controlled (forged callbacks can be crafted with any integer value). A non-positive sentinel check is a lightweight defense-in-depth measure.

### 3. State Machine Consistency After TTL Expiry
Martin Kleppmann, *Designing Data-Intensive Applications* — In-memory state machines with TTL eviction must treat expired state as a **terminal reset condition**, not as a silent default. Using `unwrap_or_default()` on optional state fields produces logically invalid output (empty strings, empty collections) that the downstream logic cannot distinguish from genuinely empty user input.

## Selected Fixes

### Fix 1 — router.rs panic! elimination (HIGH)

**File:** `rings/BRONZE-RING-SRV/src/router.rs`  
**Problem:** `apply_rate_limit()` calls `panic!` when the rate-limit layer fails to build. A misconfigured `per_second` or `burst_size` value (e.g., zero, or values that violate the underlying governor crate's invariants) aborts the entire server process.  
**Solution:** Replace `panic!` with a graceful error return. Change the function signature to `Result<Router<S>, AppError>` and propagate the error to the caller, which can log a fatal message and exit cleanly.

### Fix 2 — telegram_id sentinel guards on 10 more callback handlers (MEDIUM)

**Files:** `rings/SILVER-RING-SN00/src/payment.rs`, `face_swap.rs`, `avatar_transform.rs`, `image_to_video.rs`, `ai_photoshop.rs`, `remove_bg.rs`, `digital_avatar_body.rs`, `avatar_brain.rs`, `chat_with_avatar.rs`, `hedra_render.rs`  
**Problem:** These callback handlers extract `telegram_id` from `q.from.id` and immediately call `load_lang_cb()` which queries the database. A forged or malformed callback with `id <= 0` issues a spurious DB lookup.  
**Solution:** Add the standard sentinel guard pattern at the top of each callback handler, before any DB operation:
```rust
let tid = q.from.id.0 as i64;
if tid <= 0 {
    tracing::warn!("Callback query missing valid telegram_id; aborting handler");
    return Ok(());
}
```

### Fix 3 — fsm-state-loss guards on dialogue state fields (MEDIUM)

**Files:** `rings/SILVER-RING-SN00/src/avatar_brain.rs`, `train_flux_model.rs`  
**Problem:** Multi-step dialogue handlers use `unwrap_or_default()` on optional state fields that were populated in earlier steps. After InMemStorage TTL expiry, these fields become `None` and `unwrap_or_default()` silently yields empty strings or empty vectors. The bot then proceeds with invalid data instead of notifying the user.

**avatar_brain.rs:** At step 3, `state.name` and `state.personality` (collected in steps 1 and 2) are read with `unwrap_or_default()`. After TTL expiry, the summary message shows empty company and position.

**train_flux_model.rs:** At step 1, `state.images` is read with `unwrap_or_default()`. After TTL expiry, previously uploaded photos are silently lost and the user must restart the upload from scratch without any notification.

**Solution:** Replace `unwrap_or_default()` with explicit `match` guards that check for `None`, send a localized warning message, and return the user to the main menu.

## Verification

- `cargo check --workspace` must pass.
- No new `panic!` paths introduced.
- All modified callback handlers compile and the guard pattern is consistent.

## Deferred

- `tracing::instrument` on remaining 74 scene handlers (deferred to observability wave).
- `deny_unknown_fields` on outbound Serialize structs (low priority — provider validates).
- Additional `unwrap_or_default()` state field audits across other scene handlers (deferred to dedicated FSM-consistency wave).
