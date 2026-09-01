/**
 * Ratchet: generateAIReelsFunction's notify-telegram delivery handoff THROWS on a
 * non-2xx response, so a failed handoff surfaces (Inngest retries / marks the run
 * failed) instead of silently reporting success.
 *
 * The ai-reels scene charges the user (MONEY_OUTCOME) BEFORE dispatching
 * 'ai-reels/generate'. This function's notify-telegram step POSTs to the
 * ai-reels-callback route -- the SOLE trigger that delivers the finished reel to
 * the user. The step used to do `if (!response.ok) { logger.warn(...) }` with no
 * throw: on a non-2xx (a Railway edge 502 during deploy, a 4xx) the step returned
 * normally, the function returned { success: true }, retries never fired, and the
 * paid reel was orphaned -- a silent charged-not-delivered (found by the iter236
 * inngest wave, swallowed-delivery-after-charge lens, adversarially + hand
 * verified). The callback is idempotent (delivered-job-ids dedup +
 * aiReelsCallbackDeliveryIdempotency), so a retry re-attempts delivery without
 * duplicating, and prior generation steps are memoized (no re-charge).
 *
 * This pins: every `if (!response.ok)` block in the file contains a throw.
 * floor + self-check + real-source mutation.
 *
 * loop-fable iter236.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../inngest_app/functions/existing/generateAIReelsFunction.ts'
)

/** Is `n` an `if (!response.ok)` statement? */
function isNotResponseOk(n: ts.Node): n is ts.IfStatement {
  if (!ts.isIfStatement(n)) return false
  const c = n.expression
  return (
    ts.isPrefixUnaryExpression(c) &&
    c.operator === ts.SyntaxKind.ExclamationToken &&
    ts.isPropertyAccessExpression(c.operand) &&
    ts.isIdentifier(c.operand.expression) &&
    c.operand.expression.text === 'response' &&
    c.operand.name.text === 'ok'
  )
}

function hasThrow(node: ts.Node): boolean {
  let found = false
  const walk = (m: ts.Node): void => {
    if (ts.isThrowStatement(m)) found = true
    m.forEachChild(walk)
  }
  walk(node)
  return found
}

function analyze(source: string): { total: number; swallowed: number } {
  const sf = ts.createSourceFile(
    'generateAIReelsFunction.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  let total = 0
  let swallowed = 0
  const visit = (n: ts.Node): void => {
    if (isNotResponseOk(n)) {
      total++
      if (!hasThrow(n.thenStatement)) swallowed++
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { total, swallowed }
}

describe('generateAIReelsFunction delivery handoff surfaces a non-2xx (no silent charged-not-delivered)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the function still checks the delivery response (!response.ok)', () => {
    expect(a.total).toBeGreaterThanOrEqual(1)
  })

  it('every !response.ok block throws (does not swallow the failure)', () => {
    expect(
      a.swallowed,
      `A generateAIReelsFunction !response.ok block only logs and does not throw. ` +
        `The user was charged before dispatch and this callback is the sole ` +
        `delivery trigger, so a swallowed non-2xx is a silent charged-not-delivered. ` +
        `Throw so Inngest retries / marks the run failed.`
    ).toBe(0)
  })

  it('self-check: detector distinguishes a swallowing block from a throwing one', () => {
    const bad = `async function f() { if (!response.ok) { logger.warn('x') } }`
    const good = `async function f() { if (!response.ok) { logger.warn('x'); throw new Error('y') } }`
    expect(analyze(bad).swallowed).toBe(1)
    expect(analyze(good).swallowed).toBe(0)
  })

  it('mutation: removing the real throw turns the check RED', () => {
    const mutated = source.replace(
      /throw new Error\(\s*`AI Reels delivery webhook failed:[\s\S]*?`\s*\)/,
      'void 0'
    )
    expect(mutated).not.toEqual(source)
    expect(analyze(mutated).swallowed).toBeGreaterThan(0)
  })
})
