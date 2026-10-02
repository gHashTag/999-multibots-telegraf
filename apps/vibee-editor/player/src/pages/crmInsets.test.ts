import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE SIDEWAYS ROWS OF /crm START IN LINE WITH THE PAGE AND RUN TO THE EDGE.
 *
 * Measured at 390px (CRM mobile loop, tick 2, 01.10.2026): the heading,
 * search and cards started at x=10, the section tabs at x=26 -- the shared
 * strip's own 16px inset sat on top of the page's. The funnel row stopped at
 * the page inset and cut its last chip mid-word, with nothing saying the row
 * scrolls. After the fix all of them start at x=10 on 320, 390 and 1000px,
 * and both rows fade out at the screen edge.
 *
 * jsdom has no layout, so this holds the rule the measurement settled on:
 * both rows bleed out by the page inset and take it back as their padding,
 * and the page inset is one named value on every breakpoint.
 */

const sheet = fs
  .readFileSync(path.join(__dirname, 'Crm.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Declarations of every rule whose selector list names this selector. */
function rulesFor(selector: string): Record<string, string>[] {
  const out: Record<string, string>[] = []
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
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
  it.each(['.crm > .section-strip', '.crm .crm-funnel__stages'])(
    '%s bleeds through the page inset and keeps it as padding',
    selector => {
      const rule = Object.assign({}, ...rulesFor(selector))
      expect(rule['margin-inline']).toBe('calc(-1 * var(--crm-pad))')
      expect(rule['padding-left']).toBe('var(--crm-pad)')
      expect(rule['mask-image']).toContain('var(--crm-pad)')
    }
  )

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
