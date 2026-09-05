import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The same Kie.ai clip is costed twice, and the two do not agree.
 *
 *   unified-video-models.config.ts   veo3_fast, provider kie, 8s default
 *                                    fixedPriceStars: 25
 *                                    "$0.40 / $0.016 = 25 stars (no markup)"
 *
 *   helpers/ai-reels-pricing.ts      "Veo 3 Fast via Kie.ai: $0.40 per 8s"
 *                                    veo31Cost = bRollCount * 40
 *
 * Same provider, same model, same duration, same stated dollar price, and one
 * says 25 while the other says 40. The comment beside the 40 derives 25 from
 * the very figures it quotes, so the literal contradicts its own arithmetic.
 *
 * This one is charged. calculateAIReelsPrice returns finalPrice, the render
 * wizards pass it to updateUserBalance as MONEY_OUTCOME, and the markup is
 * applied AFTER the component costs are summed:
 *
 *   finalPrice = ceil((elevenLabs + veo31Cost + avatar + infra) * 1.5)
 *
 * so each B-roll carries (40 - 25) * 1.5 = 22.5 stars more than the same clip
 * costs everywhere else in the repository.
 *
 * Which number is right is a REVENUE question, not a repair, so nothing here
 * changes a price. Lowering 40 to 25 would cut what the reels flow charges;
 * that is the owner's call, recorded as queue item 23.
 *
 * What this file does is stop the pair moving without anyone noticing. It
 * pins both sides, so a change to either one -- including a well meant
 * "fix" -- turns red and says what it does to the amount people pay.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const VIDEO_CONFIG = path.join(
  REPO,
  'src',
  'config',
  'unified-video-models.config.ts'
)
const REELS_PRICING = path.join(REPO, 'src', 'helpers', 'ai-reels-pricing.ts')

/** The veo3_fast entry's fixed star price in the unified config. */
function configStars(): number {
  const raw = fs.readFileSync(VIDEO_CONFIG, 'utf8')
  const entry = raw.match(/veo3_fast:\s*\{[\s\S]*?fixedPriceStars:\s*(\d+)/)
  expect(
    entry,
    'the veo3_fast entry or its fixedPriceStars moved -- this ratchet is reading nothing'
  ).not.toBeNull()
  return Number(entry![1])
}

/** The per-B-roll star cost the reels estimator actually charges. */
function reelsStars(): number {
  const raw = fs.readFileSync(REELS_PRICING, 'utf8')
  const line = raw.match(/veo31Cost\s*=\s*bRollCount\s*\*\s*(\d+)/)
  expect(
    line,
    'the veo31Cost line moved -- this ratchet is reading nothing'
  ).not.toBeNull()
  return Number(line![1])
}

/** The markup the estimator applies to the summed component costs. */
function reelsMarkup(): number {
  const raw = fs.readFileSync(REELS_PRICING, 'utf8')
  const m = raw.match(/markupMultiplier\s*=\s*([\d.]+)/)
  expect(m, 'the markup default moved').not.toBeNull()
  return Number(m![1])
}

describe('the two Veo 3 Fast costs are a known, recorded divergence', () => {
  it('still reads both sides', () => {
    // Both numbers come out of source text. If either read silently returned
    // nothing, the comparison below would be between two defaults and would
    // agree with itself forever.
    expect(configStars(), 'config side unreadable').toBeGreaterThan(0)
    expect(reelsStars(), 'reels side unreadable').toBeGreaterThan(0)
    expect(reelsMarkup(), 'markup unreadable').toBeGreaterThan(0)
  })

  it('holds the config side at the price its own arithmetic gives', () => {
    // $0.40 / $0.016 = 25 exactly, no markup. This side is the one that
    // agrees with its comment, so it is pinned to the arithmetic rather than
    // to a literal copied from the file.
    expect(
      configStars(),
      'the unified config no longer prices a Kie.ai Veo 3 Fast clip at cost'
    ).toBe(Math.round(0.4 / 0.016))
  })

  it('holds the charged side at the value recorded in the owner queue', () => {
    // Not asserting which is correct -- asserting that it has not moved
    // while the question is open.
    const reels = reelsStars()
    const config = configStars()
    const extraPerBRoll = (reels - config) * reelsMarkup()
    expect(
      { reels, config, extraPerBRoll },
      'the Veo 3 Fast cost split changed. This alters what the AI reels flow ' +
        'charges: the per-B-roll difference is (reels - config) * markup. ' +
        'If the owner has decided item 23, update this ratchet and say so in ' +
        'docs/OWNER-DECISIONS.md rather than only editing the number'
    ).toEqual({ reels: 40, config: 25, extraPerBRoll: 22.5 })
  })

  it('keeps the markup applied after the component costs, not before', () => {
    // The size of the divergence depends on this order. If the markup moved
    // inside the component sum, the 22.5 above would be wrong and the queue
    // item would be quoting a number that no longer describes the code.
    const raw = fs.readFileSync(REELS_PRICING, 'utf8')
    expect(
      raw,
      'the subtotal no longer sums the components before the markup'
    ).toMatch(
      /subtotal\s*=\s*elevenLabsCost\s*\+\s*veo31Cost\s*\+\s*avatarCost\s*\+\s*infrastructureCost/
    )
    expect(raw, 'the markup is no longer applied to the subtotal').toMatch(
      /finalPrice\s*=\s*Math\.ceil\(\s*subtotal\s*\*\s*markupMultiplier\s*\)/
    )
  })
})
