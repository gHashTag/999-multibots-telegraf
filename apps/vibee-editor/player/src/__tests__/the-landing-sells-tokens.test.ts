import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE FIRST PAGE A VISITOR SEES MUST SELL THE THING WE ACTUALLY SELL.
 *
 * Until this test the landing offered Free $0 / Pro $19 / Team $49 per month
 * in both locales, with feature lists to match -- "3 reels per month", "no
 * watermark", "4K export", "5 team members", "dedicated manager". No monthly
 * plan exists, no code has ever charged one, and the chosen plan travelled in
 * the link as `/editor?plan=pro`, a parameter nothing in this repository
 * reads.
 *
 * It was the third invented tier found in a single day, after the bot's rouble
 * tariffs and the agent's club. What the owner sells is tokens, so the section
 * shows the packs -- fetched from /api/tokens/packs, not typed here, because a
 * fourth hand-written copy of a price is how the first three drifted.
 */

const ROOT = join(__dirname, '..', '..')
const COMPONENT = join(ROOT, 'src', 'components', 'landing', 'Pricing.tsx')
const LANGUAGE = join(ROOT, 'src', 'atoms', 'language.ts')

/** A price in dollars, or a per-month period: the shape of a plan we do not sell. */
const PLAN_SHAPE = /\$\s?\d|\/month|\/месяц|per month|в месяц/i // cyrillic-ok: it must match Russian copy

describe('the landing sells tokens, not a monthly plan', () => {
  const component = readFileSync(COMPONENT, 'utf8')
  const language = readFileSync(LANGUAGE, 'utf8')

  /**
   * SELF-CHECK. The needles are the exact strings that shipped, so "no plan
   * found" cannot be confused with "the matcher looked for nothing".
   */
  it('the matcher recognises the plan copy that shipped', () => {
    expect(PLAN_SHAPE.test("'pricing.pro.price': '$19',")).toBe(true)
    expect(PLAN_SHAPE.test("'pricing.free.period': '/month',")).toBe(true)
    expect(PLAN_SHAPE.test("'pricing.business.period': '/месяц',")).toBe(true)
    expect(PLAN_SHAPE.test("'pricing.pack.period': 'звёздами Telegram',")).toBe(
      false
    )
  })

  it('the pricing component names no price and no plan', () => {
    expect(PLAN_SHAPE.test(component)).toBe(false)
    // The plan even travelled in the CTA; nothing reads it.
    expect(component).not.toContain('plan=')
    // The numbers come from the server, not from here.
    expect(component).toContain('/api/tokens/packs')
  })

  it('no pricing string in either locale offers a monthly plan', () => {
    const lines = language.split('\n').filter(l => l.includes("'pricing."))
    // Both locales carry the block, so a one-locale fix cannot pass.
    expect(lines.length).toBeGreaterThan(20)
    const guilty = lines.filter(l => PLAN_SHAPE.test(l))
    expect(guilty).toEqual([])
  })

  /**
   * A key missing from one locale renders as the raw key on the page -- the
   * translator returns the key itself when it finds no line. That is exactly
   * the kind of silent breakage a landing page should not ship.
   */
  it('every key the component asks for exists in BOTH locales', () => {
    const keys = [...component.matchAll(/t\('([^']+)'/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(5)
    for (const key of keys) {
      const occurrences = language.split(`'${key}':`).length - 1
      expect(
        occurrences,
        `${key}: found in ${occurrences} locale(s), want 2`
      ).toBe(2)
    }
  })
})
