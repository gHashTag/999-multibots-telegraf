/**
 * Ratchet: createAudioFileFromText's 404 fallback must be BOUNDED -- it recurses
 * with the fallback voice, and getFallbackVoiceId() is a constant. Without a base
 * case, a fallback voice that itself returns 404 re-enters the 404 branch and
 * recurses with the SAME constant forever: one paid TTS request becomes an
 * unbounded ElevenLabs call loop that never delivers (charged-not-delivered +
 * resource exhaustion). The bottom catch(fallbackError) cannot stop it -- the
 * recursive call recurses, it does not throw.
 *
 * The fix adds a base case BEFORE the recursion: if voice_id === fallbackVoiceId
 * (already on the fallback), throw VoiceNotFoundError instead of recursing. This
 * pins the ordering: the equality refuse-guard that throws must precede the
 * recursive self-call. Refuse/bound direction (no credit, no charge change) ->
 * autonomous. loop-fable iter256 (wave22 recent-change adversarial review).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../core/elevenlabs/createAudioFileFromText.ts'
)

function analyze(source: string): {
  functionFound: boolean
  recursionPresent: boolean
  guardBeforeRecursion: boolean
} {
  const sf = ts.createSourceFile('r.ts', source, ts.ScriptTarget.Latest, true)

  // Locate the createAudioFileFromText arrow assigned to a const.
  let fn: ts.Node | undefined
  const findFn = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'createAudioFileFromText' &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) ||
        ts.isFunctionExpression(n.initializer))
    ) {
      fn = n.initializer
    }
    if (!fn) n.forEachChild(findFn)
  }
  findFn(sf)
  if (!fn) {
    return {
      functionFound: false,
      recursionPresent: false,
      guardBeforeRecursion: false,
    }
  }

  const isId = (n: ts.Node, name: string): boolean =>
    ts.isIdentifier(n) && n.text === name

  const recursionPositions: number[] = []
  const guardPositions: number[] = []

  const bodyHasThrow = (node: ts.Node): boolean => {
    let found = false
    const w = (n: ts.Node): void => {
      if (ts.isThrowStatement(n)) found = true
      n.forEachChild(w)
    }
    w(node)
    return found
  }

  const visit = (n: ts.Node): void => {
    // recursive self-call: createAudioFileFromText(...)
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'createAudioFileFromText'
    ) {
      recursionPositions.push(n.getStart(sf))
    }
    // base-case guard: if (voice_id === fallbackVoiceId) { ... throw ... }
    if (ts.isIfStatement(n) && ts.isBinaryExpression(n.expression)) {
      const b = n.expression
      const eq = b.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      const pair =
        (isId(b.left, 'voice_id') && isId(b.right, 'fallbackVoiceId')) ||
        (isId(b.left, 'fallbackVoiceId') && isId(b.right, 'voice_id'))
      if (eq && pair && bodyHasThrow(n.thenStatement)) {
        guardPositions.push(n.getStart(sf))
      }
    }
    n.forEachChild(visit)
  }
  visit(fn)

  const firstRecursion = recursionPositions.length
    ? Math.min(...recursionPositions)
    : Infinity
  const firstGuard = guardPositions.length
    ? Math.min(...guardPositions)
    : Infinity

  return {
    functionFound: true,
    recursionPresent: recursionPositions.length > 0,
    guardBeforeRecursion: firstGuard < firstRecursion,
  }
}

describe('createAudioFileFromText bounds its 404 fallback recursion', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the function still recurses with the fallback voice', () => {
    expect(a.functionFound).toBe(true)
    expect(a.recursionPresent).toBe(true)
  })

  it('a voice_id === fallbackVoiceId throw-guard precedes the recursion', () => {
    expect(a.guardBeforeRecursion).toBe(true)
  })

  it('self-check: recursion without a preceding base case is detected', () => {
    const bad = `export const createAudioFileFromText = async ({ text, voice_id, telegram_id }) => {
      const fallbackVoiceId = getFallbackVoiceId()
      return await createAudioFileFromText({ text, voice_id: fallbackVoiceId, telegram_id })
    }`
    const rb = analyze(bad)
    expect(rb.functionFound).toBe(true)
    expect(rb.recursionPresent).toBe(true)
    expect(rb.guardBeforeRecursion).toBe(false)

    const good = `export const createAudioFileFromText = async ({ text, voice_id, telegram_id }) => {
      const fallbackVoiceId = getFallbackVoiceId()
      if (voice_id === fallbackVoiceId) {
        throw new VoiceNotFoundError(voice_id)
      }
      return await createAudioFileFromText({ text, voice_id: fallbackVoiceId, telegram_id })
    }`
    const rg = analyze(good)
    expect(rg.guardBeforeRecursion).toBe(true)
  })

  it('mutation: neutralizing the real base-case condition turns the check RED', () => {
    // Revert the actual fix (the equality base case) and prove the detector fires.
    const mutated = source.replace(
      'if (voice_id === fallbackVoiceId) {',
      'if (false) {'
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).guardBeforeRecursion).toBe(false)
  })
})
