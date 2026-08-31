import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// count is parsed from callback data (count_N), which a crafted client can set
// to any value. An unknown count makes REELS_PRICING[count] undefined, and
// `currentBalance < undefined` is false -> the balance check is bypassed and the
// user is charged `undefined` while `count` reels are scraped (zero-cost bypass).
// The handler must reject a count outside the price table BEFORE the balance
// check. Guard source-level (repo style, like mountOrder/protected-routes).
const SRC = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    '..',
    'scenes',
    'instagramParserScene',
    'index.ts'
  ),
  'utf8'
)

describe('instagramParserScene validates the reel count/cost (zero-cost bypass)', () => {
  it('the price lookup exists (matcher not stale)', () => {
    expect(SRC).toMatch(/REELS_PRICING\[count as keyof typeof REELS_PRICING\]/)
  })

  it('rejects an unknown count before the balance check', () => {
    const lookup = SRC.indexOf(
      'REELS_PRICING[count as keyof typeof REELS_PRICING]'
    )
    const balanceCheck = SRC.indexOf('currentBalance < cost')
    expect(lookup).toBeGreaterThan(-1)
    expect(balanceCheck).toBeGreaterThan(lookup)
    const between = SRC.slice(lookup, balanceCheck)
    expect(
      /typeof cost !== 'number'/.test(between),
      'must reject a non-numeric cost (unknown count) before the balance check'
    ).toBe(true)
  })
})
