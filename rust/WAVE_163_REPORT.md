# Wave 163 Security Report

**Date:** 2026-06-16
**Scope:** trios-mb Rust monorepo
**Theme:** Startup resilience, strict URL validation, observability, input bounds

---

## Executive Summary

Wave 163 delivers one CRITICAL fix (provider `.expect()` removal), two HIGH fixes (strict URL validation, tracing instrumentation), and two MEDIUM fixes (input length caps, router rate-limit safety).

**CRITICAL:**
1. Provider constructor `.expect()` removal — 11 `.expect()` calls replaced with `Result<Self, AppError>` propagation

**HIGH:**
2. Strict URL validation — `validate_result_url` now uses `url::Url::parse` + host-based IP rejection
3. `tracing::instrument` added to ~15 critical async handlers and background workers

**MEDIUM:**
4. Input length caps — `MAX_DIALOGUE_TEXT_LEN = 2000` enforced at 11 handler ingestion points
5. Router rate-limit `.expect()` removal — `rate_limit_layer` now returns `Option` with graceful fallback

---

## Phase 1 — CRITICAL: Provider Constructor `.expect()` Removal

### 1.1 Problem
All 8 AI provider constructors (OpenAI, DeepSeek, Grok, Replicate, Fal, Kie, ElevenLabs, HeyGen, Hedra, Midjourney) and the router `rate_limit_layer` used `.expect()` on `reqwest::Client::builder()...build()`. A TLS misconfiguration, invalid proxy, or corrupted CA bundle would panic the process at startup, preventing graceful degradation.

### 1.2 Fix
Changed every provider `new()` (plus `deepseek()` and `grok()` in `openai.rs`) to return `Result<Self, AppError>`. The `reqwest::Client::build()` error is mapped to `AppError::Internal` with a provider-specific message.

Updated `build_orchestrator()` to return `AiOrchestrator` (not `Result`) but with a `match` on each provider construction. On failure, a `warn!` log is emitted and that provider is simply omitted from the orchestrator pool. The bot continues to operate with the remaining providers.

**Files:**
- `rings/SILVER-RING-AI00/src/providers/openai.rs` — `new`, `deepseek`, `grok`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs` — `new`
- `rings/SILVER-RING-AI00/src/providers/fal.rs` — `new`
- `rings/SILVER-RING-AI00/src/providers/kie.rs` — `new`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs` — `new`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs` — `new`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs` — `new`
- `rings/SILVER-RING-AI00/src/providers/midjourney.rs` — `new`
- `rings/BRONZE-RING-APP/src/main.rs` — `build_orchestrator` call sites

---

## Phase 2 — HIGH: Strict URL Validation

### 2.1 Problem
`validate_result_url` in `webhooks.rs` used string-based heuristics (`starts_with`, `contains`) to reject SSRF indicators. This is bypassable by hex/octal IP encodings (`0x7f.0.0.1`), IDNA homographs, and other URL canonicalization quirks.

### 2.2 Fix
Rewrote `validate_result_url` to use `url::Url::parse` first, then inspect the parsed structure:
- Scheme whitelist: `http` or `https` only
- Embedded credential rejection: `username().is_empty()` + `password().is_none()`
- Host-based IP rejection via `std::net::IpAddr::parse`:
  - Loopback (`is_loopback`)
  - Private IPv4 (`is_private`)
  - Link-local IPv4 (`is_link_local`)
  - IPv6 ULA (`fc00::/7`)
  - IPv6 link-local (`fe80::/10`)
- `localhost` string rejection
- Length cap: 4096 bytes

**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

---

## Phase 3 — HIGH: Observability (`tracing::instrument`)

### 3.1 Problem
~76 async handlers lacked `#[tracing::instrument]`, making production latency debugging and span correlation impossible. The HTTP server layer had instrumentation, but the Telegram bot layer and background workers did not.

### 3.2 Fix
Added `#[tracing::instrument(skip_all)]` to 15 critical handlers:
- Background workers: `handle_generation_job`, `build_orchestrator` (main.rs)
- Core utilities: `dispatch_and_reply`, `deduct_balance` (generation_utils.rs)
- Telegram message handlers: `handle_start`, `handle_tech_support_msg`, `handle_instagram_scraping_msg`, `handle_ai_cover_msg`, `handle_avatar_transform_msg`, `handle_neuro_photo_msg`, `handle_morphing_msg`
- Telegram callback handlers: `handle_ai_cover_callback`, `handle_avatar_transform_callback`, `handle_morphing_callback`, `handle_neuro_photo_callback`

`skip_all` avoids `Debug` trait issues on `dyn Trait` parameters and `teloxide::Bot`.

**Files:**
- `rings/BRONZE-RING-APP/src/main.rs`
- `rings/SILVER-RING-SN00/src/start.rs`
- `rings/SILVER-RING-SN00/src/generation_utils.rs`
- `rings/SILVER-RING-SN00/src/tech_support.rs`
- `rings/SILVER-RING-SN00/src/instagram_scraping.rs`
- `rings/SILVER-RING-SN00/src/ai_cover.rs`
- `rings/SILVER-RING-SN00/src/avatar_transform.rs`
- `rings/SILVER-RING-SN00/src/neuro_photo.rs`
- `rings/SILVER-RING-SN00/src/morphing.rs`

---

## Phase 4 — MEDIUM: Input Length Caps

### 4.1 Problem
Dozens of Telegram handlers stored `msg.text()` directly into dialogue state (`state.style`, `state.prompt`, `state.message`, etc.) without length validation. This allows:
- Oversized DB writes (potential column overflow)
- Bloated job-queue payloads
- Downstream provider API rejection or quota abuse

### 4.2 Fix
Added `const MAX_DIALOGUE_TEXT_LEN: usize = 2000;` and length-check guards before every state assignment in 11 handler files. On exceed, a localized error is sent to the user and the handler returns early.

**Files:**
- `rings/SILVER-RING-SN00/src/avatar_transform.rs` — `state.style`
- `rings/SILVER-RING-SN00/src/ai_photoshop.rs` — `state.prompt`
- `rings/SILVER-RING-SN00/src/ai_reels.rs` — `state.prompt`
- `rings/SILVER-RING-SN00/src/fal_render.rs` — `state.prompt`
- `rings/SILVER-RING-SN00/src/hedra_render.rs` — `state.text`
- `rings/SILVER-RING-SN00/src/improve_prompt.rs` — `state.original_prompt`
- `rings/SILVER-RING-SN00/src/image_to_video.rs` — `state.prompt`
- `rings/SILVER-RING-SN00/src/neuro_photo.rs` — `new_state.prompt`
- `rings/SILVER-RING-SN00/src/text_to_speech.rs` — `state.text`
- `rings/SILVER-RING-SN00/src/heygen_render.rs` — `state.text` (2000 cap) + `state.avatar_id` (128 cap)
- `rings/SILVER-RING-SN00/src/avatar_brain.rs` — `state.name`, `state.personality`, `state.skills`

---

## Phase 5 — MEDIUM: Router Rate-Limit Safety

### 5.1 Problem
`router.rs` `rate_limit_layer` used `.expect("rate limit config is valid")` on `GovernorConfigBuilder::finish()`. A future misconfiguration (zero per-second rate) would panic.

### 5.2 Fix
Changed `rate_limit_layer` to return `Option<GovernorLayer>`. Added `apply_rate_limit` helper that conditionally layers the rate limiter; on `None`, it logs an error and continues without rate limiting. Both `create_router` and `create_router_with_payments` use the new helper.

**File:** `rings/BRONZE-RING-SRV/src/router.rs`

---

## Verification

- Full workspace `cargo check --target aarch64-apple-darwin` passes cleanly.
- CRITICAL: All 11 `.expect()` calls removed; no compilation regressions.
- HIGH: `url::Url` validation compiles in server crate.
- HIGH: `tracing::instrument` attributes compile on all 15 handlers.
- MEDIUM: Input length caps compile in 11 handler files.
- MEDIUM: Router rate-limit `Option` fallback compiles.

---

## Deferred Items

1. **Secrets as plain `String`** — Full `SecretString` migration for bot tokens, DB URL, Infisical credentials (requires touching `config.rs`, `bot.rs`, `secret_store.rs`, `entities/bots.rs`).
2. **`f64` → `Money(i64)` full migration** — Blocked by DB schema migration for `users.balance`, `payments.amount`.
3. **`InMemStorage` → Redis** — Requires Redis infrastructure and TTL eviction.
4. **`tracing::instrument` on remaining ~60 handlers** — Mechanical, will be batched in a dedicated observability wave.
5. **`unwrap_or_default()` on attacker data** — `replicate.rs` `output_urls()` and `webhooks.rs` URL list fallback are low-risk and cosmetic.
6. **MidjourneyProvider wiring** — Verify if it's actually used in `main.rs`; if not, consider removing the dead provider.

---

## Cooperation Options for Wave 164

**Option A — Secrets Hardening**
- Migrate `AppConfig.infisical_client_secret`, `database_url` to `SecretString`
- Change `secret_store.get()` trait to return `SecretString` instead of `String`
- Update `bots.token` entity and `BotConfig` to use `SecretString`
- Install zeroization hooks for sensitive env vars

**Option B — Financial Precision**
- Begin `f64` → `Money(i64)` migration at the trait boundary (`database.rs`, `payment_gateway.rs`)
- Add repository shims that convert `Money` ↔ `f64` for DB compatibility
- Update `deduct_balance` / `add_balance` / `complete_robokassa_payment` to accept `Money`

**Option C — Observability Sweep**
- Bulk-add `#[tracing::instrument]` to all remaining ~60 Telegram handlers
- Add `tracing::instrument` to all `SILVER-RING-AI00` provider methods (`generate`, `check_status`, `get_result`)
- Add custom `Debug` impls for provider structs that currently derive `Debug` (leaks `SecretString`)
- Build a `tracing_subscriber` layer with JSON formatting for production

---

*End of Wave 163 Report*
