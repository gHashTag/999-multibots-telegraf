# Wave 205 — Security Hardening Plan

## Theme
**Connection-pool exhaustion defense, tracing observability on critical Telegram helpers, and tracing coverage on security middleware + untraced provider methods**

## Background
1. Every `reqwest::Client` in the monorepo uses `Client::builder()` with `.timeout()`, `.connect_timeout()`, and `.redirect(Policy::none())`, but **none** set `.pool_max_idle_per_host()`. reqwest defaults to an unbounded pool per host, which can exhaust file descriptors under sustained load or connection churn (CWE-770, CWE-400).
2. The centralized Telegram timeout helpers in `SILVER-RING-TG00/src/utils.rs` (`send_message_timeout`, `dialogue_update_timeout`, etc.) are called from ~100 handler sites but have **zero** `tracing::instrument` spans. During incidents, these critical paths are invisible in distributed traces.
3. The `edge_hardening` middleware in `BRONZE-RING-SRV` processes every HTTP request but has no tracing span. Additionally, several public provider methods in `elevenlabs.rs`, `heygen.rs`, and `openai.rs` (e.g., `add_voice`, `create_avatar_video`, `chat_completion`) lack `tracing::instrument`, creating blind spots for outbound AI API calls.

## Fixes (exactly 3)

### Fix 1 — Cap idle connections per host on all reqwest clients
**Files:**
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs`
- `rings/SILVER-RING-AI00/src/providers/kie.rs`
- `rings/SILVER-RING-AI00/src/providers/midjourney.rs`
- `rings/SILVER-RING-AI00/src/providers/openai.rs` (3 builders)
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`
- `rings/SILVER-RING-PY00/src/x402.rs`
- `rings/SILVER-RING-SC00/src/store.rs`

**Change:** Add `.pool_max_idle_per_host(10)` to every `reqwest::Client::builder()` chain.
**Scientific basis:** File-descriptor exhaustion / resource-throttling (CWE-770, CWE-400).

### Fix 2 — `tracing::instrument` on SILVER-RING-TG00 timeout helpers
**File:** `rings/SILVER-RING-TG00/src/utils.rs`

**Change:** Add `#[tracing::instrument(skip_all)]` to:
- `send_message_timeout`
- `answer_callback_query_timeout`
- `dialogue_update_timeout`
- `dialogue_exit_timeout`

**Scientific basis:** Observability is a prerequisite for incident response. Untraced critical paths create blind spots during outages (SRE best practices, Google SRE book).

### Fix 3 — `tracing::instrument` on edge hardening middleware and untraced provider methods
**Files:**
- `rings/BRONZE-RING-SRV/src/router.rs` — `edge_hardening`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs` — `text_to_speech_raw`, `list_voices`, `voice_exists`, `add_voice`, `get_character_balance`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs` — `create_avatar_video`, `check_video_status`, `list_avatars`
- `rings/SILVER-RING-AI00/src/providers/openai.rs` — `chat_completion`, `upgrade_prompt`

**Change:** Add `#[tracing::instrument(skip_all)]` to each of the above async functions/methods.
**Scientific basis:** Untraced outbound API calls and security middleware create operational blind spots. Distributed tracing must cover every tier of the request path (middleware → handler → outbound provider) to enable root-cause analysis during incidents.

## Verification
1. `cargo check --target aarch64-apple-darwin` must pass with zero warnings.
2. Confirm all provider builder chains include `pool_max_idle_per_host`.
3. Confirm `tracing::instrument` is present on all targeted functions.

## Deferred
- Migrate `InfisicalStore` credentials to `secrecy::SecretString` (constructor signature change).
- Add per-field `serde` validators (`#[serde(deserialize_with)]`) to webhook structs for stricter deserialization boundaries.

## Cooperation Variants for Wave 206
1. **Input length caps on all bot handlers** — Audit every scene handler for missing length validation on text inputs, URLs, and file IDs; add caps where absent.
2. **SeaORM query timeout audit** — Verify every DB query has an explicit timeout or is wrapped in `tokio::time::timeout` to prevent indefinite blocking on slow queries.
3. **Webhook payload schema hardening** — Add per-field `serde` validators (`#[serde(deserialize_with)]`) to webhook structs to enforce length caps, regex patterns, and enum restrictions at the deserialization boundary.
