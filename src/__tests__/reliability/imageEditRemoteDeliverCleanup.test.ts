/**
 * Ratchet (class): image-edit services that saveFileLocally but DELIVER via the
 * remote url must unlink the orphaned local copy.
 *
 * generateFluxKontextPro / generateQwenImageEdit / generateSeedEdit3 each call
 * saveFileLocally() to persist the generated PNG to <dist>/uploads/, but deliver
 * via ctx.replyWithPhoto({ url: imageUrl }) -- so the local copy is never used
 * and, without a finally-unlink, leaks one PNG per call on the long-running
 * process. Pro was fixed in #1537; Qwen + SeedEdit3 in the iter207 enumerate-all
 * sweep (tri leaks). This pins the whole trio.
 *
 * loop-fable iter207 (wave-11 temp-file-cleanup-leak lens, savefilelocally sweep).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILES = [
  'generateFluxKontextPro.ts',
  'generateQwenImageEdit.ts',
  'generateSeedEdit3.ts',
].map(f => path.resolve(__dirname, '../../services', f))

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

describe('deliver-remote image-edit services unlink their saved local copy', () => {
  for (const file of FILES) {
    const name = path.basename(file)
    const a = analyze(fs.readFileSync(file, 'utf8'))

    it(`${name}: still saves a local file (floor)`, () => {
      expect(a.savesFile).toBe(true)
    })

    it(`${name}: unlinks it in a finally`, () => {
      expect(a.unlinkInFinally).toBe(true)
    })
  }

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
