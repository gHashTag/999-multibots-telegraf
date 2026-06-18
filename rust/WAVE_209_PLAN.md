# Wave 209 Plan — Silent Failure Elimination

## Goal
Eliminate three categories of silent failures that hide errors from operators and prevent root-cause analysis: DB error swallowing in language resolution, Telegram API error dropping in handler utilities, and an unlogged orchestrator timeout.

## Fixes (exactly 3)

### Fix 1 — DB Error Swallowing in Language Resolution
**File:** `rings/SILVER-RING-SN00/src/generation_utils.rs`
**Change:** Replace `.ok().flatten().map(...).unwrap_or_default()` in `load_lang_by_id` and `load_lang_cb` with explicit `match` arms that log DB errors at `warn!` level before falling back to `Language::default()`.
**Why:** `load_lang_by_id` uses `db.get_user_by_telegram_id(tid).await.ok().flatten().map(...).unwrap_or_default()`. If the DB is unreachable, the `Result` is converted to `None` by `.ok()`, then flattened, then mapped, then defaults to `Language::default()`. The error is never logged, never propagated, and never alerted on. During a DB outage, every user silently sees English (or the default language) with no operator signal.

### Fix 2 — Telegram API Error Dropping in Handler Utilities
**File:** `rings/SILVER-RING-SN00/src/generation_utils.rs`
**Change:** Replace all `let _ = send_message_timeout(...).await` and `let _ = dialogue_update_timeout(...).await` in `return_to_menu` and `dispatch_and_reply` with `if let Err(e)` guards that log at `warn!` level.
**Instances:** 8 `let _ =` patterns across the two functions:
- `return_to_menu`: 2 instances (send_menu, state_reset)
- `dispatch_and_reply`: 6 instances (insufficient_balance msg, processing msg, enqueue_failure msg, create_generation_failure msg, 2 state_resets)
**Why:** `let _ =` explicitly instructs Rust to ignore the `Result`. If Telegram API is rate-limiting, down, or the bot token is invalid, the user gets no feedback and the state machine silently deviates from its intended path. The error is completely invisible in logs.

### Fix 3 — Unlogged Orchestrator Dispatch Timeout
**File:** `rings/SILVER-RING-AI00/src/orchestrator.rs`
**Change:** Add `tracing::warn!(media_type = ?request.media_type, "Orchestrator dispatch timed out after 120s")` to the `Err(_)` branch of the `tokio::time::timeout` in `dispatch`.
**Why:** The sibling methods `check_status` and `get_result` both log a `warn!` on timeout, but `dispatch` does not. A 120-second timeout appears in the trace span duration but produces no log event, making it impossible to search or alert on. Operators cannot distinguish a timeout from a genuine `AllProvidersFailed` error without manually inspecting trace durations.

## Validation
- `cargo check --target aarch64-apple-darwin` must pass with zero warnings.
- No functional behavior changes; purely adding observability to failure paths.
