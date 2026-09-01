/**
 * Ratchet: the AI Reels text-to-speech branch unlinks its temp mp3 on the
 * failure path, not only on success, so a failed upload does not leak a file.
 *
 * createAudioFileFromText writes a temp mp3 to os.tmpdir() and returns its path.
 * The wizard reads it and uploads to Supabase; the happy-path fs.unlink is
 * unreachable if the upload throws. Before the fix audioPath was a const inside
 * the try, so the catch(audioError) could not unlink it and every failed TTS
 * upload orphaned one mp3 in the OS temp dir (found by the iter230 wave-2
 * fresh-lens hunt, tempfile-leak lens, adversarially + hand verified).
 *
 * This pins it: the catch(audioError) block must call fs.unlink (the temp-file
 * cleanup on the failure path). floor (the temp file is still created) +
 * self-check + real-source mutation.
 *
 * loop-fable iter230.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../scenes/lipSyncWizard/ai-reels-wizard.ts'
)

/** Does the subtree contain a call to `<x>.unlink(...)`? */
function hasUnlink(node: ts.Node): boolean {
  let found = false
  const walk = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'unlink'
    ) {
      found = true
    }
    n.forEachChild(walk)
  }
  walk(node)
  return found
}

function analyze(source: string): {
  createsTemp: boolean
  audioCatches: number
  audioCatchesWithUnlink: number
} {
  const sf = ts.createSourceFile(
    'ai-reels-wizard.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  let createsTemp = false
  let audioCatches = 0
  let audioCatchesWithUnlink = 0
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'createAudioFileFromText'
    ) {
      createsTemp = true
    }
    if (
      ts.isCatchClause(n) &&
      n.variableDeclaration &&
      ts.isIdentifier(n.variableDeclaration.name) &&
      n.variableDeclaration.name.text === 'audioError'
    ) {
      audioCatches++
      if (hasUnlink(n.block)) audioCatchesWithUnlink++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { createsTemp, audioCatches, audioCatchesWithUnlink }
}

describe('AI Reels TTS branch unlinks its temp mp3 on the failure path', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the branch still creates the temp file and still has an audioError catch', () => {
    expect(a.createsTemp).toBe(true)
    expect(a.audioCatches).toBeGreaterThanOrEqual(1)
  })

  it('every audioError catch unlinks the temp file', () => {
    expect(a.audioCatches).toBe(a.audioCatchesWithUnlink)
  })

  it('self-check: detector distinguishes a catch that unlinks from one that does not', () => {
    const bad = `
      async function h() {
        try { audioPath = await createAudioFileFromText({}) }
        catch (audioError) { await refundAndTell({}) }
      }`
    const good = `
      async function h() {
        try { audioPath = await createAudioFileFromText({}) }
        catch (audioError) { await fs.unlink(audioPath).catch(() => {}) }
      }`
    const b = analyze(bad)
    expect(b.audioCatches).toBe(1)
    expect(b.audioCatchesWithUnlink).toBe(0)
    const g = analyze(good)
    expect(g.audioCatchesWithUnlink).toBe(1)
  })

  it('mutation: removing the real catch unlink turns the check RED', () => {
    const mutated = source.replace(
      /if \(audioPath\) \{\s*await fs\.unlink\(audioPath\)\.catch\(\(\) => \{\}\)\s*\}/,
      ''
    )
    expect(mutated).not.toEqual(source)
    const m = analyze(mutated)
    expect(m.audioCatchesWithUnlink).toBeLessThan(m.audioCatches)
  })
})
