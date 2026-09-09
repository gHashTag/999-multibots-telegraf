<!-- GENERATED FILE — do not edit. Source: src/inngest_app/functions.manifest.json -->
<!-- Regenerate: bun run scripts/inngest/gen-functions-doc.ts -->

# Inngest functions

App id: `telegram-bot-client` · slug format: `${app.id}-${function.id}` · manifest v1

Served functions: **28** · code-only/unregistered: **14**

Every served function listens to its canonical event **and** its legacy event,
so existing senders keep working. New code must send the canonical name
(`INNGEST_EVENTS` in `src/inngest_app/client.ts`).

Live status: `GET /api/inngest/functions/status` (read-only, 30 s cache) or the
MCP tools `inngest_health`, `inngest_functions`, `inngest_failed_runs`.

## Served functions (control = spec+code)

| id | trigger | retries | onFailure | guard | side effects | file |
|---|---|---|---|---|---|---|
| `neuro-image-generate` | `neuro/image.generate` <br>legacy: `neuro/photo.generate` | 3 | admin-telegram | check-user | charges-balance, paid-api, messages-user, db-write | `generation/neuroImageGeneration.ts` |
| `reels-ai-generate` | `reels/ai.generate` <br>legacy: `ai-reels/generate` | 2 | admin-telegram | validate-input | paid-api, messages-user | `existing/generateAIReelsFunction.ts` |
| `reels-ai-callback` | `reels/ai.callback` <br>legacy: `ai-reels-callback` | 3 | admin-telegram | extract-job-id | paid-api, messages-user | `ai-reels-callback.ts` |
| `reels-loop-generate` | `reels/loop.generate` <br>legacy: `reels/generate-advanced-loop` | 2 | admin-telegram | min-images | paid-api, messages-user | `existing/generateAdvancedLoopingVideoFunction.ts` |
| `training-model-start` | `training/model.start` <br>legacy: `model/training.start` | 0 | admin-telegram | validate-steps | charges-balance, paid-api, messages-user, db-write | `existing/generateModelTrainingFunction.ts` |
| `training-model-v2-start` | `training/model-v2.start` <br>legacy: `model/training.v2.requested` | SDK default (4) | admin-telegram | check-user-exists | charges-balance, paid-api, messages-user, db-write | `training/modelTrainingV2.ts` |
| `training-model-complete` | `training/model.complete` <br>legacy: `model/training.completed` | 2 | admin-telegram | unknown | charges-balance, paid-api, messages-user, db-write | `existing/handleModelTrainingCompleted.ts` |
| `training-stuck-check` | cron `*/30 * * * *` (UTC) | SDK default (4) | admin-telegram | none | charges-balance, paid-api, messages-user, db-write | `training/checkStuckTrainings.ts` |
| `morph-images-generate` | `morph/images.generate` <br>legacy: `morph/images.requested` | 3 | admin-telegram | check-user-exists | charges-balance, paid-api, messages-user | `training/morphImages.ts` |
| `render-job-run` | `render/job.run` <br>legacy: `render` | 3 | admin-telegram | zod-schema | paid-api, external-webhook, db-write | `render/render.ts` |
| `render-avatar-video-run` | `render/avatar-video.run` <br>legacy: `render/avatar-video` | 3 | admin-telegram | zod-schema | paid-api, external-webhook, db-write | `render/renderAvatarVideo.ts` |
| `render-riddle-run` | `render/riddle.run` <br>legacy: `render-riddle` | 3 | admin-telegram | zod-schema | paid-api, external-webhook, db-write | `render/renderRiddle.ts` |
| `payment-ai-server-process` | `payment/ai-server.process` <br>legacy: `payment/process-ai-server` | 3 | admin-telegram | amount-match | db-write, messages-user | `payments/paymentProcessing.ts` |
| `broadcast-message-send` | `broadcast/message.send` <br>legacy: `broadcast/send-message` | 3 | admin-telegram | validate-input | messages-user | `broadcast/broadcastMessage.ts` |
| `instagram-reels-analyze` | `instagram/reels.analyze` <br>legacy: `instagram/analyze-reels` | SDK default (4) | admin-telegram | validate-input | paid-api, db-write | `content/analyzeCompetitorReels.ts` |
| `instagram-competitors-find` | `instagram/competitors.find` <br>legacy: `instagram/find-competitors` | SDK default (4) | admin-telegram | validate-input | paid-api, db-write | `content/findCompetitors.ts` |
| `instagram-top-content-extract` | `instagram/top-content.extract` <br>legacy: `instagram/extract-top` | SDK default (4) | log | zod-schema | db-write | `content/extractTopContent.ts` |
| `content-scripts-generate` | `content/scripts.generate` <br>legacy: `instagram/generate-scripts` | SDK default (4) | admin-telegram | zod-schema | paid-api, db-write | `content/generateContentScripts.ts` |
| `content-detailed-script-generate` | `content/detailed-script.generate` <br>legacy: `content/generate-detailed-script` | SDK default (4) | admin-telegram | zod-schema | paid-api, db-write | `content/generateDetailedScript.ts` |
| `content-scenario-clips-generate` | `content/scenario-clips.generate` <br>legacy: `content/generate-scenario-clips` | SDK default (4) | admin-telegram | zod-schema | paid-api, db-write | `content/generateScenarioClips.ts` |
| `monitoring-error-report` | `monitoring/error.report` <br>legacy: `app/error.critical` | 1 | admin-telegram | none | paid-api, messages-admin | `monitoring/criticalErrorMonitor.ts` |
| `monitoring-health-check` | cron `*/30 * * * *` (UTC) | 2 | log | none | messages-admin | `monitoring/criticalErrorMonitor.ts` |
| `monitoring-logs-analyze` | cron `0 10 * * *` (UTC) | 2 | admin-telegram | none | messages-admin | `monitoring/logMonitor.ts` |
| `monitoring-logs-trigger` | `monitoring/logs.trigger` <br>legacy: `logs/monitor.trigger` | 1 | admin-telegram | none | messages-admin | `monitoring/logMonitor.ts` |
| `analytics-sales-advise` | cron `0 9 * * *` (UTC) | 1 | admin-telegram | none | messages-owners, messages-admin | `analytics/dailySalesAdvisor.ts` |
| `analytics-skills-detect` | cron `0 10 * * *` (UTC) | 1 | log | none | messages-admin, db-write | `analytics/skillDetector.ts` |
| `webhook-generation-validate` | `webhook/generation.validate` <br>legacy: `video/generation-validate-webhook` | 1 | admin-telegram | unknown | db-write | `webhookHealthGuard.ts` |
| `welcome-avatar-generate` | `welcome/avatar.generate` <br>legacy: `user/welcome.avatar.generate` | 2 | admin-telegram | unknown | paid-api, messages-user | `welcomeAvatarGeneration.ts` |

## Code-only / unregistered (never served)

| id | file | why |
|---|---|---|
| `test-simple` | `__dev__/testSimpleFunction.ts` | demo function; moved to functions/__dev__; served only by dev/test apps (prod-app.ts, test-app.ts) |
| `test-simple-message` | `__dev__/testSimpleMessageFunction.ts` | demo function; moved to functions/__dev__; served only by dev/test apps |
| `test-advanced-loop` | `__dev__/testAdvancedLoopFunction.ts` | demo function; moved to functions/__dev__; served only by dev/test apps |
| `kie-ai-webhook-manual-check` | `kieAiWebhookMonitor.ts` | KieAI webhook monitor never wired into registerFunctions |
| `voice-training-start` | `training/voiceTrainingRVC.ts` | RVC voice training never wired; charges balance — must not be registered silently |
| `voice-training-completed` | `training/voiceTrainingRVC.ts` | RVC voice training completion never wired |
| `webhook-health-check` | `webhookHealthGuard.ts` | not exported from registerFunctions; only validateWebhookBeforeGeneration is served |
| `periodic-webhook-health-check` | `webhookHealthGuard.ts` | cron 0 * * * *; not served |
| `morph-images` | `morphImages.ts` | duplicate of training/morphImages.ts (served copy is morph-images-generate) |
| `neuro-image-generation` | `neuroImageGeneration.ts` | duplicate of generation/neuroImageGeneration.ts (served copy is neuro-image-generate) |
| `model-training` | `training/generateModelTraining.ts` | duplicate/legacy of existing/generateModelTrainingFunction.ts (served copy is training-model-start) |
| `instagram-scraper-v2` | `instagram/instagramScraper-v2.ts` | import commented out in registerFunctions (broken imports) |
| `create-instagram-user` | `instagram/instagramScraper-v2.ts` | import commented out in registerFunctions |
| `instagram-reels-test` | `instagram/instagramScraper-v2-simple.ts` | import commented out in registerFunctions |

## Function cards

### neuro-image-generate

- **Slug:** `telegram-bot-client-neuro-image-generate`
- **Legacy id:** `neuro-image-generation`
- **Control:** `spec+code`
- **Domain:** neuro
- **Trigger:** `neuro/image.generate`; legacy: `neuro/photo.generate`
- **Source:** `src/inngest_app/functions/generation/neuroImageGeneration.ts` → `neuroImageGeneration`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** check-user
- **Side effects:** `charges-balance`, `paid-api`, `messages-user`, `db-write`
- **Steps:** `get-bot` → `check-user` → `get-user-gender` → `update-level` → `calculate-total-cost` → `process-payment` → `get-aspect-ratio` → `generate-image-${i}` → `notify-image-${i}` → `final-notification`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - file corrected: 'src/inngest_app/functions/neuroImageGeneration.ts' -> 'src/inngest_app/functions/generation/neuroImageGeneration.ts'
  - steps re-extracted from code: ['get-bot', 'check-user', 'get-user-gender', 'update-level', 'calculate-total-cost', 'process-payment', 'get-aspect-ratio', 'generate-image-${i}', 'notify-image-${i}', 'deduct-balance-final', 'final-notification'] -> ['get-bot', 'check-user', 'get-user-gender', 'update-level', 'calculate-total-cost', 'process-payment', 'get-aspect-ratio', 'generate-image-${i}', 'notify-image-${i}', 'final-notification']

### reels-ai-generate

- **Slug:** `telegram-bot-client-reels-ai-generate`
- **Legacy id:** `ai-reels-generation`
- **Control:** `spec+code`
- **Domain:** reels
- **Trigger:** `reels/ai.generate`; legacy: `ai-reels/generate`
- **Source:** `src/inngest_app/functions/existing/generateAIReelsFunction.ts` → `generateAIReelsFunction`
- **Retries:** 2
- **onFailure:** admin-telegram
- **Guard:** validate-input
- **Side effects:** `paid-api`, `messages-user`
- **Steps:** `validate-input` → `generate-lipsync-video` → `generate-wan25-video` → `merge-videos` → `notify-telegram`
- **Probe 2026-09-09:** safe=no, result=skipped, deployed=yes
- **Notes:**
  - steps re-extracted from code: ['generate-lipsync-video', 'generate-wan25-video', 'merge-videos', 'notify-telegram'] -> ['validate-input', 'generate-lipsync-video', 'generate-wan25-video', 'merge-videos', 'notify-telegram']
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)
  - guard: none -> validate-input (step added in this PR)

### reels-ai-callback

- **Slug:** `telegram-bot-client-reels-ai-callback`
- **Legacy id:** `ai-reels-callback`
- **Control:** `spec+code`
- **Domain:** reels
- **Trigger:** `reels/ai.callback`; legacy: `ai-reels-callback`
- **Source:** `src/inngest_app/functions/ai-reels-callback.ts` → `aiReelsCallbackFunction`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** extract-job-id
- **Side effects:** `paid-api`, `messages-user`
- **Steps:** `send-completed-video` → `send-failed-message` → `send-processing-update`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes

### reels-loop-generate

- **Slug:** `telegram-bot-client-reels-loop-generate`
- **Legacy id:** `generate-advanced-looping-video`
- **Control:** `spec+code`
- **Domain:** reels
- **Trigger:** `reels/loop.generate`; legacy: `reels/generate-advanced-loop`
- **Source:** `src/inngest_app/functions/existing/generateAdvancedLoopingVideoFunction.ts` → `generateAdvancedLoopingVideoFunction`
- **Retries:** 2
- **onFailure:** admin-telegram
- **Guard:** min-images
- **Side effects:** `paid-api`, `messages-user`
- **Steps:** `generate-morphing-clips` → `download-video-clips` → `combine-video-clips` → `add-music` → `send-to-telegram` → `send-to-pulse` → `cleanup`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### training-model-start

- **Slug:** `telegram-bot-client-training-model-start`
- **Legacy id:** `generate-model-training`
- **Control:** `spec+code`
- **Domain:** training
- **Trigger:** `training/model.start`; legacy: `model/training.start`
- **Source:** `src/inngest_app/functions/existing/generateModelTrainingFunction.ts` → `generateModelTrainingFunction`
- **Retries:** 0
- **onFailure:** admin-telegram
- **Guard:** validate-steps
- **Side effects:** `charges-balance`, `paid-api`, `messages-user`, `db-write`
- **Steps:** `validate-credentials` → `check-duplicates` → `validate-zip-url` → `create-replicate-model` → `save-pending-record` → `create-replicate-training` → `update-training-record` → `notify-user-started`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### training-model-v2-start

- **Slug:** `telegram-bot-client-training-model-v2-start`
- **Legacy id:** `model-training-v2`
- **Control:** `spec+code`
- **Domain:** training
- **Trigger:** `training/model-v2.start`; legacy: `model/training.v2.requested`
- **Source:** `src/inngest_app/functions/training/modelTrainingV2.ts` → `modelTrainingV2`
- **Retries:** SDK default (4)
- **onFailure:** admin-telegram
- **Guard:** check-user-exists
- **Side effects:** `charges-balance`, `paid-api`, `messages-user`, `db-write`
- **Steps:** `check-user-exists` → `update-user-level` → `get-bot` → `check-balance` → `encode-zip` → `create-training` → `save-training-to-db` → `notify-user` → `deduct-balance` → `refund-balance` → `handle-error`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - file corrected: '(empty)' -> 'src/inngest_app/functions/training/modelTrainingV2.ts'
  - steps re-extracted from code: [] -> ['check-user-exists', 'update-user-level', 'get-bot', 'check-balance', 'encode-zip', 'create-training', 'save-training-to-db', 'notify-user', 'deduct-balance', 'refund-balance', 'handle-error']
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### training-model-complete

- **Slug:** `telegram-bot-client-training-model-complete`
- **Legacy id:** `handle-model-training-completed`
- **Control:** `spec+code`
- **Domain:** training
- **Trigger:** `training/model.complete`; legacy: `model/training.completed`
- **Source:** `src/inngest_app/functions/existing/handleModelTrainingCompleted.ts` → `createHandleModelTrainingCompletedFunction(inngestFnClient)`
- **Retries:** 2
- **onFailure:** admin-telegram
- **Guard:** unknown
- **Side effects:** `charges-balance`, `paid-api`, `messages-user`, `db-write`
- **Steps:** `find-training-record` → `update-training-status` → `send-telegram-notification`
- **Probe 2026-09-09:** safe=no, result=not-deployed, deployed=no

### training-stuck-check

- **Slug:** `telegram-bot-client-training-stuck-check`
- **Legacy id:** `check-stuck-trainings`
- **Control:** `spec+code`
- **Domain:** training
- **Trigger:** cron `*/30 * * * *` (UTC)
- **Source:** `src/inngest_app/functions/training/checkStuckTrainings.ts` → `checkStuckTrainings`
- **Retries:** SDK default (4)
- **onFailure:** admin-telegram
- **Guard:** none
- **Side effects:** `charges-balance`, `paid-api`, `messages-user`, `db-write`
- **Steps:** `find-stuck-trainings` → `check-replicate-status` → `send-completion-events`
- **Probe 2026-09-09:** safe=no, result=not-deployed, deployed=no
- **Notes:**
  - safe mode: send-completion-events is skipped (fan-out to training-model-complete would message users)

### morph-images-generate

- **Slug:** `telegram-bot-client-morph-images-generate`
- **Legacy id:** `morph-images`
- **Control:** `spec+code`
- **Domain:** morph
- **Trigger:** `morph/images.generate`; legacy: `morph/images.requested`
- **Source:** `src/inngest_app/functions/training/morphImages.ts` → `morphImages`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** check-user-exists
- **Side effects:** `charges-balance`, `paid-api`, `messages-user`
- **Steps:** `check-user-exists` → `check-balance` → `notify-start` → `process-all-pairs` → `process-loop-pair` → `concatenate-all-videos` → `cleanup-temp-files` → `deliver-result`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### render-job-run

- **Slug:** `telegram-bot-client-render-job-run`
- **Legacy id:** `render`
- **Control:** `spec+code`
- **Domain:** render
- **Trigger:** `render/job.run`; legacy: `render`
- **Source:** `src/inngest_app/functions/render/render.ts` → `renderFunction`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** zod-schema
- **Side effects:** `paid-api`, `external-webhook`, `db-write`
- **Steps:** `create-job-folder` → `download-files` → `render` → `upload-to-s3` → `callback`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes

### render-avatar-video-run

- **Slug:** `telegram-bot-client-render-avatar-video-run`
- **Legacy id:** `render-avatar-video`
- **Control:** `spec+code`
- **Domain:** render
- **Trigger:** `render/avatar-video.run`; legacy: `render/avatar-video`
- **Source:** `src/inngest_app/functions/render/renderAvatarVideo.ts` → `renderAvatarVideoFunction`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** zod-schema
- **Side effects:** `paid-api`, `external-webhook`, `db-write`
- **Steps:** `create-job` → `generate-speech-audio` → `start-hedra-generation` → `wait-hedra-completion` → `start-heygen-generation` → `wait-heygen-completion` → `generate-transcription` → `generate-broll-prompts` → `generate-brolls-parallel` → `wait-brolls-completion` → `create-job-settings` → `upload-settings-to-s3` → `trigger-render`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes

### render-riddle-run

- **Slug:** `telegram-bot-client-render-riddle-run`
- **Legacy id:** `render-riddle`
- **Control:** `spec+code`
- **Domain:** render
- **Trigger:** `render/riddle.run`; legacy: `render-riddle`
- **Source:** `src/inngest_app/functions/render/renderRiddle.ts` → `renderRiddleFunction`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** zod-schema
- **Side effects:** `paid-api`, `external-webhook`, `db-write`
- **Steps:** `preflight-render-capacity` → `load-template-json` → `create-job` → `generate-speech-audio` → `start-avatar-generation` → `wait-avatar-completion` → `extract-avatar-speech-url` → `generate-transcription` → `generate-broll-prompts` → `generate-broll-${index}` → `wait-broll-${index}` → `prepare-template-json` → `trigger-render`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - steps re-extracted from code: ['preflight-render-capacity', 'load-template-json', 'create-job', 'generate-speech-audio', 'start-avatar-generation', 'wait-avatar-completion', 'start-avatar-generation', 'wait-avatar-completion', 'extract-avatar-speech-url', 'generate-transcription', 'generate-broll-prompts', 'generate-broll-${index}', 'wait-broll-${index}', 'prepare-template-json', 'trigger-render'] -> ['preflight-render-capacity', 'load-template-json', 'create-job', 'generate-speech-audio', 'start-avatar-generation', 'wait-avatar-completion', 'extract-avatar-speech-url', 'generate-transcription', 'generate-broll-prompts', 'generate-broll-${index}', 'wait-broll-${index}', 'prepare-template-json', 'trigger-render']
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### payment-ai-server-process

- **Slug:** `telegram-bot-client-payment-ai-server-process`
- **Legacy id:** `payment-processing-ai-server`
- **Control:** `spec+code`
- **Domain:** payment
- **Trigger:** `payment/ai-server.process`; legacy: `payment/process-ai-server`
- **Source:** `src/inngest_app/functions/payments/paymentProcessing.ts` → `processPayment`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** amount-match
- **Side effects:** `db-write`, `messages-user`
- **Steps:** `check-subscription-plan` → `check-payment-option` → `get-user-info` → `get-bot-config` → `update-user-balance` → `send-notification`
- **Probe 2026-09-09:** safe=yes, result=COMPLETED, deployed=yes
- **Notes:**
  - file corrected: '(empty)' -> 'src/inngest_app/functions/payments/paymentProcessing.ts'
  - steps re-extracted from code: [] -> ['check-subscription-plan', 'check-payment-option', 'get-user-info', 'get-bot-config', 'update-user-balance', 'send-notification']
  - retries: None -> 3 (null = SDK default)
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### broadcast-message-send

- **Slug:** `telegram-bot-client-broadcast-message-send`
- **Legacy id:** `broadcast-message`
- **Control:** `spec+code`
- **Domain:** broadcast
- **Trigger:** `broadcast/message.send`; legacy: `broadcast/send-message`
- **Source:** `src/inngest_app/functions/broadcast/broadcastMessage.ts` → `broadcastMessage`
- **Retries:** 3
- **onFailure:** admin-telegram
- **Guard:** validate-input
- **Side effects:** `messages-user`
- **Steps:** `validate-input` → `check-permissions` → `fetch-users` → `send-messages` → `analyze-results`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - file corrected: '(empty)' -> 'src/inngest_app/functions/broadcast/broadcastMessage.ts'
  - steps re-extracted from code: [] -> ['validate-input', 'check-permissions', 'fetch-users', 'send-messages', 'analyze-results']
  - retries: None -> 3 (null = SDK default)
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### instagram-reels-analyze

- **Slug:** `telegram-bot-client-instagram-reels-analyze`
- **Legacy id:** `analyze-competitor-reels`
- **Control:** `spec+code`
- **Domain:** instagram
- **Trigger:** `instagram/reels.analyze`; legacy: `instagram/analyze-reels`
- **Source:** `src/inngest_app/functions/content/analyzeCompetitorReels.ts` → `analyzeCompetitorReels`
- **Retries:** SDK default (4)
- **onFailure:** admin-telegram
- **Guard:** validate-input
- **Side effects:** `paid-api`, `db-write`
- **Steps:** `validate-input` → `validate-project` → `call-instagram-reels-api` → `filter-reels-by-date` → `calculate-metrics` → `save-to-reels-analysis-table` → `send-telegram-notification`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### instagram-competitors-find

- **Slug:** `telegram-bot-client-instagram-competitors-find`
- **Legacy id:** `find-competitors`
- **Control:** `spec+code`
- **Domain:** instagram
- **Trigger:** `instagram/competitors.find`; legacy: `instagram/find-competitors`
- **Source:** `src/inngest_app/functions/content/findCompetitors.ts` → `findCompetitors`
- **Retries:** SDK default (4)
- **onFailure:** admin-telegram
- **Guard:** validate-input
- **Side effects:** `paid-api`, `db-write`
- **Steps:** `validate-input` → `validate-project` → `call-instagram-api` → `filter-by-followers` → `save-to-competitors-table` → `send-telegram-notification`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### instagram-top-content-extract

- **Slug:** `telegram-bot-client-instagram-top-content-extract`
- **Legacy id:** `extract-top-content`
- **Control:** `spec+code`
- **Domain:** instagram
- **Trigger:** `instagram/top-content.extract`; legacy: `instagram/extract-top`
- **Source:** `src/inngest_app/functions/content/extractTopContent.ts` → `extractTopContent`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** zod-schema
- **Side effects:** `db-write`
- **Steps:** `query-top-reels` → `process-reels` → `format-report`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - side_effects corrected: ['paid-api','db-write'] -> ['db-write'] (function only queries reels_analysis; no external API)

### content-scripts-generate

- **Slug:** `telegram-bot-client-content-scripts-generate`
- **Legacy id:** `generate-content-scripts`
- **Control:** `spec+code`
- **Domain:** content
- **Trigger:** `content/scripts.generate`; legacy: `instagram/generate-scripts`
- **Source:** `src/inngest_app/functions/content/generateContentScripts.ts` → `generateContentScripts`
- **Retries:** SDK default (4)
- **onFailure:** admin-telegram
- **Guard:** zod-schema
- **Side effects:** `paid-api`, `db-write`
- **Steps:** `get-reel-data` → `extract-audio` → `transcribe-audio` → `generate-scripts` → `save-scripts`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### content-detailed-script-generate

- **Slug:** `telegram-bot-client-content-detailed-script-generate`
- **Legacy id:** `generate-detailed-script`
- **Control:** `spec+code`
- **Domain:** content
- **Trigger:** `content/detailed-script.generate`; legacy: `content/generate-detailed-script`
- **Source:** `src/inngest_app/functions/content/generateDetailedScript.ts` → `generateDetailedScript`
- **Retries:** SDK default (4)
- **onFailure:** admin-telegram
- **Guard:** zod-schema
- **Side effects:** `paid-api`, `db-write`
- **Steps:** `create-script-record` → `generate-detailed-scenes` → `save-detailed-script`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### content-scenario-clips-generate

- **Slug:** `telegram-bot-client-content-scenario-clips-generate`
- **Legacy id:** `generate-scenario-clips`
- **Control:** `spec+code`
- **Domain:** content
- **Trigger:** `content/scenario-clips.generate`; legacy: `content/generate-scenario-clips`
- **Source:** `src/inngest_app/functions/content/generateScenarioClips.ts` → `generateScenarioClips`
- **Retries:** SDK default (4)
- **onFailure:** admin-telegram
- **Guard:** zod-schema
- **Side effects:** `paid-api`, `db-write`
- **Steps:** `create-scenario-record` → `generate-detailed-scenes` → `create-text-reports-archive` → `update-scenario-record`
- **Probe 2026-09-09:** safe=yes, result=FAILED-at-guard, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### monitoring-error-report

- **Slug:** `telegram-bot-client-monitoring-error-report`
- **Legacy id:** `critical-error-monitor`
- **Control:** `spec+code`
- **Domain:** monitoring
- **Trigger:** `monitoring/error.report`; legacy: `app/error.critical`
- **Source:** `src/inngest_app/functions/monitoring/criticalErrorMonitor.ts` → `criticalErrorMonitor`
- **Retries:** 1
- **onFailure:** admin-telegram
- **Guard:** none
- **Side effects:** `paid-api`, `messages-admin`
- **Steps:** `analyze-error` → `format-message` → `send-notification` → `log-for-analysis`
- **Probe 2026-09-09:** safe=yes, result=COMPLETED, deployed=yes
- **Notes:**
  - side_effects: added paid-api (OpenAI analyze-error step); on_failure: log -> admin-telegram (onFailure handler added in this PR)

### monitoring-health-check

- **Slug:** `telegram-bot-client-monitoring-health-check`
- **Legacy id:** `health-check`
- **Control:** `spec+code`
- **Domain:** monitoring
- **Trigger:** cron `*/30 * * * *` (UTC)
- **Source:** `src/inngest_app/functions/monitoring/criticalErrorMonitor.ts` → `healthCheck`
- **Retries:** 2
- **onFailure:** log
- **Guard:** none
- **Side effects:** `messages-admin`
- **Steps:** `check-api-health` → `check-inngest-health` → `notify-unhealthy`
- **Probe 2026-09-09:** safe=yes, result=COMPLETED, deployed=yes

### monitoring-logs-analyze

- **Slug:** `telegram-bot-client-monitoring-logs-analyze`
- **Legacy id:** `log-monitor`
- **Control:** `spec+code`
- **Domain:** monitoring
- **Trigger:** cron `0 10 * * *` (UTC)
- **Source:** `src/inngest_app/functions/monitoring/logMonitor.ts` → `logMonitor`
- **Retries:** 2
- **onFailure:** admin-telegram
- **Guard:** none
- **Side effects:** `messages-admin`
- **Steps:** `read-logs` → `summarize-inngest-runs` → `analyze-logs` → `generate-message` → `send-notification`
- **Probe 2026-09-09:** safe=yes, result=COMPLETED, deployed=yes
- **Notes:**
  - steps re-extracted from code: ['read-logs', 'analyze-logs', 'generate-message', 'send-notification'] -> ['read-logs', 'summarize-inngest-runs', 'analyze-logs', 'generate-message', 'send-notification']
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### monitoring-logs-trigger

- **Slug:** `telegram-bot-client-monitoring-logs-trigger`
- **Legacy id:** `trigger-log-monitor`
- **Control:** `spec+code`
- **Domain:** monitoring
- **Trigger:** `monitoring/logs.trigger`; legacy: `logs/monitor.trigger`
- **Source:** `src/inngest_app/functions/monitoring/logMonitor.ts` → `triggerLogMonitor`
- **Retries:** 1
- **onFailure:** admin-telegram
- **Guard:** none
- **Side effects:** `messages-admin`
- **Steps:** `read-logs` → `summarize-inngest-runs` → `analyze-logs` → `generate-message` → `send-notification`
- **Probe 2026-09-09:** safe=yes, result=COMPLETED, deployed=yes
- **Notes:**
  - steps re-extracted from code: ['read-logs', 'analyze-logs', 'generate-message', 'send-notification'] -> ['read-logs', 'summarize-inngest-runs', 'analyze-logs', 'generate-message', 'send-notification']
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### analytics-sales-advise

- **Slug:** `telegram-bot-client-analytics-sales-advise`
- **Legacy id:** `daily-sales-advisor`
- **Control:** `spec+code`
- **Domain:** analytics
- **Trigger:** cron `0 9 * * *` (UTC)
- **Source:** `src/inngest_app/functions/analytics/dailySalesAdvisor.ts` → `dailySalesAdvisor`
- **Retries:** 1
- **onFailure:** admin-telegram
- **Guard:** none
- **Side effects:** `messages-owners`, `messages-admin`
- **Steps:** `load-owners` → `load-payments-7d` → `load-payments-1d` → `load-payments-2d` → `report-${ownerId}`
- **Probe 2026-09-09:** safe=yes, result=COMPLETED, deployed=yes
- **Notes:**
  - on_failure: log -> admin-telegram (onFailure handler added in this PR)

### analytics-skills-detect

- **Slug:** `telegram-bot-client-analytics-skills-detect`
- **Legacy id:** `skill-detector`
- **Control:** `spec+code`
- **Domain:** analytics
- **Trigger:** cron `0 10 * * *` (UTC)
- **Source:** `src/inngest_app/functions/analytics/skillDetector.ts` → `skillDetector`
- **Retries:** 1
- **onFailure:** log
- **Guard:** none
- **Side effects:** `messages-admin`, `db-write`
- **Steps:** `load-existing-skills` → `detect-${serviceType}` → `notify-admin`
- **Probe 2026-09-09:** safe=yes, result=COMPLETED, deployed=yes
- **Notes:**
  - side_effects corrected: ['messages-owners','messages-admin'] -> ['messages-admin','db-write'] (only notify-admin to ADMIN_TELEGRAM_ID; writes skills table)

### webhook-generation-validate

- **Slug:** `telegram-bot-client-webhook-generation-validate`
- **Legacy id:** `validate-webhook-before-generation`
- **Control:** `spec+code`
- **Domain:** webhook
- **Trigger:** `webhook/generation.validate`; legacy: `video/generation-validate-webhook`
- **Source:** `src/inngest_app/functions/webhookHealthGuard.ts` → `validateWebhookBeforeGeneration`
- **Retries:** 1
- **onFailure:** admin-telegram
- **Guard:** unknown
- **Side effects:** `db-write`
- **Steps:** `check-webhook-availability`
- **Probe 2026-09-09:** safe=no, result=not-deployed, deployed=no

### welcome-avatar-generate

- **Slug:** `telegram-bot-client-welcome-avatar-generate`
- **Legacy id:** `welcome-avatar-generation`
- **Control:** `spec+code`
- **Domain:** welcome
- **Trigger:** `welcome/avatar.generate`; legacy: `user/welcome.avatar.generate`
- **Source:** `src/inngest_app/functions/welcomeAvatarGeneration.ts` → `welcomeAvatarGeneration`
- **Retries:** 2
- **onFailure:** admin-telegram
- **Guard:** unknown
- **Side effects:** `paid-api`, `messages-user`
- **Steps:** `validate-bot` → `select-hero` → `reserve-gift-slot` → `generate-image` → `send-welcome`
- **Probe 2026-09-09:** safe=no, result=not-deployed, deployed=no

## Unregistered cards

### test-simple

- **Slug:** `telegram-bot-client-test-simple`
- **Control:** `code-only/unregistered`
- **Domain:** test
- **Trigger:** `test/simple`
- **Source:** `src/inngest_app/functions/__dev__/testSimpleFunction.ts` → `testSimpleFunction`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - demo function; moved to functions/__dev__; served only by dev/test apps (prod-app.ts, test-app.ts)

### test-simple-message

- **Slug:** `telegram-bot-client-test-simple-message`
- **Control:** `code-only/unregistered`
- **Domain:** test
- **Trigger:** `test/simple-message`
- **Source:** `src/inngest_app/functions/__dev__/testSimpleMessageFunction.ts` → `testSimpleMessageFunction`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - demo function; moved to functions/__dev__; served only by dev/test apps

### test-advanced-loop

- **Slug:** `telegram-bot-client-test-advanced-loop`
- **Control:** `code-only/unregistered`
- **Domain:** test
- **Trigger:** `test/advanced-loop`
- **Source:** `src/inngest_app/functions/__dev__/testAdvancedLoopFunction.ts` → `testAdvancedLoopFunction`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - demo function; moved to functions/__dev__; served only by dev/test apps

### kie-ai-webhook-manual-check

- **Slug:** `telegram-bot-client-kie-ai-webhook-manual-check`
- **Control:** `code-only/unregistered`
- **Domain:** kie
- **Trigger:** `kie-ai/webhook-check-manual`
- **Source:** `src/inngest_app/functions/kieAiWebhookMonitor.ts` → `kieAiWebhookMonitor`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - KieAI webhook monitor never wired into registerFunctions

### voice-training-start

- **Slug:** `telegram-bot-client-voice-training-start`
- **Control:** `code-only/unregistered`
- **Domain:** voice
- **Trigger:** `voice/training.start`
- **Source:** `src/inngest_app/functions/training/voiceTrainingRVC.ts` → `voiceTrainingStart`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - RVC voice training never wired; charges balance — must not be registered silently

### voice-training-completed

- **Slug:** `telegram-bot-client-voice-training-completed`
- **Control:** `code-only/unregistered`
- **Domain:** voice
- **Trigger:** `voice/training.completed`
- **Source:** `src/inngest_app/functions/training/voiceTrainingRVC.ts` → `voiceTrainingCompleted`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - RVC voice training completion never wired

### webhook-health-check

- **Slug:** `telegram-bot-client-webhook-health-check`
- **Control:** `code-only/unregistered`
- **Domain:** webhook
- **Trigger:** `webhook/health-check-requested`
- **Source:** `src/inngest_app/functions/webhookHealthGuard.ts` → `webhookHealthCheck`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - not exported from registerFunctions; only validateWebhookBeforeGeneration is served

### periodic-webhook-health-check

- **Slug:** `telegram-bot-client-periodic-webhook-health-check`
- **Control:** `code-only/unregistered`
- **Domain:** periodic
- **Trigger:** cron `0 * * * *` (UTC)
- **Source:** `src/inngest_app/functions/webhookHealthGuard.ts` → `periodicWebhookHealthCheck`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - cron 0 * * * *; not served

### morph-images

- **Slug:** `telegram-bot-client-morph-images`
- **Control:** `code-only/unregistered`
- **Domain:** morph
- **Trigger:** `morph/images.requested`
- **Source:** `src/inngest_app/functions/morphImages.ts` → `morphImages`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - duplicate of training/morphImages.ts (served copy is morph-images-generate)

### neuro-image-generation

- **Slug:** `telegram-bot-client-neuro-image-generation`
- **Control:** `code-only/unregistered`
- **Domain:** neuro
- **Trigger:** `neuro/photo.generate`
- **Source:** `src/inngest_app/functions/neuroImageGeneration.ts` → `neuroImageGeneration`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - duplicate of generation/neuroImageGeneration.ts (served copy is neuro-image-generate)

### model-training

- **Slug:** `telegram-bot-client-model-training`
- **Control:** `code-only/unregistered`
- **Domain:** model
- **Trigger:** `model/training.start`
- **Source:** `src/inngest_app/functions/training/generateModelTraining.ts` → `generateModelTraining`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - duplicate/legacy of existing/generateModelTrainingFunction.ts (served copy is training-model-start)

### instagram-scraper-v2

- **Slug:** `telegram-bot-client-instagram-scraper-v2`
- **Control:** `code-only/unregistered`
- **Domain:** instagram
- **Trigger:** `instagram/scraper-v2`
- **Source:** `src/inngest_app/functions/instagram/instagramScraper-v2.ts` → `instagramScraperV2`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - import commented out in registerFunctions (broken imports)

### create-instagram-user

- **Slug:** `telegram-bot-client-create-instagram-user`
- **Control:** `code-only/unregistered`
- **Domain:** create
- **Trigger:** `instagram/create-user`
- **Source:** `src/inngest_app/functions/instagram/instagramScraper-v2.ts` → `createInstagramUser`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - import commented out in registerFunctions

### instagram-reels-test

- **Slug:** `telegram-bot-client-instagram-reels-test`
- **Control:** `code-only/unregistered`
- **Domain:** instagram
- **Trigger:** `instagram/test-reels`
- **Source:** `src/inngest_app/functions/instagram/instagramScraper-v2-simple.ts` → `instagramReelsTest`
- **Retries:** SDK default (4)
- **onFailure:** log
- **Guard:** none
- **Side effects:** —
- **Steps:** —
- **Probe 2026-09-09:** safe=no, result=not-probed, deployed=no
- **Notes:**
  - import commented out in registerFunctions
