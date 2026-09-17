/**
 * THE RAIL'S TOP BOUND IS A MEASUREMENT, NOT A NUMBER SOMEBODY WROTE DOWN.
 *
 * `.feed-card-actions` is bounded by `top: var(--feed-chrome-top, 70px)`. That
 * 70px came from measuring the Recent/Popular chips on a desktop, where they
 * sit at `top: 70px`. They do not stay there: below 768px they are centred and
 * below 480px they sit at `top: 65px`, and their height follows the label text
 * and the font. A constant about someone else's box is a bug waiting for the
 * next breakpoint -- the same shape as the 96px rail reserve that had to be
 * corrected to 60px in #2452, and the 388px rail height that was cut off by its
 * own card in #2458.
 *
 * So the chips publish their own box and the rail reads it. This file pins the
 * rule that decides the number, and the fallback that has to survive for the
 * first paint, before any effect runs.
 *
 * jsdom has no layout engine -- every getBoundingClientRect is zero -- so an
 * effect-level test here would assert nothing at all. That is why the rule is a
 * pure function: these cases are real, and the browser-level proof is in the
 * session's probes (rail top vs the chips' measured bottom at five viewports).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { chromeInsetPx } from '../components/Panels/FeedPanel'

const CSS_PATH = join(__dirname, '..', 'components', 'Panels', 'FeedPanel.css')
const css = readFileSync(CSS_PATH, 'utf8')

describe('the chrome inset comes from the chips', () => {
  it('is the distance from the panel top to the chips bottom, plus a gap', () => {
    // A desktop: the panel starts under the 56px app header, the chips are
    // fixed at top: 70px and about 42px tall.
    expect(chromeInsetPx(56, { bottom: 112, height: 42 })).toBe(68)
  })

  it('follows the chips when they move, instead of staying at 70', () => {
    // Below 480px the chips sit at top: 65px and are smaller.
    const lower = chromeInsetPx(56, { bottom: 97, height: 32 })
    expect(lower).toBe(53)
    expect(lower).not.toBe(70)
  })

  it('reserves nothing for chips that have no box', () => {
    // An observer reports 0 for a display: none element. Reserving its height
    // anyway is how a band of emptiness gets left behind -- the tab bar paid
    // for that lesson already (TelegramTabBar.css).
    expect(chromeInsetPx(56, { bottom: 0, height: 0 })).toBe(0)
    expect(chromeInsetPx(56, null)).toBe(0)
  })

  it('never returns a negative inset when the chips end above the panel', () => {
    // A negative top would push the rail out of the card, which is the defect
    // this whole bound exists to prevent.
    expect(chromeInsetPx(400, { bottom: 112, height: 42 })).toBe(0)
  })

  it('is measured in whole pixels', () => {
    expect(chromeInsetPx(55.5, { bottom: 111.4, height: 41.9 })).toBe(68)
  })

  /**
   * THE FALLBACK IS NOT DECORATION. The variable is published by an effect, so
   * the first paint -- and any environment where the effect does not run --
   * still has to bound the rail. Without the fallback the rail would fall back
   * to `top: auto` and stretch to its content again, which is exactly the
   * state #2458 fixed.
   */
  it('keeps a fallback in the stylesheet for the first paint', () => {
    expect(css).toMatch(/top:\s*var\(--feed-chrome-top,\s*\d+px\)/)
  })

  it('fails if the fallback is dropped', () => {
    const mutant = css.replace(
      /top:\s*var\(--feed-chrome-top,\s*\d+px\)/,
      'top: var(--feed-chrome-top)'
    )
    expect(mutant).not.toEqual(css)
    expect(mutant).not.toMatch(/top:\s*var\(--feed-chrome-top,\s*\d+px\)/)
  })
})
