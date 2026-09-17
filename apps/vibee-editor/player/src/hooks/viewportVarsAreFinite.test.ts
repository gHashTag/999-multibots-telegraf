import { describe, expect, it } from 'vitest'
import { viewportVars } from '@/lib/telegramFullscreen'

/**
 * A MISSING VIEWPORT HEIGHT MUST NOT POISON THE CSS.
 *
 * useTelegramWebApp wrote `--app-vh-stable: ${wa.viewportStableHeight}px`
 * unconditionally. When the client has no number yet (the dev mock; a desktop
 * client before its first viewport event) the variable became the literal
 * `undefinedpx`, and every calc() built on it -- page heights, the script
 * sheet's max-height, the chat's container -- silently turned invalid.
 * Measured 08.09.2026: the script page collapsed to 427px and its sheet grew
 * to 931px, taller than the screen. The CSS default (100dvh) must survive
 * until a real number arrives.
 *
 * 2026-09-17: this used to read the hook's SOURCE and match the spelling of
 * its two `if (Number.isFinite(...))` lines. It went red on a refactor that
 * kept the behaviour, and would have stayed green for a guard spelled right
 * and wired to the wrong variable. The hook now writes exactly the pairs
 * `viewportVars` returns, so the rule is checked on the values themselves.
 */
describe('viewport CSS variables are only written with finite numbers', () => {
  const heights = (viewportHeight: unknown, viewportStableHeight: unknown) =>
    viewportVars({
      viewportHeight: viewportHeight as number,
      viewportStableHeight: viewportStableHeight as number,
    })

  it('a height Telegram has not reported is not written at all', () => {
    for (const missing of [undefined, null, Number.NaN, Infinity, '812']) {
      const vars = heights(missing, missing)
      expect('--app-vh' in vars, `--app-vh for ${String(missing)}`).toBe(false)
      expect('--app-vh-stable' in vars).toBe(false)
    }
  })

  it('each height is judged on its own, and lands in its own variable', () => {
    // Different numbers on purpose: with equal ones a swap goes unnoticed.
    expect(heights(516, undefined)).toEqual({
      '--app-top-inset': '0px',
      '--app-vh': '516px',
    })
    expect(heights(undefined, 852)).toEqual({
      '--app-top-inset': '0px',
      '--app-vh-stable': '852px',
    })
  })

  it('nothing that is written can invalidate a calc()', () => {
    const inputs: unknown[] = [undefined, Number.NaN, 0, 516, 852.5]
    for (const live of inputs) {
      for (const stable of inputs) {
        for (const value of Object.values(heights(live, stable))) {
          expect(value).toMatch(/^\d+(\.\d+)?px$/)
        }
      }
    }
  })
})
