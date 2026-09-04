import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Ratchet: the four files that charge and never refund must keep the reason
 * that makes a failure cost the user nothing.
 *
 * Ten files charge without ever refunding. Six are explained by something a test
 * already holds -- a primitive, a helper, an adapter, an honest failure message
 * (owner item 21), a batch with refund reconciliation, a path that bails before
 * spending. The other four are safe for a reason that lived ONLY in a comment:
 *
 *   "Charging AFTER the await also means an ElevenLabs throw short-circuits
 *    before any deduction (no charge-on-fail)."
 *
 * True today, checked by nothing. Move the charge twenty lines up in a refactor
 * and the comment still reads the same while users start paying for failures.
 * The same shape as the marketplace payout described as "idempotent" (#1861):
 * a promise with no test behind it.
 *
 * THE FOUR DO NOT SHARE ONE MECHANISM. Writing one loose rule would have hidden
 * that, and the loose rule would have passed:
 *
 *   delivery-first  the charge sits AFTER a call that hands the artefact to the
 *                   user. handleTextToVideoDirect charges 48 lines below its
 *                   replyWithVideo; textToSpeechWizard charges after BOTH
 *                   replyWithVoice and replyWithDocument. The user has the file
 *                   before any money moves.
 *   success-gated   the charge sits inside a conditional on the provider's
 *                   result. instagramParserScene charges under
 *                   `if (result?.success)`; voiceAvatarWizard under
 *                   `if (voiceResult?.voiceId && !voiceResult.isFallback ...)`.
 *
 * A price check is deliberately NOT a success check: `if (cost > 0)` says
 * nothing about whether the work succeeded, and textToSpeechWizard's innermost
 * conditional is exactly that -- it is delivery-first, not success-gated.
 */

const ROOT = path.resolve(__dirname, '../../..')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const timing = require('../../../scripts/lib/charge-timing.cjs')

/** file -> the mechanism it must keep, and why that one. */
const PROTECTED: Record<
  string,
  { mechanism: 'delivery-first' | 'success-gated'; why: string }
> = {
  'src/handlers/handleTextToVideoDirect.ts': {
    mechanism: 'delivery-first',
    why: 'charges below replyWithVideo -- the video is already sent when the money moves',
  },
  'src/scenes/textToSpeechWizard/index.ts': {
    mechanism: 'delivery-first',
    why: 'charges after replyWithVoice and replyWithDocument; its innermost conditional is only `cost > 0`',
  },
  'src/scenes/voiceAvatarWizard/index.ts': {
    mechanism: 'success-gated',
    why: 'if (voiceResult?.voiceId && !voiceResult.isFallback) -- a Cloudflare fallback voice is not the paid product',
  },
  'src/scenes/instagramParserScene/index.ts': {
    mechanism: 'success-gated',
    why: 'if (result?.success) -- charges only once the scrape actually started',
  },
}

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')

describe('a failure costs the user nothing in the files that never refund', () => {
  it('the detector agrees with its own samples, in both directions', () => {
    // The negatives carry the weight, especially "a price check is not a
    // success check" and "a sibling branch that closed before the charge does
    // not count" -- both would otherwise report a file protected when it is not.
    expect(() => timing.selfCheck()).not.toThrow()
    for (const s of timing.SAMPLES) {
      const got = timing.timingFor(s.code)
      expect(got.deliveryFirst, s.why).toBe(s.deliveryFirst)
      expect(got.successGated, s.why).toBe(s.successGated)
    }
  })

  it('each file still has the mechanism it is listed with', () => {
    const broken: string[] = []
    for (const [file, { mechanism }] of Object.entries(PROTECTED)) {
      const t = timing.timingFor(read(file))
      const ok =
        mechanism === 'delivery-first' ? t.deliveryFirst : t.successGated
      if (!ok) broken.push(`${file}: lost ${mechanism}`)
    }
    expect(
      broken,
      `This file charges and never refunds, so the only thing keeping a failure ` +
        `free for the user is WHERE the charge sits. Either restore it -- below ` +
        `the delivery call, or inside the conditional on the provider's result -- ` +
        `or add a refund and move the file out of this list.`
    ).toEqual([])
  })

  it('the list still matches the files that charge without refunding', () => {
    // If a listed file grew a refund, its entry is stale and reads as coverage
    // of a rule that no longer applies. Cheap structural check: a refund-shaped
    // credit anywhere in the file.
    const CREDIT = /PaymentType\.(MONEY_INCOME|REFUND)\b/
    const nowRefunds = Object.keys(PROTECTED).filter(f => CREDIT.test(read(f)))
    expect(
      nowRefunds,
      'these files now refund -- drop them from this list, the rule they are ' +
        'listed under is no longer what protects the user'
    ).toEqual([])
  })
})
