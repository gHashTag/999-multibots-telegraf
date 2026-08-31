/**
 * Ratchet: generateFluxKontextPro removes the local image it saves (no leak).
 *
 * The service calls saveFileLocally() to write the generated PNG to disk, but
 * delivers via the REMOTE imageUrl (ctx.replyWithPhoto({ url })). The local copy
 * is only logged and never used -- and was never unlinked on the success or the
 * error path, orphaning one PNG per call and slowly filling the uploads dir of
 * the long-running multi-bot process. The Max sibling already tracks + unlinks
 * it; this pins the same on Pro: an fs.unlink in a finally so cleanup is
 * guaranteed on every path.
 *
 * loop-fable iter206 (wave-11 temp-file-cleanup-leak lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../services/generateFluxKontextPro.ts')

function subtreeHas(n: ts.Node, pred: (m: ts.Node) => boolean): boolean {
  let hit = false
  const w = (m: ts.Node): void => {
    if (pred(m)) hit = true
    m.forEachChild(w)
  }
  w(n)
  return hit
}

const isUnlink = (m: ts.Node): boolean =>
  ts.isCallExpression(m) &&
  ts.isPropertyAccessExpression(m.expression) &&
  /^unlink(Sync)?$/.test(m.expression.name.text)

function analyze(source: string): {
  savesFile: boolean
  unlinkInFinally: boolean
} {
  const sf = ts.createSourceFile('f.ts', source, ts.ScriptTarget.Latest, true)
  const savesFile = subtreeHas(
    sf,
    m =>
      ts.isCallExpression(m) &&
      ts.isIdentifier(m.expression) &&
      m.expression.text === 'saveFileLocally'
  )
  let unlinkInFinally = false
  const visit = (n: ts.Node): void => {
    if (ts.isTryStatement(n) && n.finallyBlock) {
      if (subtreeHas(n.finallyBlock, isUnlink)) unlinkInFinally = true
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { savesFile, unlinkInFinally }
}

describe('generateFluxKontextPro cleans up its saved local image', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  // matcher-not-stale floor: it still writes a local file to clean up.
  it('still saves a local file via saveFileLocally', () => {
    expect(a.savesFile).toBe(true)
  })

  it('unlinks the saved file in a finally (guaranteed on success + error)', () => {
    expect(a.unlinkInFinally).toBe(true)
  })

  it('self-check: a save with no finally-unlink is detected', () => {
    const bad = `async function g() {
      try {
        const p = await saveFileLocally(id, url, 'x', '.png')
        await ctx.replyWithPhoto({ url })
        return { image: url }
      } catch (e) { throw e }
    }`
    const r = analyze(bad)
    expect(r.savesFile).toBe(true)
    expect(r.unlinkInFinally).toBe(false)
  })
})
