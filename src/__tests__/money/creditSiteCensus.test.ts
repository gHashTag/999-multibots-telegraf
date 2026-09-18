/**
 * Ratchet (census): every place that CREDITS a user is a mint surface -- a bug
 * there creates money from nothing (replay -> double-credit, forged payload ->
 * credit, amount from untrusted input). This pins the KNOWN population of credit
 * call-sites; a NEW one turns the suite RED until it is reviewed for idempotency
 * + authenticity and added to the allowlist below.
 *
 * It does not prove each site is guarded -- it prevents an UNREVIEWED credit
 * site from slipping in silently.
 *
 * WHAT CHANGED, AND WHY THE OLD POPULATION WAS WRONG
 *
 * The matcher used to test a LINE for `updateUserBalance(` and then search the
 * next EIGHT LINES for MONEY_INCOME. Measured, that was wrong four ways:
 *
 *   - a twelve-line comment between a call and its PaymentType hid two training
 *     credit sites, one of them LIVE (modelTrainingV2 is in registerFunctions);
 *   - widening the window to 40 lines invented three credits that do not exist,
 *     so there was no window width that was merely "safer";
 *   - the search read RAW text, so a comment counted as a credit -- worked
 *     around by EXCLUDING the primitive's own file, which hid the defect;
 *   - only MONEY_INCOME counted, so a credit typed PaymentType.REFUND was
 *     invisible, including aiCoverWizard, a live registered scene.
 *
 * The unit is now the CALL: the balanced argument list of each updateUserBalance
 * call, read from a source masked through blank-code, following one hop when the
 * type is passed through a local. There is no window left to tune. The reader
 * lives in scripts/lib/credit-sites.cjs so this test and `tri credit-sites` ask
 * the same question -- a control over a copy proves nothing about the original.
 *
 * modules/videoGenerator/generateTextToVideo left the allowlist: its credit was
 * REMOVED (#1839, a refund with no charge behind it), and the old floor test
 * tolerated two missing entries, so the stale entry never showed. A census must
 * fail on a name it can no longer find, or it slowly becomes a wish list.
 */
import { describe, it, expect } from 'vitest'
import * as path from 'path'

const SRC = path.resolve(__dirname, '../..')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const credits = require('../../../scripts/lib/credit-sites.cjs')

/**
 * Reviewed credit call-sites: file -> number of credit calls.
 *
 * Liveness is stated because a census cannot see it, and it decides how urgent
 * a finding is. "Unregistered" means absent from registerFunctions.ts and
 * prod-app.ts; those copies are kept correct anyway, because copies diverge
 * silently and someone may wire them back.
 */
const ALLOWLIST: Record<string, number> = {
  // payment / top-up: authenticated and idempotent
  'api_server/routes/robokassa.routes.ts': 1, // signature checked; claim is a status CAS on PENDING
  'api_server/routes/x402.routes.ts': 2, // fail-closed, settlement-gated (#1474); router imported but never mounted
  'inngest_app/functions/payments/paymentProcessing.ts': 1, // inngest credit funnel, keyed by inv_id
  'scenes/tonNativePaymentScene/index.ts': 1, // atomic status CAS (#1548/#1555)
  'scenes/tonPaymentScene/index.ts': 1, // atomic status CAS (#1548/#1555)

  // peer payout
  // 95% author payout. NOT "idempotent", which is what this line used to say
  // and what sent nobody to look: the guard is an in-memory Set keyed
  // buyerId:itemId, per process, released in a finally. It prevents a
  // CONCURRENT double charge inside one process and nothing more -- a second
  // instance, or the same process after a restart, sees an empty Set. The
  // finally is load-bearing and was added in #1861 after a throw between the
  // charge and the release turned the key into a permanent free tap.
  'services/marketplaceService.ts': 1,

  // refunds: reconcile to a charge that happened, so not a mint when guarded
  'core/lipsync/async-lipsync-manager.ts': 1, // job.refundIssued flag
  'price/helpers/refundAndTell.ts': 1, // type arrives through a local; result checked and announced
  'price/helpers/refundUser.ts': 1, // ledger-clamped
  'scenes/aiCoverWizard/index.ts': 1, // LIVE (registerCommands.ts); refund gated on `if (charged)`
  'scenes/instagramParserWizard/index.ts': 1,
  // fal-render-wizard left this census on 2026-09-18: its raw credit became
  // a refundAndTell call, so the direct credit this reader counts is gone.
  'scenes/lipSyncWizard/hedra-render-wizard.ts': 1,
  'scenes/lipSyncWizard/heygen-render-wizard.ts': 1,
  'scenes/musicGenerationWizard/index.ts': 1, // announces a failed refund with the amount
  'scenes/videoTranscriptionWizard/index.ts': 1, // announces a failed refund with the amount

  // training refunds
  'inngest_app/functions/training/modelTrainingV2.ts': 1, // LIVE (registerFunctions.ts); refund inside step.run, so an Inngest retry replays instead of re-crediting; the charge happened before the try
  'inngest_app/functions/training/generateModelTraining.ts': 1, // UNREGISTERED copy; credits the operation amount, fixed after it credited the whole prior balance
  'inngest_app/functions/training/voiceTrainingRVC.ts': 2, // UNREGISTERED; both refunds inside step.run; the file itself warns two branches can fire on one failure
}

describe('credit-site census: no unreviewed mint surface', () => {
  const actual: Record<string, number> = credits.creditCallsByFile(SRC)

  it('the reader agrees with its own samples, in both directions', () => {
    // The negatives carry the weight: a census that over-counts sends someone to
    // review a charge, and the next false alarm teaches people to ignore it.
    expect(() => credits.selfCheck()).not.toThrow()
    for (const s of credits.SAMPLES)
      expect(credits.creditCallsInSource(s.code), s.why).toBe(s.credits)
  })

  it('no NEW file credits without review', () => {
    expect(
      Object.keys(actual).filter(f => !(f in ALLOWLIST)),
      `New credit site(s) not in the census allowlist. A credit creates money -- ` +
        `review the site for idempotency (replay -> double-credit) and ` +
        `authenticity (forged payload -> mint), then add it to ALLOWLIST in ` +
        `creditSiteCensus.test.ts with a one-line rationale and its liveness.`
    ).toEqual([])
  })

  it('no allowlisted file GREW its credit count', () => {
    expect(
      Object.keys(ALLOWLIST)
        .filter(f => (actual[f] || 0) > ALLOWLIST[f])
        .map(f => `${f}: ${actual[f]} > ${ALLOWLIST[f]}`),
      `A file added a credit call beyond its reviewed count. Review the new ` +
        `credit for idempotency + authenticity and bump ALLOWLIST.`
    ).toEqual([])
  })

  it('no allowlisted file lost its credits (the census is not a wish list)', () => {
    // The old floor tolerated two missing names, and that tolerance is exactly
    // what hid generateTextToVideo for a whole iteration after its credit was
    // removed. A name the census can no longer find is either a removed credit
    // (delete the entry) or a matcher that stopped working (fix the reader) --
    // both need a person, so neither may pass quietly.
    expect(
      Object.keys(ALLOWLIST).filter(f => !(f in actual)),
      `Allowlisted file(s) no longer credit. If the credit was removed on ` +
        `purpose, delete the entry; if not, the reader broke.`
    ).toEqual([])
  })

  it('self-check: the diff logic flags a synthetic new site and a grown count', () => {
    const withNew = { ...actual, 'scenes/newProviderWebhook/index.ts': 1 }
    expect(Object.keys(withNew).filter(f => !(f in ALLOWLIST))).toContain(
      'scenes/newProviderWebhook/index.ts'
    )
    const withGrowth = { ...actual, 'services/marketplaceService.ts': 2 }
    expect(
      Object.keys(ALLOWLIST).filter(f => (withGrowth[f] || 0) > ALLOWLIST[f])
    ).toContain('services/marketplaceService.ts')
  })
})
