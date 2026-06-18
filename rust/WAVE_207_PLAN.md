# Wave 207 Plan — Tracing Cleanup and Deep Instrumentation

## Goal
Close remaining observability gaps by cleaning up a duplicate tracing attribute, instrumenting secret-store HTTP methods, and adding spans to provider internal helpers that make outbound API calls.

## Fixes (exactly 3)

### Fix 1 — Remove Duplicate `tracing::instrument` in `start.rs`
**File:** `rings/SILVER-RING-SN00/src/start.rs`
**Change:** Remove the duplicate `#[tracing::instrument(skip_all)]` on lines 12-13.
**Why:** Duplicate `#[tracing::instrument]` proc-macro attributes wrap the function body twice, creating nested spans on every invocation. This inflates span counts, distorts latency attribution, and produces noisy trace trees.

### Fix 2 — Secret Store Method Instrumentation
**File:** `rings/SILVER-RING-SC00/src/store.rs`
**Change:** Add `#[tracing::instrument(skip_all)]` to all 6 `async fn` methods on `InfisicalStore`:
- `authenticate`
- `load_secrets`
- `get`
- `get_all`
- `reload`
- `health_check`
**Why:** Secret store operations (authentication, secret fetching, cache reloads) are on the critical path for every handler that reads credentials. Their absence from traces creates unexplained latency gaps and makes it impossible to detect Infisical API degradation or cache misses.

### Fix 3 — Provider Internal Helper Instrumentation
**Files:** 4 provider implementation files
**Changes:** Add `#[tracing::instrument(skip_all)]` to internal helper methods that make HTTP calls:
- `fal.rs`: `queue_submission`, `check_queue_status`, `fetch_result`
- `hedra.rs`: `create_animation`, `fetch_animation_status`
- `kie.rs`: `send_request`, `check_task_status`
- `replicate.rs`: `create_prediction`, `fetch_prediction`
**Why:** These helpers are called from already-traced top-level methods (`generate`, `check_status`, `get_result`), but without their own spans the time spent in each individual HTTP call is invisible. This prevents fine-grained latency attribution for provider-specific slowness and makes it impossible to distinguish queue-submission latency from result-fetch latency within a single provider.

## Validation
- `cargo check --target aarch64-apple-darwin` must pass with zero warnings.
- No functional code changes; purely additive instrumentation plus one duplicate removal.
