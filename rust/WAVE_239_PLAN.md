# Wave 239 Security Plan

**Date:** 2026-06-16
**Theme:** Provider configuration hardening — reqwest timeout constants and model name externalization

---

## Fix 1: Extract named reqwest timeout constants in `openai.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** Three constructors (`new()`, `deepseek()`, `grok()`) each repeat bare `std::time::Duration::from_secs(N)` literals for `.timeout(60)`, `.connect_timeout(10)`, and `.pool_idle_timeout(90)`. These magic numbers are duplicated across constructors and providers, making them hard to maintain consistently.

**Solution:**
- Add named constants for reqwest client configuration:
  - `const REQWEST_TIMEOUT: Duration = Duration::from_secs(60);`
  - `const REQWEST_CONNECT_TIMEOUT: Duration = Duration::from_secs(10);`
  - `const REQWEST_POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(90);`
- Replace all bare literals in the three constructors with the named constants.

---

## Fix 2: Extract named reqwest timeout constants in `heygen.rs` (MEDIUM)

**File:** `rings/SILVER-RING-AI00/src/providers/heygen.rs`

**Problem:** `HeyGenProvider::new` uses bare `std::time::Duration::from_secs(N)` literals for `.timeout(60)`, `.connect_timeout(10)`, and `.pool_idle_timeout(90)`. Same maintainability issue as Fix 1.

**Solution:**
- Add the same named constants as Fix 1 (or module-level equivalents).
- Replace bare literals in `new()` with named constants.

---

## Fix 3: Externalize hardcoded default model name in `openai.rs` (LOW)

**File:** `rings/SILVER-RING-AI00/src/providers/openai.rs`

**Problem:** The `chat_completion` method uses `.unwrap_or("gpt-4o")` as the default model name. This hardcoded string requires a code redeploy to switch the default model.

**Solution:**
- Add `std::sync::LazyLock<String>` constant `OPENAI_DEFAULT_MODEL` sourcing from `OPENAI_DEFAULT_MODEL` env var with fallback to `"gpt-4o"`.
- Replace the hardcoded `"gpt-4o"` in `chat_completion` with the `LazyLock` reference.

---

## Acceptance Criteria
- [ ] `cargo check` passes on `SILVER-RING-AI00`
- [ ] No new warnings
- [ ] Report and memory updated

---

## Cooperation Variants for Next Wave

### Variant A — Finish reqwest timeout extraction sweep
Apply the same named-constant pattern to remaining providers: `elevenlabs.rs`, `hedra.rs`, `fal.rs`, `kie.rs`, `replicate.rs`, `midjourney.rs`.

### Variant B — Externalize remaining hardcoded model/voice names
Externalize `alloy` default voice in `openai.rs` and any other hardcoded model identifiers still present in providers.

### Variant C — Provider constructor consolidation
Audit if the three near-identical reqwest client builder blocks in `openai.rs` (and similar patterns in other providers) can be extracted to a shared helper function to reduce duplication.
