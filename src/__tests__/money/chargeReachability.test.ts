import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * Ratchet: the set of files from which a charge is reachable does not grow
 * silently.
 *
 * Most charging files are services that never guard themselves. Their protection
 * against a double charge belongs to WHOEVER CALLS THEM -- a scene with an
 * in-progress flag (paid-wizard-guard-ratchet holds all 18 of those), an Inngest
 * function whose charge sits in step.run, or a command with a consume-once mark
 * set BEFORE the charge (registerCommands does this for the neurophoto upscale,
 * #1551).
 *
 * That is a claim about the IMPORT GRAPH, and until now it was a claim made by
 * reading the graph once and writing the conclusion into a report. A new import
 * from an unguarded place breaks it in total silence: the services are
 * unchanged, the scenes are still guarded, and nothing anywhere turns red.
 *
 * WHAT THIS PINS, EXACTLY. Not "every one of these callers is guarded" -- some
 * were read, not all sixty, and a registry claiming more than was checked is the
 * failure this repository keeps rediscovering. It pins the SHAPE: this is the
 * set of files from which a charge can be reached, and it may not change without
 * someone looking. A new name here is a new way to spend a user's money.
 *
 * Barrels are transparent: `services/index.ts` re-exporting a charger is not a
 * caller, so the walk continues through it to whoever imports the barrel.
 * Treating a barrel as a terminal importer would report "imported only by
 * index.ts" and prove nothing.
 */

const ROOT = path.resolve(__dirname, '../../..')
const MAP = path.join(ROOT, '.claude/loop-opus/money-map.mjs')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reach = require('../../../scripts/lib/charge-reachability.cjs')

/** Files from which a charging service is reachable. Frozen, not judged. */
const REACHABLE_FROM: string[] = [
  'src/api_server/routes/kie-ai-webhook.routes.ts',
  'src/bot.ts',
  'src/commands/index.ts',
  'src/core/lipsync/async-lipsync-manager.ts',
  'src/core/lipsync/providers/fal-veo31-provider.ts',
  'src/core/lipsync/providers/fal-wan25-provider.ts',
  'src/core/openai/getAinews.ts',
  'src/core/openai/getCaptionForNews.ts',
  'src/core/openai/getMeditationSteps.ts',
  'src/core/openai/getSlides.ts',
  'src/core/openai/getSubtitles.ts',
  'src/core/openai/getTriggerReel.ts',
  'src/core/openai/requests.ts',
  'src/core/openai/upgradePrompt.ts',
  'src/core/supabase/getAiFeedbackFromSupabase.ts',
  'src/handlers/paymentHandlers/handleTopUp.ts',
  'src/helpers/checkUserBalance.ts',
  'src/inngest_app/functions/existing/handleModelTrainingCompleted.ts',
  'src/inngest_app/functions/generation/neuroImageGeneration.ts',
  'src/inngest_app/functions/morphImages.ts',
  'src/inngest_app/functions/neuroImageGeneration.ts',
  'src/inngest_app/functions/training/modelTrainingV2.ts',
  'src/inngest_app/functions/welcomeAvatarGeneration.ts',
  'src/interfaces/cost.interface.ts',
  'src/modules/videoGenerator/generateImageToVideo.ts',
  'src/modules/videoGenerator/generateTextToVideo.ts',
  'src/navigation/registerCommands.ts',
  'src/scenes/checkBalanceScene.ts',
  'src/scenes/cryptoPaymentScene.ts',
  'src/scenes/fluxKontextScene/index.ts',
  'src/scenes/levelQuestWizard/handlers.ts',
  'src/scenes/rublePaymentScene.ts',
  'src/scenes/starPaymentScene.ts',
  'src/scenes/videoDurationScene.ts',
  'src/services/audioTranscription.ts',
  'src/services/generateFluxKontext.ts',
  'src/services/generateFluxKontextMax.ts',
  'src/services/generateFluxKontextPro.ts',
  'src/services/generateGeminiImage.ts',
  'src/services/generateImageFromPrompt.ts',
  'src/services/generateImageToPrompt.ts',
  'src/services/generateNanoBanana.ts',
  'src/services/generateNanoBananaKie.ts',
  'src/services/generateNanoBananaProReplicate.ts',
  'src/services/generateNeuroPhotoHybrid.ts',
  'src/services/generateNeuroPhotoMulti.ts',
  'src/services/generateQwenImageEdit.ts',
  'src/services/generateQwenImageEditPlus.ts',
  'src/services/generateSeeDream4.ts',
  'src/services/generateSeeDream45.ts',
  'src/services/generateSeedEdit3.ts',
  'src/services/generateSeedream45Replicate.ts',
  'src/services/generateTextToImage.ts',
  'src/services/generateTextToImageDirect.ts',
  'src/services/imageUpscaler.ts',
  'src/services/index.ts',
  'src/services/plan_b/index.ts',
  'src/services/processAllModelsWithMultipleImages.ts',
  'src/services/videoTranscription.ts',
  'src/tests/replicate-models-test.ts',
]

type Site = { file: string; direction: string }

const chargingServices = (): string[] => {
  const sites: Site[] = JSON.parse(
    execFileSync('node', [MAP, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
  )
  return [
    ...new Set(sites.filter(s => s.direction === 'charge').map(s => s.file)),
  ]
    .filter(
      f => !f.startsWith('src/scenes/') && !/inngest_app\/functions/.test(f)
    )
    .sort()
}

const actual = (): string[] => {
  const graph = reach.importGraph(ROOT)
  const out = new Set<string>()
  for (const f of chargingServices())
    for (const i of reach.effectiveImporters(graph, f)) out.add(i)
  return [...out].sort()
}

describe('the set of callers that can reach a charge is frozen', () => {
  /*
   * БЮДЖЕТ ВРЕМЕНИ ЗАДАН ЯВНО.
   *
   * Этот сторож читает граф импортов ВСЕГО `src` — работа на секунды, а не на
   * миллисекунды. С умолчанием vitest в 5000 мс он падал по времени (замер:
   * 5376, 6225 и 7848 мс) на машине под нагрузкой, и падал КАК ОБЫЧНЫЙ ОТКАЗ:
   * «набор мест, способных списать деньги, изменился» — сообщение, которое
   * пугает и не соответствует действительности.
   *
   * Срок, истекающий раньше, чем работа успевает закончиться, превращает
   * медленную машину в красный тест и обесценивает сторожа: его начинают
   * перезапускать вместо того, чтобы читать.
   */
  it('the graph is read from source, not from a mask', () => {
    // The first version read import specifiers from a blank-code mask and found
    // ZERO importers for every file in the repository -- the module path lives
    // inside a string literal, which the mask blanks. A uniformly zero answer is
    // a broken instrument, not a clean repository, and the self-check refuses an
    // implausibly empty graph for exactly that reason.
    expect(() => reach.selfCheck(ROOT)).not.toThrow()
  }, 30_000)

  it('floor: there are charging services outside scenes to be reached at all', () => {
    expect(chargingServices().length).toBeGreaterThan(10)
  }, 30_000)

  it('no NEW file can reach a charge', () => {
    expect(
      actual().filter(f => !REACHABLE_FROM.includes(f)),
      `A new file can reach a charging service. Charging services do not guard ` +
        `themselves -- the caller does. Check that this caller cannot fire twice ` +
        `for one user action (an in-progress flag, a consume-once mark set BEFORE ` +
        `the charge, or step.run), then add it to REACHABLE_FROM.`
    ).toEqual([])
  }, 30_000)

  it('no listed caller lost its route to a charge (the list is not a wish list)', () => {
    const now = actual()
    expect(
      REACHABLE_FROM.filter(f => !now.includes(f)),
      'these no longer reach a charge -- drop them, or the list reads as coverage of routes that no longer exist'
    ).toEqual([])
  }, 30_000)
})
