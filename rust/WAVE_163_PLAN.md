# Wave 163 Plan

**Date:** 2026-06-16
**Theme:** Startup resilience, strict URL validation, observability, input bounds

---

## Scientific Literature Review

### Papers & References
1. **"Crash-Only Software"** (Candea & Fox, 2003) — Systems that treat all failures as crashes and restart components. Informs our provider constructor failure handling: never panic on startup, degrade gracefully.
2. **OWASP SSRF Prevention Cheat Sheet** — Recommends `java.net.URL` / `urllib.parse` style canonicalization before validation. Our string-based `starts_with`/`contains` validation is bypassable by hex IP encoding (`0x7f.0.0.1`), IDNA homographs, and username-embedding tricks (`http://evil@127.0.0.1`).
3. **"Distributed Systems Observability"** (Twitter SRE Blog) — `tracing::instrument` on every async boundary is prerequisite for latency debugging in production. Missing spans on Telegram handlers makes root-cause analysis impossible.
4. **CWE-20: Improper Input Validation** — Unbounded string copies into dialogue state allow DB column overflow, bloated Redis payloads, and downstream provider API rejection. Length caps at ingestion prevent all downstream damage.
5. **Rust Error Handling Patterns** (rust-lang/book ch.9) — `.expect()` in library code violates the principle of least surprise. Constructors that may fail should return `Result`, letting the caller decide between graceful degradation and abort.

---

## Decomposed Tasks

### Task #141 (CRITICAL) — Remove `.expect()` from AI provider constructors
**Scope:** 11 `.expect()` calls across 8 provider files + 1 router file.
**Approach:**
- Change provider `new()` / `deepseek()` / `grok()` to return `Result<Self, AppError>`.
- In each constructor, `match` on `reqwest::Client::builder()...build()`:
  - `Ok(client) => client`
  - `Err(e) => return Err(AppError::Internal(format!("Failed to build {provider} reqwest client: {}", e)))`
- Update `build_orchestrator()` to return `Result<AiOrchestrator, AppError>`.
- In `main.rs`, match on `build_orchestrator().await`:
  - `Ok(orch) => orch`
  - `Err(e) => { error!("Failed to build AI orchestrator: {}", e); std::process::exit(1); }`
**Files:**
- `rings/SILVER-RING-AI00/src/providers/openai.rs`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs`
- `rings/SILVER-RING-AI00/src/providers/fal.rs`
- `rings/SILVER-RING-AI00/src/providers/kie.rs`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs`
- `rings/SILVER-RING-AI00/src/providers/midjourney.rs`
- `rings/BRONZE-RING-APP/src/main.rs`

### Task #142 (HIGH) — Replace string-based URL validation with `url::Url`
**Scope:** `validate_result_url` in `webhooks.rs`.
**Approach:**
- Parse with `url::Url::parse()` first.
- Validate scheme == "http" or "https".
- Reject `username()`, `password()` presence (credential embedding).
- Extract `host()`, reject:
  - `localhost` (exact match)
  - loopback IPs (`127.0.0.0/8`, `::1`)
  - private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  - link-local (`169.254.0.0/16`)
  - IPv6 ULA (`fc00::/7`)
- Cap length at 4096.
- Return `Result<(), String>` preserving error messages.
**File:** `rings/BRONZE-RING-SRV/src/webhooks.rs`

### Task #143 (HIGH) — Add `tracing::instrument` to critical async handlers
**Scope:** 15 most critical handlers (background workers + key Telegram scenes).
**Approach:**
- Add `#[tracing::instrument(skip(bot, dialogue, db))]` to Telegram scene handlers.
- Add `#[tracing::instrument(skip(db, queue, orchestrator))]` to `handle_generation_job` and worker functions.
- Ensure `skip` lists exclude non-Debug fields (dyn traits, `Arc<Bot>`).
**Files:**
- `rings/BRONZE-RING-APP/src/main.rs` (`handle_generation_job`, `build_orchestrator`)
- `rings/SILVER-RING-SN00/src/start.rs`
- `rings/SILVER-RING-SN00/src/generation_utils.rs`
- `rings/SILVER-RING-SN00/src/morphing.rs`
- `rings/SILVER-RING-SN00/src/face_swap.rs`
- `rings/SILVER-RING-SN00/src/text_to_image.rs`
- `rings/SILVER-RING-SN00/src/text_to_video.rs`
- `rings/SILVER-RING-SN00/src/neuro_photo.rs`
- `rings/SILVER-RING-SN00/src/tech_support.rs`
- `rings/SILVER-RING-SN00/src/avatar_brain.rs`
- `rings/SILVER-RING-SN00/src/avatar_transform.rs`
- `rings/SILVER-RING-SN00/src/chat_with_avatar.rs`
- `rings/SILVER-RING-SN00/src/ai_cover.rs`
- `rings/SILVER-RING-SN00/src/image_to_video.rs`
- `rings/SILVER-RING-SN00/src/instagram_scraping.rs`

### Task #144 (MEDIUM) — Add input length caps to dialogue state handlers
**Scope:** 10 handlers that store user text in dialogue state without length validation.
**Approach:**
- Define `const MAX_DIALOGUE_TEXT_LEN: usize = 2000;` in each handler.
- After extracting `msg.text()`, check `text.len() > MAX_DIALOGUE_TEXT_LEN`.
- If exceeded, send localized error and return `Ok(())`.
- Apply to: `avatar_transform`, `chat_with_avatar`, `fal_render`, `hedra_render`, `image_to_video`, `instagram_scraping`, `neuro_photo`, `ai_photoshop`, `ai_reels`, `improve_prompt`.
**Files:** 10 handler files in `rings/SILVER-RING-SN00/src/`

### Task #145 (LOW) — Fix `unwrap_or_default()` on attacker-controlled data
**Scope:** 2 locations.
**Approach:**
- In `replicate.rs` `WebhookPayload::output_urls()`, replace `unwrap_or_default()` with explicit error handling or at least `unwrap_or_else` with a warning log.
- In `webhooks.rs`, replace `urls.first().map(...).unwrap_or("")` with an explicit match that returns an error if the list is empty.
**Files:**
- `rings/GOLD-RING-PR00/src/replicate.rs`
- `rings/BRONZE-RING-SRV/src/webhooks.rs`

### Task #146 (MEDIUM) — Router rate-limit `.expect()` removal
**Scope:** `router.rs:15`.
**Approach:**
- Make `rate_limit_layer` return `Result<GovernorLayer<...>, AppError>`.
- In `create_router`, match on the result; on error, log and fall back to a no-op layer or return an error.
**File:** `rings/BRONZE-RING-SRV/src/router.rs`

---

## Deferred to Wave 164

1. **Secrets as plain `String`** — Full `SecretString` migration for bot tokens, DB URL, Infisical credentials (requires touching `config.rs`, `bot.rs`, `secret_store.rs`, `entities/bots.rs`).
2. **`f64` → `Money(i64)` full migration** — Still blocked by DB schema migration for `users.balance`, `payments.amount`.
3. **`InMemStorage` → Redis** — Requires Redis infrastructure and TTL eviction.
4. **`tracing::instrument` on remaining ~60 handlers** — Mechanical, will be batched in a dedicated observability wave.
5. **MidjourneyProvider constructor** — May not be wired in `main.rs`; verify before migrating.

---

## Acceptance Criteria

- [ ] All 11 `.expect()` calls removed; workspace compiles.
- [ ] `validate_result_url` uses `url::Url::parse` and rejects hex/octal IP encodings.
- [ ] 15 critical handlers carry `#[tracing::instrument]`.
- [ ] 10 dialogue state handlers enforce `MAX_DIALOGUE_TEXT_LEN`.
- [ ] 2 `unwrap_or_default()` on attacker data hardened.
- [ ] `rate_limit_layer` returns `Result`.
- [ ] Full workspace `cargo check` passes cleanly.
