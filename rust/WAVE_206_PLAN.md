# Wave 206 Plan — Distributed Tracing Coverage: AI Services, DB Repository, Job Queue

## Goal
Eliminate the three largest observability blind spots in the monorepo by adding `#[tracing::instrument(skip_all)]` spans to untraced async methods that sit on critical request paths.

## Fixes (exactly 3)

### Fix 1 — AI Service `generate` Methods (SILVER-RING-AI00)
**Files:** `src/services/*.rs` (9 files)
- `face_swap.rs`
- `image_to_video.rs`
- `lip_sync.rs`
- `morphing.rs`
- `neuro_photo.rs`
- `text_to_image.rs`
- `text_to_video.rs`
- `tts.rs`
- `upscaler.rs`

**Change:** Add `#[tracing::instrument(skip_all)]` before each `pub async fn generate(...)`.
**Why:** These methods bridge Telegram scene handlers to the AI orchestrator. Without spans, the trace chain breaks at the boundary between handler logic and provider dispatch, making latency attribution and failure root-cause analysis impossible.

### Fix 2 — DB Repository Async Methods (SILVER-RING-DB00)
**File:** `src/repository.rs`
**Change:** Add `#[tracing::instrument(skip_all)]` before all 31 business-logic `async fn` methods in `impl DbTrait for PostgresDatabase`.
**Scope:** `get_user_by_telegram_id`, `create_user`, `update_user_*`, `get_balance`, `deduct_balance`, `add_balance`, `create_transaction`, `get_transaction*`, `update_transaction_status`, `check_subscription`, `renew_subscription`, `save_prompt`, `get_prompt`, `increment_generated_images`, `get_generated_images_count`, `create_generation`, `update_generation_status`, `get_generation`, `get_referral_count`, `health_check`, `complete_robokassa_payment`, `get_generation_owned`, `update_generation_status_owned`, `record_webhook_event`, `has_webhook_event`.
**Why:** DB operations are invisible in traces. Every handler, provider, and payment flow depends on these methods. Adding spans enables query latency histograms, slow-query detection, and per-telegram_id operation tracking.

### Fix 3 — JobQueue Implementation Methods (SILVER-RING-JB00)
**File:** `src/queue.rs`
**Change:** Add `#[tracing::instrument(skip_all)]` before all 6 `async fn` methods in `impl JobQueue for PgJobQueue`.
**Scope:** `enqueue`, `dequeue`, `update_status`, `get`, `cancel`, `retry_stuck`.
**Why:** Background job processing is entirely absent from traces. Worker crashes, stuck-job retries, and dequeue contention cannot be observed without spans on the queue operations.

## Validation
- `cargo check --target aarch64-apple-darwin` must pass with zero warnings.
- No functional code changes; purely additive instrumentation.
