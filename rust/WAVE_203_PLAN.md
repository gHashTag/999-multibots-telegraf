# Wave 203 Implementation Plan

**Theme:** Complete the `send_message_timeout` wrapper migration — final 12 bare `bot.send_message` calls across 4 scene handlers.

**Date:** 2026-06-16

---

## Literature Review

### Academic / Engineering Reference
**Harden Telegram — Two-Process Migration & Durability Design** ([idvorkin/chop-conventions](https://github.com/idvorkin/chop-conventions/blob/main/skills/harden-telegram/design.md))

This document describes a complete migration from a fragile single-process architecture to a resilient, fault-tolerant split-process design for a Telegram-MCP bridge. Key patterns:
- **At-least-once delivery:** SQLite WAL ensures messages survive process restarts.
- **Exponential backoff on 409 Conflict:** 1s → 2s → 4s … 30s capped, with the poller retrying forever.
- **Singleton enforcement:** `flock` + PID file prevents stale/crashed pollers from running concurrently.
- **Post-migration fixes:** Documented fixes after cutover include removing dangerous `pkill` by process name, fixing reaction clobbering, and stale socket cleanup.

### Engineering Reference
**galigo — Resilient Go Library with Circuit Breaker** ([prilive-com/galigo](https://github.com/prilive-com/galigo))

A production-grade Go Telegram bot library treating failures as expected conditions:
- **Circuit breaker:** 3-state (closed/open/half-open) trips only on 5xx/network errors.
- **Exponential backoff:** 500ms → 1s → 2s → 4s capped at 30s with jitter.
- **Idempotency / Safety:** `Close()` is idempotent and concurrency-safe.

---

## Research Summary

- **12 remaining bare `bot.send_message` calls** across 4 files.
- Files by remaining call count:
  - `lip_sync.rs` — 6 calls (entry prompt, audio request, model keyboard ×2, retry prompt, done main_menu)
  - `tech_support.rs` — 3 calls (non-text error, length validation error, confirmation message)
  - `neuro_coder.rs` — 2 calls (non-text error, length validation error)
  - `invite.rs` — 1 call (intro message with referral count)

---

## Fix 1 — `lip_sync.rs` timeout wrappers (6 send_message)

### Problem
`lip_sync.rs` contains a multi-step FSM for collecting a video and audio file for lip-sync generation. All 6 `bot.send_message` calls are bare.

### Changes
- Add `send_message_timeout` to the existing import block.
- Wrap all 6 `bot.send_message` calls with `send_message_timeout`.
- Covers: entry prompt, audio request prompt, model selection keyboard (audio branch), model selection keyboard (voice branch), retry prompt, done main_menu keyboard.

---

## Fix 2 — `tech_support.rs` + `neuro_coder.rs` timeout wrappers (3+2 send_message)

### Problem
`tech_support.rs` is a single-step handler that accepts a text message and forwards it to tech support. `neuro_coder.rs` is a single-step handler that accepts a text prompt and dispatches a code generation job. All `bot.send_message` calls in both files are bare.

### Changes
- Add `send_message_timeout` to the import blocks of both files.
- Wrap all `bot.send_message` calls with `send_message_timeout`.
- `tech_support.rs`: non-text error, length validation error, confirmation message
- `neuro_coder.rs`: non-text error, length validation error

---

## Fix 3 — `invite.rs` timeout wrapper (1 send_message)

### Problem
`invite.rs` sends an intro message with the user's referral count before returning to the main menu. The single `bot.send_message` call is bare.

### Changes
- Add `send_message_timeout` to the import block.
- Wrap the single `bot.send_message` call with `send_message_timeout`.

---

## Verification

1. `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — must pass with **zero warnings**.
2. **Zero bare `bot.send_message` calls** should remain across all scene handlers.
3. No user-facing behavioral changes.

---

## Post-Wave 203 State

After this wave:
- **Zero bare `dialogue.update` calls** remain (completed in Wave 201).
- **Zero bare `bot.send_message` calls** remain across all scene handlers.
- The entire Telegram API timeout wrapper workstream is fully complete.
