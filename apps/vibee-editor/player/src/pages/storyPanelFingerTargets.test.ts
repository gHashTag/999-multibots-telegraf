import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE STORY PANEL IS TAKEN BY A THUMB.
 *
 * Measured with `tri shot story-palette` (real Chromium, 390 px, a coarse
 * pointer, the host's own answers), 27.09.2026: not one control of the
 * story panel reached the page's own --touch-target -- "take" 32 px, the
 * colour fields 24, the topic 24, "watch" 17. The same topic row is the
 * client's own /story page, where she makes her reel herself.
 *
 * jsdom has no layout, so this cannot measure a button; `tri shot` does. What
 * a test CAN hold is what the measurement established: a coarse-pointer block
 * that gives each of those controls the target, placed AFTER their base
 * rules (same specificity -- written before them, it measured as nothing).
 */

const sheet = fs
  .readFileSync(path.join(__dirname, 'CrmClient.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Every `@media (pointer: coarse) { ... }` block, with where it starts. */
function coarseBlocks(css: string): Array<{ at: number; body: string }> {
  const out: Array<{ at: number; body: string }> = []
  const head = /@media\s*\(pointer:\s*coarse\)\s*\{/g
  for (let m = head.exec(css); m; m = head.exec(css)) {
    let depth = 1
    let i = head.lastIndex
    while (depth && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    out.push({ at: m.index, body: css.slice(head.lastIndex, i - 1) })
  }
  return out
}

/** The declarations every selector in the block receives, merged in order. */
function rulesOf(body: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>()
  for (const [, sel, decls] of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const d = Object.fromEntries(
      decls
        .split(';')
        .map(x => x.split(':').map(y => y.trim()))
        .filter(([k, v]) => k && v)
        .map(([k, ...v]) => [k, v.join(':')])
    )
    for (const s of sel.split(',').map(x => x.replace(/\s+/g, ' ').trim()))
      rules.set(s, { ...(rules.get(s) ?? {}), ...d })
  }
  return rules
}

const TARGET = 'var(--touch-target, 44px)'
const block = coarseBlocks(sheet).find(b =>
  b.body.includes('.crm-client__palette-go')
)

describe('the story panel on a phone', () => {
  it('has a coarse-pointer block, after the base rules it overrides', () => {
    expect(block).toBeTruthy()
    for (const base of [
      '.crm-client__palette-go {',
      '.crm-client__duet-go {',
      ".crm-client__palette-edit input[type='color'] {",
    ])
      expect(sheet.indexOf(base)).toBeLessThan(block!.at)
  })

  it('gives every control of the panel the page target', () => {
    const rules = rulesOf(block!.body)
    for (const s of [
      '.crm-client__palette-go',
      '.crm-client__duet-go',
      ".crm-client__duet-start input[type='text']",
      ".crm-client__palette-edit input[type='text']",
      '.crm-client__watch',
    ])
      expect(rules.get(s)?.['min-height'], s).toBe(TARGET)
    const colour = rules.get(".crm-client__palette-edit input[type='color']")
    expect(colour?.width).toBe(TARGET)
    expect(colour?.height).toBe(TARGET)
    // A short word is a narrow target: "watch" in English measured 42 px.
    expect(rules.get('.crm-client__watch')?.['min-width']).toBe(TARGET)
  })

  it('keeps each option one row, its "take" on the right across both lines', () => {
    expect(sheet).toMatch(
      /\.crm-client__palette-fix\s*\{[^}]*display:\s*grid[^}]*\}/
    )
    expect(sheet).toMatch(
      /\.crm-client__palette-fix > \.crm-client__palette-go\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1 \/ span 2;[^}]*\}/
    )
  })
})

/*
 * THE WHOLE CLIENT CARD (tri shot crm-client, turn 14). Measured at 390 px:
 * the pair that sends REAL messages ("yes, send for real" / "cancel") stood
 * at 40 px, the media links at 20, and the heading cut the client's name to
 * "Клиент Анна Вет…" beside "refresh" (cyrillic-ok: the measured text).
 */
const crmSheet = fs
  .readFileSync(path.join(__dirname, 'Crm.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('the client card on a phone', () => {
  it('the action rows reach the target on a finger, after their base rule', () => {
    const block = coarseBlocks(crmSheet).find(b =>
      b.body.includes('.crm__acts button')
    )
    expect(block).toBeTruthy()
    expect(crmSheet.indexOf('.crm__acts button {')).toBeLessThan(block!.at)
    expect(rulesOf(block!.body).get('.crm__acts button')?.['min-height']).toBe(
      TARGET
    )
  })

  it('a media link is a finger-sized target', () => {
    expect(rulesOf(block!.body).get('.crm-client__file')?.['min-height']).toBe(
      TARGET
    )
  })

  it("a narrow screen wraps the client's name instead of cutting it", () => {
    const narrow = /@media\s*\(max-width:\s*480px\)\s*\{([\s\S]*?\})\s*\}/.exec(
      sheet
    )
    expect(narrow).toBeTruthy()
    const h2 = rulesOf(narrow![1]).get('.crm-client__head h2')
    expect(h2?.['white-space']).toBe('normal')
    expect(h2?.['overflow-wrap']).toBe('anywhere')
    // After the one-line base rule, which it has to override.
    expect(sheet.indexOf('.crm-client__head h2 {')).toBeLessThan(narrow!.index)
  })
})
