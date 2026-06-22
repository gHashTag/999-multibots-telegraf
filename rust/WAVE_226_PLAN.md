# WAVE 226 PLAN

## Objective
Address three distinct availability and input-validation gaps discovered during autonomous security scanning: unbounded image accumulation in InMemStorage-backed dialogue states, and missing empty-prompt guards on text-based generation handlers.

---

## Finding 1 — Unbounded image accumulation in `morphing.rs`
**Severity:** HIGH (CWE-770: Allocation of Resources Without Limits or Throttling)

The morphing handler stores every uploaded photo `file_id` in a `Vec<String>` inside `MorphingState`, which is persisted in `InMemStorage`. There is no maximum count. A malicious user (or a buggy client) can send an unlimited stream of photos, causing the per-chat state to grow unbounded and eventually trigger an OOM kill of the bot process. Because `InMemStorage` is process-local and lacks TTL eviction, the state persists until restart.

**Remediation:**
- Add `const MAX_MORPHING_IMAGES: usize = 10;` at module scope.
- Before pushing a new `file_id`, check if `images.len() >= MAX_MORPHING_IMAGES`.
- If at cap, send a localized error message ("Maximum 10 images allowed for morphing") and return `Ok(())` without mutating state.

**Literature:** CWE-770 — allocating resources without limits or throttling. The `InMemStorage` backend compounds the issue because state is never evicted. A per-request or per-session cap is the standard defense.

---

## Finding 2 — Unbounded image accumulation in `train_flux_model.rs`
**Severity:** HIGH (CWE-770)

Identical pattern to Finding 1: `TrainFluxModelState` accumulates an unbounded `Vec<String>` of training image `file_id`s. Flux training typically expects 4–20 images; allowing unlimited accumulation serves no product purpose and creates the same DoS vector.

**Remediation:**
- Add `const MAX_TRAIN_IMAGES: usize = 20;` at module scope.
- Before pushing a new `file_id`, check if `images.len() >= MAX_TRAIN_IMAGES`.
- If at cap, send a localized error message and return `Ok(())` without mutating state.

**Literature:** CWE-770. Training pipelines have a practical ceiling; enforcing it at the ingestion boundary prevents both abuse and accidental oversized submissions.

---

## Finding 3 — Missing empty-prompt validation in `text_to_image.rs` and `text_to_video.rs`
**Severity:** MEDIUM (CWE-20: Improper Input Validation)

Both handlers check `text.len() > 4000` but never reject empty or whitespace-only prompts. An empty prompt is forwarded to the AI provider, queued in the job system, and consumes generation credits for no output. This is a financial waste vector and pollutes the job queue with no-value work.

**Remediation:**
- In both `handle_text_to_image_msg` and `handle_text_to_video_msg`, add `if text.trim().is_empty()` immediately after the length check.
- Send a localized error: "❌ Empty prompt is not allowed."
- Return `Ok(())`.

**Literature:** CWE-20 — improper input validation. Empty/whitespace-only input should be rejected at the earliest chokepoint before any downstream resource allocation (provider quota, job queue slot, DB row).

---

## Implementation Order
1. `morphing.rs` — image cap guard
2. `train_flux_model.rs` — image cap guard
3. `text_to_image.rs` + `text_to_video.rs` — empty-prompt guard

## Verification Steps
- `CARGO_BUILD_TARGET=aarch64-apple-darwin cargo check -p trios-mb-scenes`
- `CARGO_BUILD_TARGET=aarch64-apple-darwin cargo test -p trios-mb-ai`

---

## Deferred Items
- `bot.get_me()` timeout wrapping in `instagram_scraping.rs` + `instagram_parser.rs` (#6 finding)
- Non-owned `update_generation_status` / `get_generation` used by webhook handlers (#8 finding)
- Hardcoded Replicate model digest (#9 finding)
- `database_url` as plain `String` in `config.rs` (#10 finding)
- Unbounded `InMemStorage` architectural migration to RedisStorage (#1 finding — requires schema/tooling change)

