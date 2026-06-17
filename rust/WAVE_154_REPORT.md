# Wave 154 Security Report — Panic Elimination & Stub Honesty

**Date:** 2026-06-17
**Scope:** trios-mb Rust monorepo
**Theme:** Eliminate panic paths, make provider cancellation stubs honest, harden webhook and state field handling

---

## Phase 1: Telegram Message Text Panic Elimination

**Problem:** 4 handlers in `SILVER-RING-SN00` called `msg.text().unwrap().to_string()` without checking if the message actually contains text. If a user sends a photo, sticker, or voice message while in these states, the bot panics.

**Files fixed:**
- `SILVER-RING-SN00/src/instagram_scraping.rs:24`
- `SILVER-RING-SN00/src/instagram_parser.rs:25`
- `SILVER-RING-SN00/src/neuro_coder.rs:27`
- `SILVER-RING-SN00/src/tech_support.rs:25`

**Fix:** Replaced `msg.text().unwrap()` with `match msg.text()` that returns a localized error message (`"❌ Send text message"` / `"❌ Отправьте текстовое сообщение"`) and exits cleanly.

**Impact:** 4 panic paths eliminated; bot no longer crashes on non-text input in these scenes.

---

## Phase 2: Provider Cancel Stub Honesty

**Problem:** 6 AI providers implemented `cancel()` as a silent no-op returning `Ok(())`. This misleads callers into believing resources were freed while upstream providers continue charging.

**Files fixed:**
- `SILVER-RING-AI00/src/providers/openai.rs`
- `SILVER-RING-AI00/src/providers/fal.rs`
- `SILVER-RING-AI00/src/providers/hedra.rs`
- `SILVER-RING-AI00/src/providers/kie.rs`
- `SILVER-RING-AI00/src/providers/elevenlabs.rs`
- `SILVER-RING-AI00/src/providers/heygen.rs`
- `SILVER-RING-AI00/src/providers/midjourney.rs`

**Fix:** Replaced `Ok(())` with a clear `AppError::Ai(AiError::Provider { provider: "...", message: "Cancellation not supported by provider" })`.

**Note:** `replicate.rs` was **not** changed because it already implements a real cancellation HTTP call.

**Impact:** Callers now receive an explicit error instead of a false success, enabling proper fallback logic and audit trails.

---

## Phase 3: Webhook Task ID Anti-Pattern

**Problem:** `kie_ai_webhook` in `BRONZE-RING-SRV/src/webhooks.rs:81` used `payload.task_id.as_deref().unwrap_or_default()`. An empty/missing task_id became an empty string, which then failed UUID parsing. While `parse_uuid` caught it, the pattern itself is an anti-pattern.

**File fixed:** `BRONZE-RING-SRV/src/webhooks.rs`

**Fix:** Replaced `unwrap_or_default()` with an explicit `match payload.task_id.as_deref()` that returns a `400 Bad Request` with `"missing task_id"` if the field is absent.

**Impact:** Missing task_id is now rejected with a clear HTTP 400 before reaching UUID parsing.

---

## Phase 4: Morphing / Flux Training State Guards

**Problem:** `morphing.rs` and `train_flux_model.rs` used `state.images.clone().unwrap_or_default()` at dispatch points. An empty images list could bypass the `images.len() >= N` guard in some callback paths and cause downstream failures.

**Files fixed:**
- `SILVER-RING-SN00/src/morphing.rs:166`
- `SILVER-RING-SN00/src/train_flux_model.rs:89`

**Fix:** Added explicit guards before dispatch that check `state.images` is `Some` and contains the minimum required images (≥2 for morphing, ≥4 for flux training). If not, the user is returned to the menu with a localized error message.

**Impact:** Prevents dispatching jobs with empty or insufficient image lists.

---

## Phase 5: file_id Sentinel Guard

**Problem:** 15 handlers extracted `file_id` from photos with `photos.last().map(|p| p.file.id.clone()).unwrap_or_default()`. An empty `file_id` string gets stored in state and passed to downstream providers, causing cryptic errors.

**Files fixed (15 occurrences across 14 files):**
- `SILVER-RING-SN00/src/image_to_video.rs`
- `SILVER-RING-SN00/src/flux_kontext.rs`
- `SILVER-RING-SN00/src/remove_bg.rs`
- `SILVER-RING-SN00/src/face_swap.rs` (2 occurrences)
- `SILVER-RING-SN00/src/avatar_transform.rs`
- `SILVER-RING-SN00/src/image_to_prompt.rs`
- `SILVER-RING-SN00/src/image_upscaler.rs`
- `SILVER-RING-SN00/src/hedra_render.rs`
- `SILVER-RING-SN00/src/neuro_photo.rs`
- `SILVER-RING-SN00/src/train_flux_model.rs`
- `SILVER-RING-SN00/src/ai_photoshop.rs`
- `SILVER-RING-SN00/src/digital_avatar_body.rs`
- `SILVER-RING-SN00/src/morphing.rs`

**Fix:** Replaced `unwrap_or_default()` with a `match photos.last()` that sends a localized error (`"❌ Could not retrieve image."` / `"❌ Не удалось получить изображение."`) and returns `Ok(())` if no photo is found.

**Impact:** 15 potential empty-file_id injection paths eliminated.

---

## Verification

```
cargo check --target aarch64-apple-darwin
# Finished dev profile [unoptimized + debuginfo] target(s) in 3.41s
```

No new `unwrap()` or `unwrap_or_default()` introduced on critical paths.

---

## Commit

```
feat: Wave 154 security hardening (rust)

- Eliminated 4 panic paths from msg.text().unwrap() in SN00 handlers
- Provider cancel stub honesty: 7 providers now return clear error instead of silent Ok(())
- Webhook task_id validation: removed unwrap_or_default anti-pattern
- State field guards in morphing and flux training (empty image list protection)
- file_id sentinel guard across 15 photo handlers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## Deferred / Next Wave Candidates

1. **Audio file_id guards:** Voice message handlers may have similar `unwrap_or_default()` on audio file IDs.
2. **Document file_id guards:** File upload handlers (PDF, etc.) should be audited.
3. **Provider cancel real implementation:** For providers that actually support cancellation (e.g., Fal, KIE), implement real HTTP cancel calls instead of the honest error.
4. **State machine validation:** Add `#[derive(Validate)]` on state structs to enforce invariants at deserialization time.

---

## Three Cooperation Options for Next Wave

| Option | Focus | Effort | Security Impact |
|--------|-------|--------|-----------------|
| **A. Audio & Document file_id guards** | Extend Phase 5 pattern to voice, document, and sticker handlers | Medium | High — prevents empty file_id injection across all media types |
| **B. Real provider cancellation** | Implement actual HTTP cancel for Fal, KIE, ElevenLabs where APIs support it | High | Medium — reduces cloud costs and improves UX |
| **C. State machine validation + serde guards** | Add `Validate` derives to all scene states; fail-closed on deserialization | Medium | High — defense-in-depth for state corruption |
