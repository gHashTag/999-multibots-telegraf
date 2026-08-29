# Feature and dead-feature inventory

A code-grounded map of what the bot offers and what is defined but not wired.
Every claim below cites the source that establishes it, verified against `main`
at the time of writing. It exists because the dead half of the product was
scattered across several audits (`docs/audit/unregistered-functions.md`, the
Inngest and scene registration gates); this consolidates it into one place an
owner can act on.

## What the bot offers today

The user-facing surface is the `ModeEnum` in `src/interfaces/modes.ts` (85
entries) plus the scenes registered in `createStage()`
(`src/navigation/registerCommands.ts`). Grouped by capability:

- **Images** — NeuroPhoto (v1, v2), Text-to-Image (multi-model), Image-to-Prompt,
  Image Upscaler, Face Swap, AI Photoshop (multi-photo edit / morphing), Flux
  Kontext.
- **Video** — Text-to-Video (Kie.ai: Sora / Veo / WAN), Image-to-Video, Morphing,
  AI Reels (multi-provider render pipeline), Video Transcription.
- **Avatars & voice** — Voice Avatar (ElevenLabs), Text-to-Speech, Digital Avatar
  Body (v1, v2), Chat with Avatar, Avatar Transform, Avatar Brain.
- **Lip-sync** — Hedra, Heygen, Fal, Veed Fabric render wizards.
- **Audio** — AI Cover (RVC), Music Generation.
- **Model training** — Flux model training on Replicate.
- **Content / marketing** — Marketplace, competitor analysis, content scripts.
- **Money & meta** — subscriptions, referrals, balance, multi-bot whitelabel.

Payment rails: Telegram Stars, Robokassa (RUB), CryptoBot (USDT), TON (native +
Connect). All four verify or claim payments idempotently — Robokassa via a
compare-and-set on `payments_v2`, the rest documented in
`docs/audit/payment-idempotency.md`.

## Defined but not wired (dead or gated off)

These are shipped code paths that cannot run as the tree stands. Wiring any of
them changes production behaviour and/or the database, so each is an owner
decision, not an autonomous fix.

| Feature                      | Evidence                                                                                                                                                                    | Effect of it being off                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stuck-training watchdog**  | `functions/training/checkStuckTrainings` is in the Inngest gate's unregistered list (`src/__tests__/inngest/registration.test.ts`)                                          | A 30-minute cron that would resolve stuck trainings never runs. Per `docs/audit/unregistered-functions.md`, 17 trainings have hung 250–465 days with ~3410⭐ of adjacent payments. |
| **Welcome avatar**           | `functions/welcomeAvatarGeneration` unregistered; `createUserScene` sends `user/welcome.avatar.generate` with no subscriber                                                 | New users never get the welcome avatar the onboarding promises.                                                                                                                    |
| **Voice training (RVC)**     | `const VOICE_TRAINING_DISCONNECTED = true` in `src/scenes/voiceTrainingWizard/index.ts:54`; `functions/training/voiceTrainingRVC` unregistered                              | The confirm button returns before charging — the feature is intentionally gated off, not broken, but it is dead to users.                                                          |
| **Level quest / onboarding** | `step0Scene`…`step12Scene` and `completeScene` exported from `levelQuestWizard` but absent from `createStage`; entry `setupLevelHandlers` is itself an unregistered handler | The 13-step onboarding quest is dead upstream; `levelQuestWizard.enter` is a one-line stub.                                                                                        |
| **Instagram scraping**       | `instagramScraperV2` commented out in `registerFunctions.ts:23,96`; `RAPIDAPI_INSTAGRAM_KEY` unset in prod                                                                  | Instagram content automation is off entirely.                                                                                                                                      |
| **KieAI webhook monitor**    | `functions/kieAiWebhookMonitor` unregistered                                                                                                                                | No automated watch on the video webhook health.                                                                                                                                    |

## Reliability posture

The registration gates (`src/__tests__/inngest/registration.test.ts`,
`src/__tests__/scenes/scene-registration.test.ts`) now fail the build if a new
function or scene is imported into its registry but left unwired — so the dead
list above cannot silently grow. Money-touching wizard steps carry in-flight
guards against double submission; the money-gated `/api` routes require an
internal key compared in constant time.

## What this implies

The reliability floor is in good shape. The clearest remaining product value is
in the **dead-feature column**: two of those rows — the stuck-training watchdog
and the welcome avatar — are lost work with direct user and revenue impact, not
abandoned experiments. Turning them on is a scoped, owner-gated task, protected
now by the registration gates.
