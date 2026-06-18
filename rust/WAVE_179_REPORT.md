# Wave 179 Security Report

Date: 2026-06-16  
Status: COMPLETE  

## Overview

This wave addresses three areas: a startup panic path in the HTTP router, continued telegram_id sentinel guard coverage on callback handlers, and silent state-loss from InMemStorage TTL expiry in multi-step dialogue flows.

## Fix 1 — router.rs panic! elimination (HIGH)

**Problem:** `apply_rate_limit()` in `router.rs` called `panic!` when the underlying `GovernorConfigBuilder` failed to produce a valid rate-limit layer (e.g., zero `per_second` or `burst_size`). A misconfigured environment variable or deployment mistake would crash the entire server process instead of surfacing a clean error.

**Solution:** Replaced the `panic!` with a structured `Result<Router<S>, String>` return. `apply_rate_limit` now logs an `error!` and returns `Err(msg)`. Both `create_router` and `create_router_with_payments` propagate the `Result`, and the caller in `main.rs` matches on it, logs the failure, and returns from the server task cleanly.

**Files changed:**

- `rings/BRONZE-RING-SRV/src/router.rs` — `apply_rate_limit`, `create_router`, `create_router_with_payments`
- `rings/BRONZE-RING-APP/src/main.rs` — router construction match guard
- `tests/e2e-tests/tests/e2e_health.rs` — `.expect()` on `create_router` in tests

**Impact:** Server startup failures from rate-limit misconfiguration now produce a structured log line and graceful task exit instead of an uncontrolled process abort.

## Fix 2 — telegram_id sentinel guards on 10 more callback handlers (MEDIUM)

**Problem:** Ten additional callback handlers in `SILVER-RING-SN00` extracted `telegram_id` from `q.from.id` and immediately called `load_lang_cb()`, which queries the database. No sentinel guard rejected non-positive identifiers.

**Solution:** Added the standard `if tid <= 0 { warn!(...); return Ok(()); }` guard at the top of each callback handler, before `load_lang_cb` and any DB operation.

**Files changed:**

- `rings/SILVER-RING-SN00/src/payment.rs`
- `rings/SILVER-RING-SN00/src/face_swap.rs`
- `rings/SILVER-RING-SN00/src/avatar_transform.rs`
- `rings/SILVER-RING-SN00/src/image_to_video.rs`
- `rings/SILVER-RING-SN00/src/ai_photoshop.rs`
- `rings/SILVER-RING-SN00/src/remove_bg.rs`
- `rings/SILVER-RING-SN00/src/digital_avatar_body.rs`
- `rings/SILVER-RING-SN00/src/avatar_brain.rs`
- `rings/SILVER-RING-SN00/src/chat_with_avatar.rs`
- `rings/SILVER-RING-SN00/src/hedra_render.rs`

**Impact:** All callback handlers that perform DB lookups now reject forged or malformed callback queries with non-positive `telegram_id` before issuing spurious database operations.

## Fix 3 — fsm-state-loss guards on dialogue state fields (MEDIUM)

**Problem:** Multi-step dialogue handlers used `unwrap_or_default()` on optional state fields that were populated in earlier steps. After `InMemStorage` TTL expiry, these fields become `None` and `unwrap_or_default()` silently yields empty strings or empty vectors. The bot then proceeds with invalid data instead of notifying the user.

**avatar_brain.rs:** At step 3, `state.name` and `state.personality` (collected in steps 1 and 2) were read with `unwrap_or_default()`. After TTL expiry, the summary message showed empty company and position.

**train_flux_model.rs:** At step 1, `state.images` was read with `unwrap_or_default()`. After TTL expiry, previously uploaded training photos were silently lost, resetting the collection to empty without user notification.

**Solution:** Replaced `unwrap_or_default()` with explicit `match` guards. When the state field is `None` or empty, the bot sends a localized "Session expired" warning and returns the user to the main menu.

**Files changed:**

- `rings/SILVER-RING-SN00/src/avatar_brain.rs` — `state.name` and `state.personality` guards
- `rings/SILVER-RING-SN00/src/train_flux_model.rs` — `state.images` guard

**Impact:** Users whose dialogue state expired due to InMemStorage TTL no longer receive silently corrupted output. Instead, they get a clear message and are returned to the menu.

## Deferred / Not in this wave

- `tracing::instrument` on remaining 74 scene handlers (deferred to observability wave).
- `unwrap_or_default()` audits on other scene handlers that read state fields from previous steps (deferred to dedicated FSM-consistency wave).
- `deny_unknown_fields` on outbound Serialize structs (low priority — provider validates).

## Verification

- `cargo check --workspace --target aarch64-apple-darwin` passes cleanly.
- No new `panic!` paths introduced.
- All modified callback handlers compile and the guard pattern is consistent.

## Literature Review

| Topic | Reference |
|-------|-----------|
| Graceful Degradation vs Crash-Only | Nygard, *Release It!* 2nd Ed. — Stability Patterns |
| Input Validation at Boundaries | OWASP Input Validation Cheat Sheet |
| State Machine Consistency After TTL | Kleppmann, *Designing Data-Intensive Applications* |

## Patterns for next wave

1. **Fail gracefully, never panic** — Production initialization code must return structured errors rather than calling `panic!`. The caller (supervisor, init system) decides whether to retry, degrade, or exit.
2. **Identity sentinel guards at every boundary** — Every handler that receives an identity from an untrusted context must validate it against a known-invalid sentinel before any DB or state mutation.
3. **State field fail-closed on TTL expiry** — Never use `unwrap_or_default()` on dialogue-state fields populated in earlier steps. Treat `None` after TTL as a terminal reset condition: warn the user and return to the menu.

## Three cooperation variants for Wave 180

1. **Deep-dive variant** — Pick 1–2 CRITICAL findings (e.g., remaining `unwrap_or_default()` on state fields across all scene handlers, missing `FOR UPDATE` on generation status updates) and implement full architectural fixes with tests.
2. **Breadth variant** — Apply 3 MEDIUM-impact patterns across many files (e.g., `tracing::instrument` on all remaining scene handlers, input length caps on all free-text handlers, `deny_unknown_fields` on all remaining inbound structs).
3. **Audit + deferred-cleanup variant** — Review all deferred items from Waves 175–179, close the oldest 3–5, and write integration tests for the fixes that lack them.
