# Wave 218 Plan

## Objective
Apply three security hardening fixes to the trios-mb Rust monorepo.

---

## Fix 1 — Sentinel guard in `is_super_admin`

**File:** `rings/SILVER-RING-TG00/src/access.rs`  
**Finding:** `is_super_admin(user_id)` returns `true` when `user_id == 0`. The value `0` is the sentinel returned by `load_mandatory_i64` when the `SUPER_ADMIN_ID` environment variable is missing or invalid (introduced in Wave 185 to eliminate startup panics). While no real Telegram user has ID 0, defense-in-depth requires that the sentinel be explicitly rejected in privilege checks.

**Literature:**
- CWE-754 — Improper Check for Unusual or Exceptional Conditions: "The software does not check or incorrectly checks for unusual or exceptional conditions."
- Rust Secure Coding Guidelines: "Security-critical predicates must explicitly reject sentinel, default, and uninitialized values."

**Implementation:**
Add an early-return guard to `is_super_admin`: `if user_id == 0 { return false; }`.

**Verification:**
`cargo check --package trios-mb-tg` and `cargo check --package trios-mb-app`

---

## Fix 2 — De-hardcode bot names in `has_parsing_access`

**File:** `rings/SILVER-RING-TG00/src/access.rs`  
**Finding:** `has_parsing_access` matches two literal strings — `"HaimGroupMedia_bot"` and `"MetaMuse_Manifest_bot"`. If a bot username is changed (e.g., username squatting, rebranding, or multi-environment deployment), the access control rule breaks silently. Hardcoded identifiers are a form of CWE-547 (Use of Hard-coded Security-relevant Constants).

**Literature:**
- CWE-547 — Use of Hard-coded Security-relevant Constants
- OWASP Application Security Verification Standard (ASVS) V1.1.1: "All application components, libraries, frameworks, and platform modules must be kept up-to-date."
- The Twelve-Factor App — Config: "Store config in the environment."

**Implementation:**
1. Add two new `LazyLock` statics (`HAIM_GROUP_BOT_NAME`, `METAMUSE_BOT_NAME`) loaded from `HAIM_GROUP_BOT_NAME` and `METAMUSE_BOT_NAME` environment variables, with the current hardcoded strings as fallbacks to preserve backward compatibility.
2. Replace the `match` literals in `has_parsing_access` with references to the statics.

**Verification:**
`cargo check --package trios-mb-tg` and `cargo check --package trios-mb-app`

---

## Fix 3 — Distributed tracing on registry access-control methods

**File:** `rings/SILVER-RING-TG00/src/registry.rs`  
**Finding:** Public security-critical methods (`check_access`, `is_transition_allowed`, `get`, `by_category`, `by_access_level`, `active_scenes`, `get_allowed_transitions`) lack `#[tracing::instrument]`. Without spans, security incidents involving unauthorized scene access or transition bypasses are invisible in distributed traces. This gap delays incident response and complicates forensic analysis.

**Literature:**
- OWASP Logging Cheat Sheet: "Log all authentication and authorization decisions."
- NIST SP 800-53 Rev. 5 — AU-6: "Audit Record Analysis"
- Google SRE Book, Chapter 17: "Observability is a prerequisite for security."

**Implementation:**
Add `#[tracing::instrument(skip(self), fields(...))]` to each public method in `SceneRegistry`, including relevant contextual fields such as `scene_id`, `category`, `access_level`, and `is_subscriber`.

**Verification:**
`cargo check --package trios-mb-tg` and `cargo check --package trios-mb-app`

---

## Success Criteria
- All three fixes compile cleanly (`cargo check` for affected crates and `cargo check --workspace`).
- Unit tests in affected files pass.
- No clippy warnings introduced.
