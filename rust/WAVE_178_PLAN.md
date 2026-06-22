# Wave 178 Plan

Date: 2026-06-16

## Research Summary

### Weaknesses identified

1. **Provider response structs missing `deny_unknown_fields` (HIGH)** — Provider response structs in `SILVER-RING-AI00/src/providers/*.rs` and `GOLD-RING-PR00/src/*.rs` lack `#[serde(deny_unknown_fields)]`. These structs deserialize HTTP JSON responses from external AI providers (OpenAI, Fal, Replicate, HeyGen, ElevenLabs, Hedra, Kie). Without the attribute, unknown fields are silently ignored, which could mask provider API changes, field-name typos, or data corruption. This is a systemic gap across 10+ files.

2. **`telegram_id` sentinel guard gaps in callback handlers (HIGH)** — 11 callback handlers in `SILVER-RING-SN00/src/*.rs` extract `q.from.id.0 as i64` without checking `<= 0`. A corrupted or synthetic callback query could pass invalid IDs to DB lookups and balance operations. The `handle_nav_callback` in `handlers.rs` was fixed in Wave 177, but individual scene callback handlers remain unprotected.

3. **Missing `tracing::instrument` on scene handlers (MEDIUM)** — Approximately 60+ `pub async fn handle_*` definitions across `SILVER-RING-SN00/src/*.rs` lack `#[tracing::instrument]`. This creates an observability blind spot in production for the entire bot layer.

### Literature

- **`deny_unknown_fields` defense** — OWASP Deserialization Cheat Sheet: "Use `deny_unknown_fields` on all inbound deserialization structs unless `flatten` is required. Unknown fields indicate either a schema mismatch or an injection attempt."
- **Sentinel value rejection** — CWE-20 (Improper Input Validation): "Reject sentinel and out-of-range identifiers at the earliest boundary before they reach the database or business logic."
- **Distributed tracing for async handlers** — OpenTelemetry best practices: "Every async request handler must carry `tracing::instrument` so spans propagate across await points."

## Selected Fixes (3 items)

### Fix 1: `deny_unknown_fields` on provider response structs
**Files:**
- `rings/SILVER-RING-AI00/src/providers/openai.rs` — `ChatMessage`, `ChatResponse`, `ChatChoice`, `ImageResponse`, `ImageData`
- `rings/SILVER-RING-AI00/src/providers/fal.rs` — `QueueResponse`, `StatusResponse`, `FalResultResponse`, `FalImage`
- `rings/SILVER-RING-AI00/src/providers/replicate.rs` — `PredictionResponse`, `PredictionUrls`
- `rings/SILVER-RING-AI00/src/providers/heygen.rs` — `HeyGenResponse`, `HeyGenData`, `VideoStatusResponse`, `VideoStatusData`, `AvatarListResponse`, `AvatarData`, `Avatar`
- `rings/SILVER-RING-AI00/src/providers/elevenlabs.rs` — `VoiceListResponse`, `Voice`, `AddVoiceResponse`, `UserResponse`, `UserSubscription`
- `rings/SILVER-RING-AI00/src/providers/hedra.rs` — `HedronResponse`, `HedraData`
- `rings/SILVER-RING-AI00/src/providers/kie.rs` — `KieTaskResponse`, `KieData`, `KieBalanceResponse`

Add `#[serde(deny_unknown_fields)]` to all structs that derive `Deserialize`.

### Fix 2: `telegram_id` sentinel guards in callback handlers
**Files:**
- `rings/SILVER-RING-SN00/src/generation_utils.rs` — `load_lang_cb` (central helper used by many callbacks)
- `rings/SILVER-RING-SN00/src/select_model.rs` — `handle_select_model_callback`
- `rings/SILVER-RING-SN00/src/text_to_image.rs` — `handle_text_to_image_callback`
- `rings/SILVER-RING-SN00/src/text_to_video.rs` — `handle_text_to_video_callback`
- `rings/SILVER-RING-SN00/src/neuro_photo.rs` — `handle_neuro_photo_callback`
- `rings/SILVER-RING-SN00/src/lip_sync.rs` — `handle_lip_sync_callback`
- `rings/SILVER-RING-SN00/src/morphing.rs` — `handle_morphing_callback`
- `rings/SILVER-RING-SN00/src/voice_training.rs` — `handle_voice_training_callback`
- `rings/SILVER-RING-SN00/src/ai_cover.rs` — `handle_ai_cover_callback`
- `rings/SILVER-RING-SN00/src/ai_reels.rs` — `handle_ai_reels_callback`
- `rings/SILVER-RING-SN00/src/music_generation.rs` — `handle_music_generation_callback`

Add `if tid <= 0 { tracing::warn!(...); return Ok(()); }` at the top of each callback handler before any DB call.

### Fix 3: `tracing::instrument` on key scene handlers
**Files:** 20 key scene handlers across `SILVER-RING-SN00/src/*.rs`

Add `#[tracing::instrument(skip_all)]` to the most critical handlers:
- `start.rs` — `handle_start`
- `payment.rs` — `handle_payment_msg`, `handle_payment_callback`
- `balance.rs` — `handle_balance`
- `neuro_photo.rs` — `handle_neuro_photo_msg`, `handle_neuro_photo_callback`
- `text_to_image.rs` — `handle_text_to_image_msg`, `handle_text_to_image_callback`
- `text_to_video.rs` — `handle_text_to_video_msg`, `handle_text_to_video_callback`
- `face_swap.rs` — `handle_face_swap_msg`, `handle_face_swap_callback`
- `morphing.rs` — `handle_morphing_msg`, `handle_morphing_callback`
- `image_to_video.rs` — `handle_image_to_video_msg`, `handle_image_to_video_callback`
- `train_flux_model.rs` — `handle_train_flux_model_msg`, `handle_train_flux_model_callback`

## Verification Steps

1. `cargo check -p trios-mb-ai` for provider struct changes.
2. `cargo check -p trios-mb-scenes` for handler changes.
3. `cargo check --workspace` for full compilation.
