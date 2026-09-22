import { describe, it, expect } from 'vitest'
import {
  STAR_PAYOUT_USD,
  clubStarsPerToken,
  clubUsdPerToken,
  marginFlags,
  marginReport,
  formatMarginReport,
} from './margin-report'
import { replicateClipTokens } from './billing-shared'
import {
  CLUB_STARS,
  CLUB_TOKEN_SHARE,
  clubTokensPerPeriod,
} from './club-membership'

/**
 * `tri margin` is only worth running if its two lines -- LOSS and UNDER
 * FLOOR -- sit exactly where the money says. The flags are checked on made-up
 * numbers on both sides of each line, then the real report on today's tables.
 */
describe('where the lines are drawn', () => {
  // A round rate so each case can be checked by eye: a token brings $0.01.
  const rate = 0.01

  it('a sale whose revenue is under the cost is a loss, and under the floor', () => {
    // 30 tokens = $0.30 against a $0.36 clip.
    expect(marginFlags(0.36, null, 30, rate)).toEqual(['LOSS', 'UNDER FLOOR'])
  })

  it('paid for but under the markup is flagged, not called a loss', () => {
    // The old flat 40 against the 10-second clip: $0.40 covers $0.36, but the
    // billing rule wants ceil(0.36 x markup / 0.005) = 144.
    expect(marginFlags(0.36, null, 40, rate)).toEqual(['UNDER FLOOR'])
  })

  it('at the floor nothing is flagged', () => {
    expect(marginFlags(0.36, null, 144, rate)).toEqual([])
  })

  it('a dearer variant is asked the same two questions', () => {
    expect(marginFlags(0.3, 1.0, 120, rate)).toEqual(['UNDER FLOOR AT DEAREST'])
    // $0.90 covers the $0.20 variant at its floor (80) but not the $1.00 one.
    expect(marginFlags(0.2, 1.0, 90, rate)).toEqual([
      'LOSS AT DEAREST',
      'UNDER FLOOR AT DEAREST',
    ])
    // A "dearest" that is not dearer adds nothing.
    expect(marginFlags(0.3, 0.3, 120, rate)).toEqual([])
    expect(marginFlags(0.3, 0.2, 120, rate)).toEqual([])
  })
})

describe("the club's own rate", () => {
  it('is the Stars behind a club token times the payout per Star', () => {
    const stars = (CLUB_STARS * CLUB_TOKEN_SHARE) / clubTokensPerPeriod()
    expect(clubStarsPerToken()).toBeCloseTo(stars, 12)
    expect(clubUsdPerToken()).toBeCloseTo(stars * STAR_PAYOUT_USD, 12)
    // Today: 3 000 Stars for 2 571 tokens, at $0.013 a Star.
    expect(clubStarsPerToken()).toBeCloseTo(3000 / 2571, 9)
  })
})

describe("today's report", () => {
  const report = marginReport()
  const rate = clubUsdPerToken()

  it('covers images and videos, both Replicate lengths among them', () => {
    const kinds = new Set(report.rows.map(r => r.kind))
    expect(kinds).toEqual(new Set(['image', 'video']))
    const clips = report.rows.filter(r =>
      r.model.startsWith('replicate/bytedance/seedance-1-lite')
    )
    expect(clips.map(r => r.tokens)).toEqual([
      replicateClipTokens(5),
      replicateClipTokens(10),
    ])
  })

  it('every sale is at or above the floor at its own cost -- the floor holds', () => {
    const under = report.rows.filter(
      r => r.flags.includes('LOSS') || r.flags.includes('UNDER FLOOR')
    )
    expect(under.map(r => `${r.model} ${r.unit}`)).toEqual([])
    // The denominator: the report is not empty.
    expect(report.rows.length).toBeGreaterThan(20)
  })

  it('revenue is the tokens at the club rate, row by row', () => {
    for (const r of report.rows) {
      expect(r.revenueUsd, r.model).toBeCloseTo(r.tokens * rate, 9)
      expect(r.marginUsd, r.model).toBeCloseTo(r.revenueUsd - r.costUsd, 9)
    }
  })

  it('names what it does not sell, and why', () => {
    const refused = report.refused.map(r => r.model)
    expect(refused).toContain('kie/bytedance/seedance-2')
    expect(refused).toContain('fal/fal-ai/nano-banana-pro')
    for (const r of report.refused) expect(r.why.length).toBeGreaterThan(10)
  })

  it('prints every row and the count line', () => {
    const text = formatMarginReport(report)
    for (const r of report.rows) expect(text).toContain(r.model)
    expect(text).toMatch(
      new RegExp(`${report.rows.length} sales, 0 below cost`)
    )
  })
})
