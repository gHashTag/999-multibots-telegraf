# Wave 203 Report

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

## Fix 1 — `lip_sync.rs` timeout wrappers (6 send_message)

### Problem
`lip_sync.rs` contained a multi-step FSM for collecting a video and audio file for lip-sync generation. All 6 `bot.send_message` calls were bare.

### Changes
- Added `send_message_timeout` to the import block.
- Wrapped all 6 `bot.send_message` calls with `send_message_timeout`:
  - Entry prompt ("Send a video for LipSync")
  - Audio request prompt ("Send audio")
  - Model selection inline keyboard (audio branch: SyncLabs/HeyGen/Hedra/Fal)
  - Model selection inline keyboard (voice branch: same keyboard)
  - Retry prompt callback
  - Done main_menu keyboard callback

---

## Fix 2 — `tech_support.rs` + `neuro_coder.rs` timeout wrappers (3+2 send_message)

### Problem
`tech_support.rs` is a single-step handler that accepts a text message and forwards it to tech support. `neuro_coder.rs` is a single-step handler that accepts a text prompt and dispatches a code generation job. All `bot.send_message` calls in both files were bare.

### Changes
- Added `send_message_timeout` to both files.
- Wrapped all `bot.send_message` calls:
  - `tech_support.rs`: non-text error reply, length validation error (4000 chars), confirmation message with tech support contacts
  - `neuro_coder.rs`: non-text error reply, length validation error (4000 chars)

---

## Fix 3 — `invite.rs` timeout wrapper (1 send_message)

### Problem
`invite.rs` sends an intro message with the user's referral count before returning to the main menu. The single `bot.send_message` call was bare.

### Changes
- Added `send_message_timeout` to the import block.
- Wrapped the single `bot.send_message` call with `send_message_timeout`.

---

## Verification

- `cargo check --target aarch64-apple-darwin -p trios-mb-scenes` — **passed with zero warnings**.
- **Zero bare `dialogue.update` calls** remain across all scene handlers.
- **Zero bare `bot.send_message` calls** remain across all scene handlers.
- No user-facing behavioral changes.

---

## Milestone: Telegram API Timeout Wrapper Migration 100% Complete

After 10 waves (Waves 194–203), the Telegram API timeout wrapper migration is **fully complete**:

| Workstream | Calls Wrapped | Waves | Status |
|---|---|---|---|
| `dialogue.update` → `dialogue_update_timeout` | ~175 | 194–201 | **Complete** |
| `bot.send_message` → `send_message_timeout` | ~105 | 194–203 | **Complete** |

Every outbound Telegram API call in every scene handler now has a hard 30-second timeout, preventing worker hangs and FSM state-loss during API stalls.

---

## Cooperation Variants for Wave 204

### Variant A — Shift to provider response body cap audit
Pivot to a new hardening theme: enforce maximum response body length caps across all AI provider call sites (success and error paths) in `SILVER-RING-AI00` and `GOLD-RING-PR00`. This addresses the risk of memory exhaustion from unexpectedly large provider responses. The `parse_json_limited` pattern already exists in some providers; extend it to all remaining provider files.

### Variant B — Shift to database query timeout audit
Pivot to a new hardening theme: audit all database query sites in `GOLD-RING-TR00` and `GOLD-RING-DB00` for missing query timeouts. Long-running or stuck DB queries can exhaust connection pools and cause cascading failures. This is a defensive-depth measure complementing the Telegram API timeout work.

### Variant C — Shift to input validation guard audit
Pivot to a new hardening theme: systematically audit all scene handlers for missing input validation guards (length caps, empty checks, character filters) on user-provided text fields. While many handlers already have validation, a comprehensive audit may reveal gaps in newer or less-frequently-used flows.

**Recommendation:** Variant A — the provider response body cap work is partially started (some providers use `parse_json_limited`) but not systematically applied. Completing it provides a clear next milestone and directly addresses a memory-exhaustion attack vector.
