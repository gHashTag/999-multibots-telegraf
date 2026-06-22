# Wave 206 Report — Distributed Tracing Coverage: AI Services, DB Repository, Job Queue

## Summary
Closed the three largest remaining observability blind spots in the monorepo by instrumenting 46 untraced async methods with `#[tracing::instrument(skip_all)]`. Compilation passes with zero warnings. No functional behavior was changed.

## Fixes Implemented

### Fix 1 — AI Service `generate` Methods (9 files)
**Crate:** `SILVER-RING-AI00`  
**Files:** `src/services/{face_swap,image_to_video,lip_sync,morphing,neuro_photo,text_to_image,text_to_video,tts,upscaler}.rs`

These methods form the bridge between Telegram scene handlers and the AI provider orchestrator. Prior to this wave they were completely absent from distributed traces, breaking latency attribution and making it impossible to determine whether a slow user response was caused by handler logic, balance deduction, orchestrator dispatch, or provider latency.

- Added `#[tracing::instrument(skip_all)]` before `pub async fn generate(...)` in each file.
- Total methods instrumented: **9**

### Fix 2 — DB Repository Async Methods (31 methods)
**Crate:** `SILVER-RING-DB00`  
**File:** `src/repository.rs`

The Postgres database adapter (`impl DbTrait for PostgresDatabase`) contained ~35 business-logic async methods with zero tracing spans. Because virtually every request path (handlers, providers, payments, webhooks) flows through these methods, their absence from traces rendered database latency invisible.

Instrumented methods:
- User CRUD: `get_user_by_telegram_id`, `create_user`, `update_user_language`, `update_user_gender`, `update_user_level`, `update_user_voice`, `update_user_model`
- Balance: `get_balance`, `deduct_balance`, `add_balance`
- Transactions: `create_transaction`, `get_transaction`, `get_transaction_by_external_id`, `update_transaction_status`, `get_transactions_by_telegram_id`
- Subscription: `check_subscription`, `renew_subscription`
- Prompts: `save_prompt`, `get_prompt`
- Generations: `create_generation`, `update_generation_status`, `get_generation`, `get_generation_owned`, `update_generation_status_owned`, `increment_generated_images`, `get_generated_images_count`
- Payments: `complete_robokassa_payment`
- Webhooks: `record_webhook_event`, `has_webhook_event`
- Health: `health_check`
- Referrals: `get_referral_count`

Total methods instrumented: **31**

### Fix 3 — JobQueue Implementation Methods (6 methods)
**Crate:** `SILVER-RING-JB00`  
**File:** `src/queue.rs`

Background job processing (`enqueue`, `dequeue`, `update_status`, `get`, `cancel`, `retry_stuck`) had no tracing coverage. Worker behavior, stuck-job recovery, and dequeue contention were entirely invisible in production traces.

- Added `#[tracing::instrument(skip_all)]` before each method in `impl JobQueue for PgJobQueue`.
- Total methods instrumented: **6**

## Compilation Verification
```
cargo check --target aarch64-apple-darwin
```
Result: **Finished `dev` profile [unoptimized + debuginfo] target(s) in 2.94s** — zero warnings, zero errors.

## Impact
- **Trace chain continuity:** Handlers → AI services → orchestrator → providers now form a continuous span tree instead of having gaps at the AI service layer.
- **DB latency visibility:** Every database operation now emits a span, enabling per-method latency histograms and slow-query alerts.
- **Background job observability:** Job queue operations are now traceable, allowing detection of stuck-job patterns and worker saturation.
- **No runtime risk:** Changes are purely additive instrumentation. No logic, control flow, or data handling was modified.

## Deferred Items (for future waves)
- Provider internal helper methods (e.g., `fal.rs` `queue_submission`, `check_queue_status`, `fetch_result`) lack individual spans, but they are nested within already-instrumented provider top-level methods.
- `start.rs` duplicate `#[tracing::instrument(skip_all)]` attribute on lines 12-13 (harmless cosmetic issue).

## Cooperation Variants for Wave 207

1. **Provider Internal Helper Instrumentation** — Add `tracing::instrument` to nested provider helpers (fal, hedra, kie, replicate) and fix the duplicate attribute in `start.rs`.
2. **Error-Span Enrichment** — Add structured `fields(...)` to existing spans so that critical identifiers (e.g., `telegram_id`, `generation_id`, `job_id`) are captured as span tags rather than only appearing in log messages.
3. **Metrics Export Wiring** — Connect `tracing` spans to Prometheus/OpenTelemetry metrics counters/histograms for automated SLO alerting on DB query duration, job queue depth, and AI generation latency.
