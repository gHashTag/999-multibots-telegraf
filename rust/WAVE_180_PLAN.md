# Wave 180 Plan

Date: 2026-06-16  
Status: IN PROGRESS  

## Literature Review

### 1. Strict Deserialization for API Contracts
Michael Nygard, *Release It!* 2nd Ed. — "Integration Points" chapter: external API drift is a common source of production failures. Silent truncation of unknown fields masks both provider changes and injection attempts. `deny_unknown_fields` converts silent truncation into an observable error, giving operators an early warning and preventing downstream logic from acting on missing data.

### 2. State Machine Consistency Under Memory Pressure
Martin Kleppmann, *Designing Data-Intensive Applications* — In-memory state machines with TTL eviction must treat expired state as a **terminal reset condition**. Using `unwrap_or_default()` on optional state fields produces logically invalid output (empty collections) that downstream logic cannot distinguish from genuinely empty user input. The correct pattern is an explicit guard that returns the user to the menu with a clear message.

### 3. Observability at Service Boundaries
Google SRE Book, *Site Reliability Engineering* — Distributed traces must cover every user-facing entrypoint. Without spans on async handlers, latency attribution fails and root-cause analysis requires code-level debugging. `tracing::instrument(skip_all)` on every `pub async fn` that serves user requests is the minimum viable tracing posture.

## Selected Fixes

### Fix 1 — `deny_unknown_fields` on 35 provider structs in GOLD-RING-PR00 (HIGH)

**Problem:** The core provider module `GOLD-RING-PR00` contains 35 inbound deserialization structs across 8 files that lack `#[serde(deny_unknown_fields)]`. When external AI providers or payment gateways return unexpected fields (API version drift, schema changes, or compromise), serde silently ignores them. This can mask errors, hide injected data, or cause logic bugs.

**Files:**
- `rings/GOLD-RING-PR00/src/fal.rs` — 8 structs
- `rings/GOLD-RING-PR00/src/infisical.rs` — 1 struct
- `rings/GOLD-RING-PR00/src/kie.rs` — 5 structs
- `rings/GOLD-RING-PR00/src/openai.rs` — 7 structs
- `rings/GOLD-RING-PR00/src/payment.rs` — 1 struct
- `rings/GOLD-RING-PR00/src/providers.rs` — 8 structs
- `rings/GOLD-RING-PR00/src/replicate.rs` — 3 structs
- `rings/GOLD-RING-PR00/src/telegram.rs` — 2 structs

**Solution:** Batch-add `#[serde(deny_unknown_fields)]` to all Deserialize structs via scripted edit.

### Fix 2 — FSM state-loss guards in `morphing.rs` (MEDIUM)

**Problem:** `morphing.rs` uses `state.images.clone().unwrap_or_default()` in two places (step 1 photo collection and callback generate handler). After `InMemStorage` TTL expiry, `state.images` becomes `None`, silently resetting the photo collection to empty. The user sees "Need at least 2 images" without any explanation of why their previously uploaded photos disappeared.

**Solution:** Replace both `unwrap_or_default()` calls with explicit `match` guards that send a localized "Session expired" warning and return to menu.

### Fix 3 — `tracing::instrument` on 10 high-value scene handlers (MEDIUM)

**Problem:** 29 scene handlers in `SILVER-RING-SN00` still lack `#[tracing::instrument]`. The most critical user-facing entrypoints (AI Photoshop, Avatar Brain, Chat with Avatar, Digital Avatar Body, Flux Kontext, Hedra Render, Heygen Render, Email, Fal Render, Cancel Predictions) are invisible to distributed tracing.

**Solution:** Add `#[tracing::instrument(skip_all)]` to the `pub async fn handle_*_msg` and `pub async fn handle_*_callback` functions in 10 files.

## Verification

- `cargo check --workspace` must pass.
- No runtime behavior changes beyond early-return on invalid state.

## Deferred

- `tracing::instrument` on remaining 19 scene handlers (observability wave).
- `unwrap_or_default()` audit on other scene handlers (FSM-consistency wave).
- `deny_unknown_fields` on outbound Serialize-only structs (low priority).
