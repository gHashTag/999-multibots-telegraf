import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Ratchet: the protection each credit site is DESCRIBED as having must still be
 * detectable in the file.
 *
 * The credit-site census pins which files credit and carries a sentence of prose
 * beside each explaining why that credit is safe. Prose ages silently, and one
 * of those sentences was measurably false a day after I wrote it: the
 * marketplace payout was described as "idempotent" while its only guard was an
 * in-memory Set a throw could leave set forever (#1861). The census stayed green
 * the whole time, because a census checks a LIST, not the promises beside it.
 *
 * This checks the promises. Delete the step.run wrapper, or the catch, or the
 * status CAS, and the site's entry here fails.
 *
 * WHAT IT DOES NOT CLAIM. Finding `step.run` around a credit does not prove the
 * credit is idempotent -- it proves the named mechanism is still present. A
 * guard can be there and still be wrong. This closes the gap between "the note
 * says X" and "X exists", which is exactly the gap that hid #1861. It does not
 * close the gap between "X exists" and "X is correct"; only reading does that.
 *
 * Each entry lists the MINIMUM this file must keep, not everything detected
 * today. Requiring the full set would turn every unrelated refactor into a red
 * test and teach people to edit the expectation rather than look at it.
 */

const ROOT = path.resolve(__dirname, '../../..')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guards = require('../../../scripts/lib/credit-guards.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const credits = require('../../../scripts/lib/credit-sites.cjs')

/**
 * file -> the mechanism it must keep, and why that is the right one.
 * An empty list means "nothing in-file, and here is why that is acceptable".
 */
const PROMISED: Record<string, { keep: string[]; why: string }> = {
  'api_server/routes/robokassa.routes.ts': {
    keep: ['cas'],
    why: 'the claim is a compare-and-set on PENDING; without it two concurrent deliveries both credit',
  },
  'scenes/tonPaymentScene/index.ts': {
    keep: ['cas'],
    why: 'atomic status CAS (#1548/#1555)',
  },
  'scenes/tonNativePaymentScene/index.ts': {
    keep: ['cas'],
    why: 'atomic status CAS (#1548/#1555)',
  },
  'price/helpers/refundUser.ts': {
    keep: ['cas'],
    why: 'the refund is clamped against the ledger before it credits',
  },
  'inngest_app/functions/payments/paymentProcessing.ts': {
    keep: ['step.run'],
    why: 'the credit is a memoised step, so an Inngest retry replays it instead of crediting again',
  },
  'inngest_app/functions/training/modelTrainingV2.ts': {
    keep: ['step.run', 'catch'],
    why: 'LIVE: refund on the failure path, inside a memoised step',
  },
  'inngest_app/functions/training/generateModelTraining.ts': {
    keep: ['step.run', 'catch'],
    why: 'unregistered copy, kept correct because copies diverge silently',
  },
  'inngest_app/functions/training/voiceTrainingRVC.ts': {
    keep: ['step.run'],
    why: 'unregistered; both refunds are memoised steps, and the file warns two branches can fire on one failure',
  },
  'core/lipsync/async-lipsync-manager.ts': {
    keep: ['finally'],
    why: 'the refundIssued flag is released in a finally',
  },
  'services/marketplaceService.ts': {
    keep: ['finally', 'charge-first'],
    why: 'the in-flight key must be released in a finally (#1861) and the author is paid only after the buyer is charged',
  },
  'scenes/aiCoverWizard/index.ts': {
    keep: ['catch', 'charge-first'],
    why: 'refund on the failure path, gated on a charge that happened',
  },
  'scenes/instagramParserWizard/index.ts': {
    keep: ['catch', 'charge-first'],
    why: 'refund on the failure path, after a charge',
  },
  'scenes/lipSyncWizard/heygen-render-wizard.ts': {
    keep: ['catch', 'charge-first'],
    why: 'refund on the failure path, after a charge',
  },
  'scenes/musicGenerationWizard/index.ts': {
    keep: ['catch', 'charge-first'],
    why: 'refund on the failure path, after a charge, and it announces a failed refund',
  },
  'scenes/videoTranscriptionWizard/index.ts': {
    keep: ['catch', 'charge-first'],
    why: 'refund on the failure path, after a charge, and it announces a failed refund',
  },
  'scenes/lipSyncWizard/hedra-render-wizard.ts': {
    keep: ['charge-first'],
    why: 'the refund is an early return, not a catch -- read and confirmed: the charge is above it in the same function, same amount',
  },
  'scenes/lipSyncWizard/fal-render-wizard.ts': {
    keep: ['charge-first'],
    why: 'dead code; kept correct because dead copies get revived',
  },
  'api_server/routes/x402.routes.ts': {
    keep: [],
    why: 'the router is imported but never app.use()d -- verified twice; nothing in-file guards it because nothing reaches it',
  },
  'price/helpers/refundAndTell.ts': {
    keep: [],
    why: 'a helper: the CALLER owns the charge context, so no in-file mechanism can exist here',
  },
}

describe('the guard each credit site is described as having still exists', () => {
  it('the detector agrees with its own samples, in both directions', () => {
    // The negatives carry the weight: a detector that saw a guard everywhere
    // would report every promise kept, which is the failure this file exists
    // to prevent.
    expect(() => guards.selfCheck()).not.toThrow()
    for (const s of guards.SAMPLES)
      expect([...guards.guardsFor(s.code)].sort(), s.why).toEqual(
        [...s.expect].sort()
      )
  })

  it('every promised mechanism is still detectable', () => {
    const broken: string[] = []
    for (const [file, { keep }] of Object.entries(PROMISED)) {
      const found = guards.guardsFor(
        fs.readFileSync(path.join(ROOT, 'src', file), 'utf8')
      )
      for (const k of keep) if (!found.has(k)) broken.push(`${file}: ${k}`)
    }
    expect(
      broken,
      `A credit site lost the protection it is described as having. Either the ` +
        `guard was removed -- restore it -- or it moved to a shape this detector ` +
        `does not know, in which case teach the detector before editing this list.`
    ).toEqual([])
  })

  it('the promise list covers every credit site, and invents none', () => {
    // A site with no entry is a credit nobody promised anything about, which is
    // how #1861 stayed comfortable. A promise for a file that no longer credits
    // is a stale line that reads as coverage.
    const sites = Object.keys(credits.creditCallsByFile(path.join(ROOT, 'src')))
    expect(
      sites.filter(f => !(f in PROMISED)),
      'credit sites with no promise'
    ).toEqual([])
    expect(
      Object.keys(PROMISED).filter(f => !sites.includes(f)),
      'promises about files that no longer credit'
    ).toEqual([])
  })

  it('every named mechanism is one the detector can actually find', () => {
    // A typo in a promise would silently never be checked.
    const unknown = Object.entries(PROMISED).flatMap(([f, { keep }]) =>
      keep.filter(k => !guards.KINDS.includes(k)).map(k => `${f}: ${k}`)
    )
    expect(unknown).toEqual([])
  })
})
