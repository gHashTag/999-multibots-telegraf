/**
 * Ratchet: every ctx.telegram.getFile in videoTranscriptionWizard is inside a
 * try/catch, so a Telegram 400 on an oversized upload cannot silently drop it.
 *
 * getFile downloads via the Bot API, which caps at ~20MB on api.telegram.org.
 * The video-upload step called getFile with no surrounding try and a 50MB size
 * check AFTER it, so a 20-50MB video threw a 400 at getFile before the check,
 * aborting the step and dropping the user's upload with no message (the step
 * runs before any charge -- paid-input-lost UX, not money). The fix wraps getFile
 * in try/catch that tells the user to send a smaller file or a link.
 *
 * This pins that no getFile in this file sits outside a try. Structural ->
 * self-check + floor + mutation-verified. loop-fable iter218 (wave-18
 * media-handler-throw lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../scenes/videoTranscriptionWizard/index.ts'
)

function nearestTry(n: ts.Node): ts.TryStatement | undefined {
  let p = n.parent
  while (p) {
    if (ts.isTryStatement(p)) return p
    p = p.parent
  }
  return undefined
}

function analyze(source: string): { getFileCalls: number; guarded: number } {
  const sf = ts.createSourceFile('v.ts', source, ts.ScriptTarget.Latest, true)
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

describe('videoTranscription getFile is guarded (no silent upload drop)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the wizard still calls getFile on the upload', () => {
    expect(a.getFileCalls).toBeGreaterThanOrEqual(1)
  })

  it('every getFile call is inside a try block', () => {
    expect(a.guarded).toBe(a.getFileCalls)
  })

  it('self-check: a bare getFile is detected', () => {
    const bad = `async function h(ctx) {
      const f = await ctx.telegram.getFile(id)
      return f.file_path
    }`
    const rb = analyze(bad)
    expect(rb.getFileCalls).toBe(1)
    expect(rb.guarded).toBe(0)

    const good = `async function h(ctx) {
      let f
      try { f = await ctx.telegram.getFile(id) } catch (e) { await ctx.reply('too big'); return }
      return f.file_path
    }`
    const rg = analyze(good)
    expect(rg.getFileCalls).toBe(1)
    expect(rg.guarded).toBe(1)
  })
})
