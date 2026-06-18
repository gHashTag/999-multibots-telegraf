# Wave 208 Plan — Final Tracing Gaps: Orchestrator Retry Loop, Handler Utilities, DB Startup

## Goal
Close the last remaining distributed tracing blind spots in critical request paths by instrumenting the AI orchestrator's inner retry loop, the most frequently called Telegram handler utilities, and the database startup lifecycle methods.

## Fixes (exactly 3)

### Fix 1 — Orchestrator `dispatch_inner` Tracing
**File:** `rings/SILVER-RING-AI00/src/orchestrator.rs`
**Change:** Add `#[tracing::instrument(skip_all)]` to `dispatch_inner`.
**Why:** `dispatch` (the public trait method) has tracing and wraps `dispatch_inner` in a 120s global timeout. Without a span on `dispatch_inner`, the individual provider retry attempts, circuit breaker evaluations, and per-provider error recording are invisible inside the trace. A failed generation that tried 5 providers appears as a single 90s span with no insight into which providers were attempted, which circuit breakers were open, or which error was terminal.

### Fix 2 — Handler Utility Tracing
**File:** `rings/SILVER-RING-SN00/src/generation_utils.rs`
**Change:** Add `#[tracing::instrument(skip_all)]` to 4 utility functions:
- `load_lang`
- `load_lang_by_id`
- `load_lang_cb`
- `return_to_menu`
**Why:** These functions are called from virtually every Telegram scene handler. `load_lang*` functions execute a DB query (`get_user_by_telegram_id`) on every message and callback. Without spans, DB latency from language lookups appears as unexplained gaps in handler traces. `return_to_menu` dispatches Telegram API calls; its latency is similarly invisible.

### Fix 3 — DB Repository Startup Tracing
**File:** `rings/SILVER-RING-DB00/src/repository.rs`
**Change:** Add `#[tracing::instrument(skip_all)]` to:
- `connect`
- `run_migrations`
**Why:** Database initialization is on the critical startup path. If `connect` or `run_migrations` hangs or fails, the app crashes on boot with no structured trace showing which step failed. Adding spans makes bootstrap failures observable in distributed tracing.

## Validation
- `cargo check --target aarch64-apple-darwin` must pass with zero warnings.
- No functional code changes; purely additive instrumentation.
