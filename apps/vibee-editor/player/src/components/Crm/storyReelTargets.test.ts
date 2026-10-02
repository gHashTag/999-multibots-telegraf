import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * EVERY PRESS ON THE STORY PANEL IS THUMB-SIZED.
 *
 * Measured by `tri shot story-palette` at 390px (2026-10-02), once the stand
 * could open the panel's "More" again: the four topic ideas were 32px tall
 * and the "send to DM" toggle was a 24px line -- under the finger on every
 * phone. jsdom has no layout, so this holds the rule the measurement settled
 * on: each of them reads the shared touch target, never a smaller literal.
 */

const sheet = fs
  .readFileSync(path.join(__dirname, 'StoryReelPanel.css'), 'utf8')
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

describe('story panel touch targets', () => {
  it.each([
    '.story-reel__quick button',
    '.story-reel__dm',
    '.story-reel__photo-btn',
  ])('%s is at least the shared touch target', selector => {
    const rules = rulesFor(selector)
    expect(rules.length).toBeGreaterThan(0)
    const heights = rules.map(r => r['min-height']).filter(Boolean)
    expect(heights.length).toBeGreaterThan(0)
    // Every declaration, including any breakpoint, reads the shared value.
    for (const h of heights) expect(h).toBe('var(--touch-target, 44px)')
    for (const r of rules) {
      if (r.height && r.height !== 'auto') {
        throw new Error(`${selector} pins height: ${r.height}`)
      }
    }
  })
})

describe('story panel history rows', () => {
  it('a reel topic wraps instead of being cut with an ellipsis', () => {
    const rule = Object.assign({}, ...rulesFor('.story-reel__job-topic'))
    expect(rule['white-space']).toBeUndefined()
    expect(rule['text-overflow']).toBeUndefined()
    expect(rule['overflow-wrap']).toBe('anywhere')
  })
})
