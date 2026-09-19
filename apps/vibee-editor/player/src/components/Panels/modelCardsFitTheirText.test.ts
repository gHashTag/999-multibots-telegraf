import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A MODEL CARD HAS TO BE AS TALL AS ITS TWO LINES -- ON AN IPHONE TOO.
 *
 * The owner's screenshots, 2026-09-17, Photo / Video / Voice tabs inside
 * Telegram on iOS: every model card was a 28px slab, the name sticking out
 * above it and the description below. The cards are <button>s, and the design
 * system gives every button a fixed 28px height and `white-space: nowrap`.
 *
 * The card's rule tried to out-vote that with `min-height: fit-content`.
 * Chromium honours it, WebKit does not for the block axis of a flex item, so
 * the bug existed only on the devices nobody was measuring with. It was
 * reproduced and the fix confirmed in both engines with the real stylesheets
 * (WebKit 28px -> 61px; a long description one clipped line -> four lines).
 *
 * jsdom has no layout, so a test cannot measure a card. What it CAN hold is
 * the one fact the measurement established: as long as buttons get a fixed
 * height globally, the card's base rule must undo it by name and must not
 * lean on a value one engine ignores.
 */

const css = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8')

/** Declarations of the first top-level rule for exactly this selector. */
function baseRule(sheet: string, selector: string): Record<string, string> {
  const noComments = sheet.replace(/\/\*[\s\S]*?\*\//g, '')
  const topLevel = noComments.replace(
    /@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
    ''
  )
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^{}]*)\\}`).exec(
    topLevel
  )
  if (!m) throw new Error(`no base rule for ${selector}`)
  return Object.fromEntries(
    m[1]
      .split(';')
      .map(d => d.split(':'))
      .filter(p => p.length >= 2)
      .map(([k, ...v]) => [k.trim(), v.join(':').trim()])
  )
}

describe('model cards on the generation tabs', () => {
  const design = css('../../styles/design-system.css')
  const panel = css('GeneratePanel.css')
  const card = baseRule(panel, '.model-btn')

  it('the trap is real: every button gets a fixed height and no wrapping', () => {
    // If the design system ever stops doing this, the three checks below are
    // guarding against nothing and should be revisited rather than kept green.
    const everyButton = /\.btn,\s*button\s*\{([^{}]*)\}/.exec(
      design.replace(/\/\*[\s\S]*?\*\//g, '')
    )
    expect(
      everyButton,
      'design-system.css no longer styles every <button>'
    ).not.toBeNull()
    expect(everyButton![1]).toMatch(/height:\s*var\(--button-height-md\)/)
    expect(everyButton![1]).toMatch(/white-space:\s*nowrap/)
    expect(design).toMatch(/--button-height-md:\s*28px/)
  })

  it('the card undoes the fixed height by name', () => {
    expect(card.height).toBe('auto')
  })

  it('its minimum is a length every engine applies, not an intrinsic keyword', () => {
    /*
     * `fit-content`, `min-content` and `max-content` as a block-axis minimum
     * are exactly what WebKit ignored. A finger-sized length works everywhere.
     */
    expect(card['min-height']).toBeDefined()
    expect(card['min-height']).not.toMatch(
      /fit-content|min-content|max-content/
    )
    expect(card['min-height']).toMatch(/px/)
  })

  it('its two lines may wrap, so a long description grows the card instead of being cut', () => {
    expect(card['white-space']).toBe('normal')
  })

  it('no narrower breakpoint brings the fixed height or the nowrap back', () => {
    const inMedia = [
      ...panel
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g),
    ]
      .flatMap(m => [...m[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)])
      .filter(([, sel]) => /(^|[\s,])\.model-btn\s*$/.test(sel.trim()))
      .map(([, , body]) => body)
    // There ARE such rules (padding and wrapping per width); none may set these.
    expect(inMedia.length).toBeGreaterThan(1)
    for (const body of inMedia) {
      expect(body).not.toMatch(/(^|;|\s)height\s*:/)
      expect(body).not.toMatch(/white-space\s*:\s*nowrap/)
    }
  })
})
