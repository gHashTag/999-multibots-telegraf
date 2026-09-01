/**
 * Ratchet: every ctx.telegram.getFile on a paid photo-upload handler
 * (faceSwapWizard, morphingWizard) is inside a try/catch, so a transient getFile
 * failure (or a file above the ~20MB Bot API download limit) cannot silently
 * drop the user's uploaded photo.
 *
 * Generalises videoTranscriptionGetFileGuarded (#1563, the video case) to the
 * paid photo-upload scenes found by a getFile sweep. Photos are compressed below
 * 20MB so the size-throw is unlikely, but an unguarded getFile still drops the
 * paid input on any transient error with no message to the user. Fix wraps each
 * getFile in try/catch that asks the user to resend.
 *
 * loop-fable iter219 (getFile sweep). The dead uploadVideoScene (never
 * scene.enter'd, PricingStrategy.FREE) is intentionally excluded. Structural ->
 * self-check + floor + mutation-verified per file.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILES = [
  path.resolve(__dirname, '../../scenes/faceSwapWizard/index.ts'),
  path.resolve(__dirname, '../../scenes/morphingWizard/index.ts'),
]

function nearestTry(n: ts.Node): ts.TryStatement | undefined {
  let p = n.parent
  while (p) {
    if (ts.isTryStatement(p)) return p
    p = p.parent
  }
  return undefined
}

function analyze(source: string): { getFileCalls: number; guarded: number } {
  const sf = ts.createSourceFile('u.ts', source, ts.ScriptTarget.Latest, true)
  let total = 0
  let guarded = 0
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'getFile'
    ) {
      total++
      const t = nearestTry(n)
      if (t) {
        const start = n.getStart(sf)
        if (start >= t.tryBlock.getStart(sf) && start < t.tryBlock.getEnd())
          guarded++
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { getFileCalls: total, guarded }
}

describe('paid photo-upload getFile is guarded (no silent drop)', () => {
  for (const file of FILES) {
    const name = path.basename(path.dirname(file))
    const a = analyze(fs.readFileSync(file, 'utf8'))

    it(`floor: ${name} still calls getFile on an upload`, () => {
      expect(a.getFileCalls).toBeGreaterThanOrEqual(1)
    })

    it(`${name}: every getFile is inside a try block`, () => {
      expect(a.guarded).toBe(a.getFileCalls)
    })
  }

  it('self-check: a bare getFile is detected', () => {
    const bad = `async function h(ctx) { const f = await ctx.telegram.getFile(id); return f.file_path }`
    const rb = analyze(bad)
    expect(rb.getFileCalls).toBe(1)
    expect(rb.guarded).toBe(0)

    const good = `async function h(ctx) { let f; try { f = await ctx.telegram.getFile(id) } catch (e) { await ctx.reply('x'); return }; return f.file_path }`
    const rg = analyze(good)
    expect(rg.getFileCalls).toBe(1)
    expect(rg.guarded).toBe(1)
  })
})
