/**
 * Ratchet: the AI Reels Render cost DISPLAY matches the actual Step 6 charge.
 *
 * The composite-title step showed a cost breakdown computed with a stale x2
 * markup: ceil((160 + dur*14) * 2) -- ~600 stars for a 10s clip. But Step 6
 * charges estimatedCost = veo3Cost(240) + dur * hedraPerSecond(7) -- ~310. So
 * the user was quoted ~2x what was actually deducted (a trust/accuracy bug).
 *
 * The fix aligns the display formula to the charge: veo3Cost=240,
 * hedraPerSecond=7, finalCost = baseCost (no *2). This pins it: the file's cost
 * CODE must not carry the stale 160 / 14 / *2 display formula (comments that
 * document 160 x1.5 = 240 are stripped and allowed).
 *
 * loop-fable iter209 (backlog ai-reels-render-display-charge-mismatch, from
 * wave-4 iter198). Display-only alignment; the charge is unchanged.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const FILE = path.resolve(
  __dirname,
  '../../scenes/lipSyncWizard/ai-reels-render-wizard.ts'
)

const stripComments = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

function analyze(source: string) {
  const code = stripComments(source)
  return {
    staleVeo3: /\bveo3Cost\s*=\s*160\b/.test(code),
    staleHedra: /\bhedraPerSecond\s*=\s*14\b/.test(code),
    staleMarkup: /baseCost\s*\*\s*2\b/.test(code),
    hasVeo3: /\bveo3Cost\s*=/.test(code),
    hasHedra: /\bhedraPerSecond\s*=/.test(code),
  }
}

describe('AI Reels Render cost display matches the Step 6 charge', () => {
  const a = analyze(fs.readFileSync(FILE, 'utf8'))

  it('still has the cost variables this ratchet guards (floor)', () => {
    expect(a.hasVeo3).toBe(true)
    expect(a.hasHedra).toBe(true)
  })

  it('no stale x2 display formula (veo3Cost=160 / hedraPerSecond=14 / baseCost*2)', () => {
    expect(a.staleVeo3).toBe(false)
    expect(a.staleHedra).toBe(false)
    expect(a.staleMarkup).toBe(false)
  })

  it('self-check: the stale display formula is detected', () => {
    const bad = `const veo3Cost = 160
      const hedraPerSecond = 14
      const baseCost = veo3Cost + dur * hedraPerSecond
      const finalCost = Math.ceil(baseCost * 2)`
    const r = analyze(bad)
    expect(r.staleVeo3).toBe(true)
    expect(r.staleHedra).toBe(true)
    expect(r.staleMarkup).toBe(true)
  })
})
