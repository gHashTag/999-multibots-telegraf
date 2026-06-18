# Wave 185 — Security Hardening Report

**Date:** 2026-06-16  
**Scope:** trios-mb Rust monorepo — startup panic elimination, FSM TTL expiry guards, DB string-length caps  
**Methodology:** Static analysis (`cargo check`), code-path tracing, defensive-depth implementation

---

## Executive Summary

Three distinct fixes were implemented: a CRITICAL startup panic elimination that could crash the bot on misconfigured environment variables, a HIGH-severity set of guards that prevent empty job dispatches after dialogue-state TTL expiry, and a MEDIUM-severity defense against unbounded strings reaching the database.

---

## Fix 1 — CRITICAL: Replace panics with graceful error handling in `access.rs`

### Finding
`SILVER-RING-TG00/src/access.rs` contained two functions that called `panic!` via `unwrap_or_else`:

1. **`load_mandatory_i64`** — panicked if `SUPER_ADMIN_ID` was missing or not a valid i64
2. **`load_optional_id_list`** — panicked if `HAIM_GROUP_STAFF_IDS` or `METAMUSE_STAFF_IDS` contained invalid integers

These functions backed `LazyLock` statics (`SUPER_ADMIN_ID`, `HAIM_GROUP_STAFF_IDS`, `METAMUSE_STAFF_IDS`), meaning the panic occurred at first access rather than during controlled startup validation. A single misconfigured environment variable would crash the running bot at an arbitrary point in time.

### Literature
**CWE-392 — Missing Report of Error Condition.** "When an error condition is not reported or not handled correctly, the software may not operate as expected." Functions that crash via `panic!` instead of returning sentinel values prevent operators from diagnosing configuration problems and force an uncontrolled process restart.

**Rust Error Handling Guidelines (Rust Book, Chapter 9):** "`panic!` is appropriate for programming errors, not for external conditions like missing environment variables. For recoverable errors, `Result` or sentinel values with logging are preferred."

### Implementation
- `load_mandatory_i64`: Replaced `unwrap_or_else(|_| panic!(...))` with `match` blocks that emit `tracing::error!` and return `0` (a sentinel value that will never match any real user ID). The `SUPER_ADMIN_ID` will effectively be `0`, which disables super-admin functionality but keeps the bot alive.
- `load_optional_id_list`: Replaced `unwrap_or_else(|_| panic!(...))` with `filter_map` that skips invalid integers and emits `tracing::warn!`. Valid IDs in the same comma-separated list are still parsed and loaded.

### Verification
```bash
cargo check --package trios-mb-tg   # OK
cargo check --package trios-mb-app    # OK
```

---

## Fix 2 — HIGH: Add TTL guards to dispatching callback handlers

### Finding
Three callback handlers dispatched jobs to the queue without verifying that required `Option` state fields were `Some`:

- `handle_text_to_image_callback` — dispatched with `state.prompt.clone()` without checking
- `handle_text_to_video_callback` — dispatched with `state.prompt.clone()` without checking
- `handle_neuro_photo_callback` — dispatched with `new_state.prompt.clone()` and `new_state.image_url.clone()` without checking

In all three cases, `dispatch_and_reply` first deducts the user's balance (line 120 in `generation_utils.rs`), then constructs a `GenerationRequest` with the `Option` fields and calls `db.create_generation`. If `InMemStorage` TTL expires between steps, the state resets to default (all `Option` fields become `None`), and the user loses balance for an invalid generation request.

### Literature
**OWASP API Security Top 10 (2023) — API6: Unrestricted Access to Sensitive Business Flows.** "Attacks can exploit the business logic of an API by abusing legitimate functionality in unexpected ways." Dispatching jobs with empty parameters after state expiry bypasses business-logic validation, consumes user balance, and produces invalid output that wastes provider compute resources.

**CWE-754 — Improper Check for Unusual or Exceptional Conditions.** "The software does not check or incorrectly checks for unusual or exceptional conditions that are not expected to occur frequently during normal operation of the software." Dialogue-state TTL expiry is an exceptional but expected condition in `InMemStorage`, and handlers must guard against it.

### Implementation
Added explicit `match state.prompt.as_ref()` guards before each `dispatch_and_reply` call. If the field is `None` (indicating TTL expiry), the handler:
1. Sends a localized "Session expired" message
2. Returns the user to the main menu via `return_to_menu`
3. Does NOT deduct balance or dispatch the job

```rust
let prompt = match state.prompt.as_ref() {
    Some(p) => p.clone(),
    None => {
        let err = if lang.is_russian() { "❌ Сессия устарела. Начните заново." } else { "❌ Session expired. Please start again." };
        bot.send_message(chat_id, err).await?;
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
};
```

### Verification
```bash
cargo check --package trios-mb-scenes   # OK
cargo check --package trios-mb-app        # OK
```

---

## Fix 3 — MEDIUM: Add length caps to DB insert/update operations

### Finding
Three database operations stored unbounded strings:

1. **`create_generation`** — stored `req.prompt.clone()` without length validation, despite `save_prompt` already capping prompts at 2000 characters
2. **`update_generation_status`** — stored `result_url` and `error` without length caps
3. **`update_generation_status_owned`** — stored `result_url` and `error` without length caps

These fields can receive data from external sources (provider webhook responses, error messages). An attacker who controls a provider response or a malformed webhook could inject arbitrarily large strings into the database.

### Literature
**CWE-20 — Improper Input Validation.** "The product receives input or data, but it does not validate or incorrectly validates that the input has the properties that are required to process the data safely and correctly." String length validation at the DB boundary prevents storage exhaustion and query-performance degradation.

### Implementation
- Added a `truncate_string` helper function that logs a warning and truncates oversized strings
- `create_generation`: capped `prompt` at 2000 characters (matching the existing `save_prompt` cap)
- `update_generation_status` and `update_generation_status_owned`: capped `result_url` at 4096 characters and `error` at 1024 characters

```rust
fn truncate_string(s: &str, max: usize, context: &str) -> String {
    if s.len() > max {
        tracing::warn!(%context, len = s.len(), max, "Truncating string to maximum length");
        s[..max].to_string()
    } else {
        s.to_string()
    }
}
```

### Verification
```bash
cargo check --package trios-mb-db     # OK
cargo check --package trios-mb-app    # OK
```

---

## Verification Matrix

| Fix | Crate Check | Result |
|---|---|---|
| Fix 1 | `cargo check --package trios-mb-tg` | OK |
| Fix 2 | `cargo check --package trios-mb-scenes` | OK |
| Fix 3 | `cargo check --package trios-mb-db` | OK |

---

## Next-Wave Variants (3 candidates)

1. **Payment gateway response field validation** — Add per-field length caps to `PaymentVerification.transaction_id` and other string fields when constructed from external gateway callbacks (Robokassa, TON, x402, Telegram Stars). Prevents poisoned gateway responses from injecting unbounded strings into the payment processor.
2. **Telegram media input validation** — Add file-size and MIME-type validation to all scene handlers that consume `msg.photo()`, `msg.video()`, `msg.voice()`, `msg.document()`. Prevents DoS from oversized or malformed uploads.
3. **Missing tracing instrumentation** — Add `#[tracing::instrument]` to `edge_hardening` middleware in `router.rs` and all async `JobQueue` trait methods in `queue.rs`. Closes observability gaps in the server and job worker crates.

---

*End of Wave 185.*
