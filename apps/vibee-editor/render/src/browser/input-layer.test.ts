import { describe, it, expect } from 'vitest'
import { BRAND_CSS } from './skin'

/**
 * THE LAYER THAT TAKES THE TAPS MUST STAY.
 *
 * 2026-09-22 to 23: the owner could not press anything in their own browser
 * by hand. The skin hid ".overlay" to remove neko's "click to unmute" slab,
 * and neko's input layer -- a textarea with the same class -- went with it.
 * The tap report from their window read: elementFromPoint "video",
 * hosting true. These tests are that day, written down.
 */
describe('the input layer of the window', () => {
  it('is never hidden by the unmute rule: only DIVs are', () => {
    const css = BRAND_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const hidden = css.match(/[^{}]*\{[^}]*display:\s*none[^}]*\}/g) ?? []
    for (const rule of hidden) {
      const selectors = rule.slice(0, rule.indexOf('{'))
      if (!/overlay/.test(selectors)) continue
      expect(selectors).not.toMatch(/(^|[\s,>])\.overlay/)
      expect(selectors).not.toMatch(/textarea/)
    }
  })

  it('is kept clickable, so a tap asks for control when nobody holds it', () => {
    const rule = BRAND_CSS.match(/textarea\.overlay\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/display:\s*block/)
    expect(rule![1]).toMatch(/pointer-events:\s*auto/)
  })
})
