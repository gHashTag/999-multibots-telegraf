import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE SIDEWAYS ROW OF /crm STARTS IN LINE WITH THE PAGE AND RUNS TO THE EDGE.
 *
 * Measured at 390px (CRM mobile loop, tick 2, 01.10.2026): the heading,
 * search and cards started at x=10, the section tabs at x=26 -- the shared
 * strip's own 16px inset sat on top of the page's. The funnel row stopped at
 * the page inset and cut its last chip mid-word, with nothing saying the row
 * scrolls. After the fix all of them start at x=10 on 320, 390 and 1000px,
 * and both rows faded out at the screen edge. The funnel has since stopped
 * scrolling at all -- it wraps (see "/crm at a phone's width" below).
 *
 * jsdom has no layout, so this holds the rule the measurement settled on:
 * both rows bleed out by the page inset and take it back as their padding,
 * and the page inset is one named value on every breakpoint.
 */

const sheet = fs
  .readFileSync(path.join(__dirname, 'Crm.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const funnelSheet = fs
  .readFileSync(
    path.join(__dirname, '../components/Crm/FunnelStrip.css'),
    'utf8'
  )
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of one `@media` block of a sheet, nested rules and all. */
function mediaBlock(query: string, css = sheet): string {
  const at = css.indexOf(`@media ${query}`)
  expect(at).toBeGreaterThan(-1)
  const open = css.indexOf('{', at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`unclosed @media ${query}`)
}

/** Declarations of every rule whose selector list names this selector. */
function rulesFor(selector: string, css = sheet): Record<string, string>[] {
  const out: Record<string, string>[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map(s => s.trim().replace(/\s+/g, ' '))
    if (!selectors.includes(selector)) continue
    out.push(
      Object.fromEntries(
        m[2]
          .split(';')
          .map(d => d.split(':'))
          .filter(p => p.length >= 2)
          .map(([k, ...v]) => [k.trim(), v.join(':').trim()])
      )
    )
  }
  return out
}

describe('/crm insets', () => {
  it('the section strip bleeds through the page inset and keeps it as padding', () => {
    const rule = Object.assign({}, ...rulesFor('.crm > .section-strip'))
    expect(rule['margin-inline']).toBe('calc(-1 * var(--crm-pad))')
    expect(rule['padding-left']).toBe('var(--crm-pad)')
    expect(rule['mask-image']).toContain('var(--crm-pad)')
  })

  it('the page padding is the named inset on every breakpoint', () => {
    const pages = rulesFor('.crm').filter(r => r.padding)
    expect(pages.length).toBeGreaterThanOrEqual(2)
    for (const r of pages) {
      expect(r.padding).toMatch(/var\(--crm-pad\)$/)
    }
    // Each padding has a matching value for the inset it reads.
    const insets = rulesFor('.crm').filter(r => r['--crm-pad'])
    expect(insets.length).toBe(pages.length)
  })
})

/**
 * /crm AT A PHONE'S WIDTH. `tri shot crm` measured the page red at 390 and
 * 320px on 2026-10-02: the funnel row 478px in a 390px screen, names and
 * facts cut by an ellipsis, the name link a 20px strip, t.me a 28x16 speck,
 * the "..." button 36px wide, the search field running under its own clear
 * button, and at 320 the filter chips 327px in a 300px row. Each fix is held
 * here; jsdom lays nothing out, so the rules are what is pinned.
 */
describe("/crm at a phone's width", () => {
  const merged = (selector: string, css = sheet) =>
    Object.assign({}, ...rulesFor(selector, css)) as Record<string, string>

  it('the funnel wraps, never scrolls sideways or bleeds', () => {
    const row = merged('.crm-funnel__stages', funnelSheet)
    expect(row['flex-wrap']).toBe('wrap')
    expect(row['overflow-x']).toBeUndefined()
    // Each line is filled edge to edge rather than leaving a ragged gap.
    expect(merged('.crm-funnel__chip', funnelSheet).flex).toBe('1 1 auto')
    // Nothing past the edge, so no bleed and no fade.
    expect(rulesFor('.crm .crm-funnel__stages')).toEqual([])
  })

  it.each([
    '.crm__contact-name',
    '.crm__contact-facts',
    '.crm__who .crm__open',
  ])('%s wraps a long name rather than cutting it', selector => {
    for (const r of rulesFor(selector)) {
      expect(r['white-space']).not.toBe('nowrap')
      expect(r['text-overflow']).toBeUndefined()
    }
    expect(merged(selector)['overflow-wrap']).toBe('anywhere')
  })

  it("the name and t.me are each a finger's size", () => {
    expect(merged('.crm__open')['min-height']).toBe('var(--touch-target, 44px)')
    const tme = merged('.crm__who .crm__tme')
    expect(tme['min-width']).toBe('var(--touch-target, 44px)')
    expect(tme['min-height']).toBe('var(--touch-target, 44px)')
    // On a phone it stands beside name-over-stage, across both lines.
    const phone = mediaBlock('(max-width: 480px)')
    expect(
      merged('.crm__who:has(> .crm-avatar)', phone)['grid-template-columns']
    ).toBe('auto minmax(0, 1fr) auto')
    expect(
      merged('.crm__who:has(> .crm-avatar) > .crm__tme', phone)['grid-row']
    ).toBe('1 / span 2')
  })

  it('"..." is 44px wide at every width, and AUTO\'s column follows it', () => {
    const widths = rulesFor('.crm__contact-toggle')
      .map(r => r.width)
      .filter(Boolean)
    expect(widths).toEqual(['var(--touch-target, 44px)'])
    // The AUTO heading sits over the ticks: row padding 6 + border 1 +
    // "..." 44 + the gap (8, or 6 at 320).
    expect(
      merged('.crm__col-auto', mediaBlock('(max-width: 480px)')).margin
    ).toBe('0 59px 0 auto')
    expect(
      merged('.crm__col-auto', mediaBlock('(max-width: 359px)'))['margin-right']
    ).toBe('57px')
  })

  it('the search box is the label; glyph, field and clear sit side by side', () => {
    const box = merged('.crm__search')
    expect(box.border).toBeDefined()
    expect(box['min-height']).toBe('var(--touch-target, 44px)')
    expect(box.position).toBeUndefined()
    expect(merged('.crm__search:focus-within')['border-color']).toBeDefined()
    expect(merged('.crm__search .crm__glyph').position).toBeUndefined()
    expect(merged('.crm__search-clear').position).toBeUndefined()
    const field = merged('.crm__search input')
    expect(field.border).toBe('0')
    // No room reserved under a button laid on top of the field.
    expect(field.padding).not.toMatch(/44px/)
    // design-system.css rings every focused input; inside the box that was
    // a second box.
    expect(merged('.crm__search input:focus')['box-shadow']).toBe('none')
  })

  it('at 320 the filter chips wrap rather than hide one past the edge', () => {
    const narrow = mediaBlock('(max-width: 359px)')
    const row = merged('.crm__filter', narrow)
    expect(row['flex-wrap']).toBe('wrap')
    expect(row['overflow-x']).toBe('visible')
  })

  it("AUTO's hidden word uses the recipe tri shot knows is hidden on purpose", () => {
    // The word is for screen readers (CrmCockpit.test pins it); tri shot
    // counted it as "cut 33>1" in every row until it learnt the recipe.
    // That tri shot knows it is pinned in crmShotRecipe.test.ts: shot.mjs is
    // outside the player image, and this file runs in the deploy gate.
    const phone = mediaBlock('(max-width: 480px)')
    expect(merged('.crm__auto-word', phone)['clip-path']).toBe('inset(50%)')
  })
})
