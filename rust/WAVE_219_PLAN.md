# Wave 219 Plan

## Objective
Eliminate three silent failure paths in the trios-mb Rust monorepo where `unwrap_or` / `unwrap_or_default` masks errors that should be observable in production traces.

---

## Fix 1 — CallbackData serialization error visibility

**File:** `rings/GOLD-RING-PR00/src/telegram.rs`  
**Finding:** `CallbackData::navigate`, `::action`, and `::action_with_payload` use `.unwrap_or_default()` on `serde_json::to_string`. In release builds the `debug_assert!`s are stripped, so a serialization failure (e.g., a malformed `SceneId` or a broken `serde_json` dependency) silently produces an empty callback-data string. Every inline keyboard button built from these helpers becomes a no-op, breaking the entire bot navigation tree with zero log evidence.

**Literature:**
- CWE-754 — Improper Check for Unusual or Exceptional Conditions
- Rust Secure Coding Guidelines: "`unwrap_or_default` on fallible serialization is a silent-failure anti-pattern."

**Implementation:**
Replace each `.unwrap_or_default()` with an explicit `match` that logs a `tracing::warn!` on failure and returns empty string. The behavioral result is identical (empty string on error), but the failure is now visible in distributed traces.

**Verification:**
`cargo check --package trios-mb-proto`, `cargo check --workspace`

---

## Fix 2 — Replicate webhook output URL parsing visibility

**File:** `rings/GOLD-RING-PR00/src/replicate.rs`  
**Finding:** `WebhookPayload::output_urls()` silently returns an empty `Vec<String>` when the provider's `output` field is neither a JSON array nor a string. This can happen if Replicate changes its response schema (e.g., wrapping URLs in an object with metadata). Because the webhook handler in `BRONZE-RING-SRV/src/webhooks.rs` simply skips the DB update when the URL list is empty, the generation completes but no result URL is stored — and operators have no log signal indicating schema drift.

**Literature:**
- CWE-754 — Improper Check for Unusual or Exceptional Conditions
- Google SRE Book: "Silently swallowing unexpected API formats is the fastest path to undetected provider regressions."

**Implementation:**
Add an `else` branch inside `output_urls()` that emits a `tracing::warn!` with a preview of the unexpected output format before returning the empty vector. Preserve backward compatibility (still return empty Vec) but make the anomaly observable.

**Verification:**
`cargo check --package trios-mb-proto`, `cargo check --workspace`

---

## Fix 3 — `get_balance` missing-user observability

**File:** `rings/SILVER-RING-DB00/src/repository.rs`  
**Finding:** `get_balance(telegram_id)` returns `0.0` when the user does not exist in the database. This sentinel is indistinguishable from a legitimate user with zero balance. It masks enrollment bugs (e.g., a user who skipped `/start` and went straight to a paid command) and makes it impossible to distinguish "user has no money" from "user does not exist" in traces.

**Literature:**
- CWE-754 — Improper Check for Unusual or Exceptional Conditions
- NIST SP 800-53 Rev. 5 — AU-6: "Audit records must distinguish between null/absent data and zero-valued data."

**Implementation:**
Replace the `unwrap_or(0.0)` with an explicit `match` that emits a `tracing::warn!` when the user is missing before returning `0.0`. This keeps the existing contract (return `0.0` for missing users to avoid breaking downstream `?` callers) but makes the sentinel visible in logs.

**Verification:**
`cargo check --package trios-mb-db`, `cargo test --package trios-mb-db`, `cargo check --workspace`

---

## Success Criteria
- All three fixes compile cleanly (`cargo check --workspace`).
- Unit tests in affected crates pass.
- No clippy warnings introduced.
