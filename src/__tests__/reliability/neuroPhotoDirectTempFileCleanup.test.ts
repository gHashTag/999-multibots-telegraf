/**
 * Ratchet: generateNeuroPhotoDirect removes the orphaned local copy it saves.
 *
 * Inside the per-image loop the flagship service calls saveFileLocally() to
 * write the generated .jpg, but the served reference (localImageUrl) and the
 * pulse media both use the REMOTE imageUrl, and the local path is never turned
 * into a /uploads URL -- so it is a true orphan (verified: it is only saved,
 * checked, logged). Without cleanup it leaks one .jpg per generated image on the
 * long-running process. The fix unlinks it per loop iteration.
 *
 * This pins it: the file has a saveFileLocally AND an unlink of that path.
 *
 * loop-fable iter208 (savefilelocally leak class, orphan-in-a-loop). Distinct
 * from the deliver-remote trio ratchet (those unlink in a finally; this one
 * unlinks in the loop body right after the save, since a single outer finally
 * would only clean the last iteration).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../services/generateNeuroPhotoDirect.ts'
)

function subtreeHas(n: ts.Node, pred: (m: ts.Node) => boolean): boolean {
  let hit = false
  const w = (m: ts.Node): void => {
    if (pred(m)) hit = true
    m.forEachChild(w)
  }
  w(n)
  return hit
}

function analyze(source: string): { savesFile: boolean; unlinks: boolean } {
  const sf = ts.createSourceFile('n.ts', source, ts.ScriptTarget.Latest, true)
  const savesFile = subtreeHas(
    sf,
    m =>
      ts.isCallExpression(m) &&
      ts.isIdentifier(m.expression) &&
      m.expression.text === 'saveFileLocally'
  )
  const unlinks = subtreeHas(
    sf,
    m =>
      ts.isCallExpression(m) &&
      ts.isPropertyAccessExpression(m.expression) &&
      /^unlink(Sync)?$/.test(m.expression.name.text)
  )
  return { savesFile, unlinks }
}

describe('generateNeuroPhotoDirect cleans up its orphaned local copy', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('still saves a local file (floor)', () => {
    expect(a.savesFile).toBe(true)
  })

  it('unlinks the saved local copy', () => {
    expect(a.unlinks).toBe(true)
  })

  it('self-check: a save with no unlink is detected', () => {
    const bad = `async function g() {
      for (let i=0;i<n;i++){
        const p = await saveFileLocally(id, url, 'x', '.jpg')
        localImageUrl = url
      }
    }`
    const r = analyze(bad)
    expect(r.savesFile).toBe(true)
    expect(r.unlinks).toBe(false)
  })
})
