/**
 * Ratchet: ai-reels-wizard's pre-charge voice check degrades gracefully.
 *
 * A bare checkVoiceExists() returns false on any non-authoritative result too
 * (no/invalid ElevenLabs key, outage), so using its false to force the user to
 * recreate their voice wrongly blocks users whose voice still exists (live
 * during the current key gap). The fix uses assertVoiceExistsAuthoritative --
 * which throws on "cannot determine" -- inside a try that proceeds on throw, so
 * only a DEFINITIVE absence forces recreate.
 *
 * This pins it: the assertVoiceExistsAuthoritative call(s) in the scene must sit
 * inside a try (the throw is handled), never left to reject.
 *
 * loop-fable iter198 (backlog from bug-hunt-wave3; consistent with #1496).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../scenes/lipSyncWizard/ai-reels-wizard.ts'
)

function callName(n: ts.CallExpression): string {
  const e = n.expression
  return ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ''
}

/**
 * Does the INNERMOST try whose tryBlock directly contains `n` have a catch that
 * PROCEEDS -- i.e. sets `isVoiceValid = true`? A bare "inside some try" check is
 * a false ruler: the wizard step is wrapped in a big outer try, so it is always
 * true. We need the graceful-proceed catch specifically.
 */
function gracefullyHandled(n: ts.Node, sf: ts.SourceFile): boolean {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (
      ts.isTryStatement(c) &&
      n.getStart(sf) >= c.tryBlock.getStart(sf) &&
      n.getEnd() <= c.tryBlock.getEnd()
    ) {
      // innermost enclosing try -- its catch must set the valid flag to true
      const catchText = c.catchClause ? c.catchClause.block.getText(sf) : ''
      return /\bisVoiceValid\s*=\s*true\b/.test(catchText)
    }
    c = c.parent
  }
  return false
}

function analyze(source: string) {
  const sf = ts.createSourceFile(
    'ai-reels-wizard.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const calls: { line: number; inTry: boolean }[] = []
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      callName(n) === 'assertVoiceExistsAuthoritative'
    ) {
      calls.push({
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        inTry: gracefullyHandled(n, sf),
      })
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return calls
}

describe('ai-reels voice check degrades gracefully', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const calls = analyze(source)

  it('self-check: detector requires a PROCEEDING catch, not just any try', () => {
    const proceeds = `async function f(){ let isVoiceValid = true; try { isVoiceValid = await assertVoiceExistsAuthoritative(v) } catch(e){ isVoiceValid = true } }`
    // False-ruler guards: a try whose catch does NOT proceed, and an outer try
    // wrapping a bare call (the trap the first version of this ratchet fell for).
    const emptyCatch = `async function f(){ try { const ok = await assertVoiceExistsAuthoritative(v) } catch(e){} }`
    const outerTryBareCall = `async function f(){ try { const ok = await assertVoiceExistsAuthoritative(v); doStuff() } catch(e){ handle() } }`
    expect(analyze(proceeds).every(c => c.inTry)).toBe(true)
    expect(analyze(emptyCatch).some(c => c.inTry)).toBe(false)
    expect(analyze(outerTryBareCall).some(c => c.inTry)).toBe(false)
  })

  it('the scene uses assertVoiceExistsAuthoritative (not only bare checkVoiceExists)', () => {
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })

  it('every assertVoiceExistsAuthoritative call has a proceeding catch', () => {
    const bare = calls.filter(c => !c.inTry)
    expect(
      bare.map(c => c.line),
      `ai-reels-wizard calls assertVoiceExistsAuthoritative whose innermost try ` +
        `does not set isVoiceValid = true in its catch (lines: ${bare
          .map(c => c.line)
          .join(
            ', '
          )}). It throws on a non-authoritative result; the catch must ` +
        `proceed, so a key gap/outage does not force voice recreation.`
    ).toEqual([])
  })
})
