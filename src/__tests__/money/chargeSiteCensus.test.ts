import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

/**
 * Ratchet (census): every place that CHARGES a user, pinned like the credit
 * sites already are.
 *
 * The two directions were not treated alike. A new CREDIT site turns the suite
 * red until someone reviews it (creditSiteCensus, the mint surface). A new
 * CHARGE site turned nothing red: money-map is a REPORT, run by hand, consumed
 * by no test. So the mint surface was ratcheted and the taking surface was
 * merely observed.
 *
 * Charging is the intended direction, which is exactly why it goes unwatched --
 * and it is where double-charge, charge-without-delivery and charge-on-an-
 * invented-price live. This repository has separate tests for each of those
 * failures; what it lacked was the population they apply to.
 *
 * THE FIRST VERSION OF THIS CENSUS PINNED HALF THE SURFACE AND SAID "every".
 * It filtered money-map for direction === 'charge' and got 26 calls. But
 * money-map read the direction out of a call's ARGUMENTS, and
 * processBalanceOperation has no direction parameter at all -- its props are
 * { ctx, telegram_id, paymentAmount, is_ru, bot_name, is_welcome_gift } and the
 * single money call inside it is MONEY_OUTCOME. So all 21 of its call sites,
 * across 19 files, were filed as 'charge-or-refund' and sat OUTSIDE the
 * population this file claimed to pin. Teaching the classifier that a function
 * with no direction parameter can only charge emptied that bucket: 26 -> 47
 * calls, 25 -> 44 files.
 *
 * A census inherits the blind spots of the instrument it reads. Reading the
 * classifier is what found this; the census itself was green either way.
 *
 * IT CONSUMES money-map RATHER THAN RE-IMPLEMENTING IT. money-map walks the
 * TypeScript AST; a matcher written here would be weaker, and measurably was:
 * a masked-regex census built while writing this found 23 of the 25 charging
 * files, missing both that charge through `directPaymentProcessor({...})`,
 * where the direction lives in an object field and no PaymentType literal
 * appears in the call at all. Two instruments over one population must be
 * reconciled, not accumulated -- so this defers to the better one.
 */

const ROOT = path.resolve(__dirname, '../../..')
const MAP = path.join(ROOT, '.claude/loop-opus/money-map.mjs')

type Site = { file: string; line: number; fn: string; direction: string }

/** Every non-test source under src, for the reference check below. */
function sources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.includes('__tests__')
      )
        out.push(p)
    }
  }
  walk(path.join(ROOT, 'src'))
  return out
}

function census(): Site[] {
  expect(
    fs.existsSync(MAP),
    'money-map.mjs is gone. It is the AST census this ratchet reads; restore it ' +
      'or move the census, but do not delete the population.'
  ).toBe(true)
  const out = execFileSync('node', [MAP, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  return JSON.parse(out)
}

/** Reviewed charge sites: file -> number of charge calls. */
const ALLOWLIST: Record<string, number> = {
  'src/core/openai/requests.ts': 1,
  'src/handlers/handleTextToVideoDirect.ts': 1,
  'src/inngest_app/functions/generation/neuroImageGeneration.ts': 1,
  'src/inngest_app/functions/training/generateModelTraining.ts': 1,
  'src/inngest_app/functions/training/modelTrainingV2.ts': 1,
  'src/inngest_app/services/bot-adapter.ts': 1,
  'src/modules/videoGenerator/helpers/priceHelper.ts': 2,
  'src/price/helpers/processBalanceOperation.ts': 1,
  'src/scenes/aiCoverWizard/index.ts': 1,
  'src/scenes/aiPhotoshopScene/index.ts': 1,
  'src/scenes/faceSwapWizard/index.ts': 1,
  'src/scenes/instagramParserScene/index.ts': 1,
  'src/scenes/instagramParserWizard/index.ts': 1,
  'src/scenes/lipSyncWizard/ai-reels-inngest-wizard.ts': 1,
  'src/scenes/lipSyncWizard/ai-reels-render-wizard.ts': 1,
  'src/scenes/lipSyncWizard/ai-reels-wizard.ts': 1,
  'src/scenes/lipSyncWizard/fal-render-wizard.ts': 1,
  'src/scenes/lipSyncWizard/hedra-render-wizard.ts': 1,
  'src/scenes/lipSyncWizard/heygen-render-wizard.ts': 1,
  'src/scenes/lipSyncWizard/index.ts': 1,
  'src/scenes/lipSyncWizard/veed-fabric-wizard.ts': 1,
  'src/scenes/musicGenerationWizard/index.ts': 1,
  'src/scenes/textToSpeechWizard/index.ts': 1,
  'src/scenes/videoTranscriptionWizard/index.ts': 1,
  'src/scenes/voiceAvatarWizard/index.ts': 1,
  'src/scenes/voiceTrainingWizard/index.ts': 1,
  'src/services/generateFluxKontext.ts': 3,
  'src/services/generateFluxKontextMax.ts': 1,
  'src/services/generateFluxKontextPro.ts': 1,
  'src/services/generateGeminiImage.ts': 1,
  /*
   * Reviewed 2026-09-15, against the three questions this census asks.
   *
   * The amount cannot be chosen by the user: `GPT_IMAGE_25_MODEL.costPerImage`
   * is a module constant and nothing in the params can reach it.
   *
   * A retry cannot charge twice: the only caller is avatarTransformScene, one
   * charge per invocation, behind the per-user superheroGenInFlight lock.
   *
   * A failure after the charge refunds: the catch refunds exactly `totalCost`
   * -- and now only when the charge actually happened. It used to refund
   * whenever `skipBalanceCheck` was false, although four things above the
   * charge can throw (missing API key, Zod parse, unknown user, level bump),
   * so a failure BEFORE paying returned five stars that were never taken.
   * refundUser's hasChargeToRefund guard caught the simple case -- a refund
   * with no charge at all in the last day -- but it matches ANY charge of that
   * size, not the one this call thought it made, so anyone who had generated
   * something else that day went straight through it.
   */
  'src/services/generateGptImage25.ts': 1,
  'src/services/generateNanoBanana.ts': 1,
  'src/services/generateNanoBananaKie.ts': 1,
  'src/services/generateNanoBananaProReplicate.ts': 1,
  'src/services/generateNeuroPhotoDirect.ts': 1,
  'src/services/generateQwenImageEdit.ts': 1,
  'src/services/generateQwenImageEditPlus.ts': 1,
  'src/services/generateSeeDream4.ts': 1,
  'src/services/generateSeeDream45.ts': 1,
  'src/services/generateSeedEdit3.ts': 1,
  'src/services/generateSeedream45Replicate.ts': 1,
  'src/services/generateTextToImageDirect.ts': 1,
  'src/services/imageUpscaler.ts': 1,
  'src/services/marketplaceService.ts': 1,
  'src/services/plan_b/generateImageToPrompt.ts': 1,
}

describe('charge-site census: no unreviewed place that takes money', () => {
  const sites = census()
  const charges = sites.filter(s => s.direction === 'charge')
  const actual: Record<string, number> = {}
  for (const s of charges) actual[s.file] = (actual[s.file] || 0) + 1

  it('floor: the census tool produced a real population', () => {
    // Without this the ratchet passes vacuously the moment money-map errors,
    // changes its output shape, or renames the direction -- reporting a clean
    // repository because it measured nothing. That failure has happened twice
    // in this repo under other names, and it is the reason every census here
    // carries a floor.
    expect(sites.length, 'money-map returned no sites at all').toBeGreaterThan(
      80
    )
    expect(
      charges.length,
      'no site is classified as a charge -- the direction vocabulary changed'
    ).toBeGreaterThan(35)
  })

  it('no NEW file charges without review', () => {
    expect(
      Object.keys(actual).filter(f => !(f in ALLOWLIST)),
      `A new charge site. Charging is the intended direction, which is why it ` +
        `goes unread: check that the amount cannot be chosen by the user, that a ` +
        `retry cannot charge twice, and that a failure after the charge refunds ` +
        `or says so. Then add it here.`
    ).toEqual([])
  })

  it('no allowlisted file GREW its charge count', () => {
    expect(
      Object.keys(ALLOWLIST)
        .filter(f => (actual[f] || 0) > ALLOWLIST[f])
        .map(f => `${f}: ${actual[f]} > ${ALLOWLIST[f]}`)
    ).toEqual([])
  })

  it('no allowlisted file stopped charging (the list is not a wish list)', () => {
    // A name the census can no longer find is either a removed charge -- delete
    // the entry -- or a broken reader. Both need a person, so neither may pass
    // quietly.
    expect(Object.keys(ALLOWLIST).filter(f => !(f in actual))).toEqual([])
  })

  it('the charging files nobody calls are still called by nobody', () => {
    // TWO OF THESE 44 FILES CHARGE MONEY AND NOTHING IMPORTS THEM. Measured
    // while answering "can a retry charge twice": every other charge site is
    // covered -- 18 scenes carry an in-progress flag and all 18 are in
    // paid-wizard-guard-ratchet, 3 Inngest entry points charge inside step.run,
    // and the rest are reached only through those. These two are reached by
    // nothing at all.
    //
    // Dead code that charges is not harmless here. This repository has revived
    // dead money paths before, and a revival is exactly the moment the
    // double-charge question must be asked -- while nobody is thinking about
    // it, because the file "already existed". So the deadness is pinned rather
    // than the file deleted: wiring one up turns this red and asks the question
    // at the right time.
    const unreferenced = ['generateGeminiImage', 'generateNanoBananaKie']
    const revived: string[] = []
    for (const name of unreferenced) {
      const refs = sources().filter(
        f =>
          !f.endsWith(`/${name}.ts`) &&
          new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(
            fs.readFileSync(f, 'utf8')
          )
      )
      if (refs.length) revived.push(`${name}: ${refs.length} referrer(s)`)
    }
    expect(
      revived,
      `A charging file that nothing referenced is now referenced. Before it goes ` +
        `live, give it what every other charge site has: a guard against being ` +
        `charged twice (an in-progress flag for a scene, step.run for an Inngest ` +
        `function), and then move it out of this list.`
    ).toEqual([])
  })
})
