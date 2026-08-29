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

| Feature                      | Evidence                                                                                                                                                                    | Effect of it being off                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Welcome avatar**           | `functions/welcomeAvatarGeneration` unregistered; `createUserScene` sends `user/welcome.avatar.generate` with no subscriber                                                 | New users never get the welcome avatar the onboarding promises.                                                           |
| **Voice training (RVC)**     | `const VOICE_TRAINING_DISCONNECTED = true` in `src/scenes/voiceTrainingWizard/index.ts:54`; `functions/training/voiceTrainingRVC` unregistered                              | The confirm button returns before charging — the feature is intentionally gated off, not broken, but it is dead to users. |
| **Level quest / onboarding** | `step0Scene`…`step12Scene` and `completeScene` exported from `levelQuestWizard` but absent from `createStage`; entry `setupLevelHandlers` is itself an unregistered handler | The 13-step onboarding quest is dead upstream; `levelQuestWizard.enter` is a one-line stub.                               |
| **Instagram scraping**       | `instagramScraperV2` commented out in `registerFunctions.ts:23,96`; `RAPIDAPI_INSTAGRAM_KEY` unset in prod                                                                  | Instagram content automation is off entirely.                                                                             |
| **KieAI webhook monitor**    | `functions/kieAiWebhookMonitor` unregistered                                                                                                                                | No automated watch on the video webhook health.                                                                           |

**Enabled since this ledger was written.** The stuck-training watchdog
(`checkStuckTrainings`) was turned on in #1057 — the same PR hardened its
subscriber `handleModelTrainingCompleted` so a `succeeded` event with a
version-less output flips the DB status instead of throwing before the update,
which an adversarial review showed would otherwise make the cron re-fire every
30 minutes forever. It is registered and runs on the next deploy; the first run
against the ~17-row backlog should be watched to confirm every swept row reaches
a terminal status and is not re-selected.

## Reliability posture

The registration gates (`src/__tests__/inngest/registration.test.ts`,
`src/__tests__/scenes/scene-registration.test.ts`) now fail the build if a new
function or scene is imported into its registry but left unwired — so the dead
list above cannot silently grow. Money-touching wizard steps carry in-flight
guards against double submission; the money-gated `/api` routes require an
internal key compared in constant time.

## What this implies

The reliability floor is in good shape. The clearest remaining product value is
in the **dead-feature column**: the welcome avatar is lost work with direct user
and revenue impact, not an abandoned experiment. The stuck-training watchdog —
the other such row — was turned on in #1057. Turning the rest on is a scoped,
owner-gated task, protected now by the registration gates.
