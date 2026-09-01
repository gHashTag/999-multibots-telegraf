/**
 * NOTE (iter222 ratchet-liveness audit): getRuBillWizard is a DEAD scene as of
 * this writing -- registered in SceneRegistry but nothing routes to it (ModeEnum.
 * GetRuBillWizard has 0 dispatch references, no enter('getRuBillWizard'); only a
 * helper import (getInvoiceId) and comments mention it). This ratchet is
 * therefore currently VACUOUS: it pins a real invariant but on unreachable code.
 * Left in place (not deleted) so the invariant survives if the scene is revived;
 * the correct cleanup is to delete the dead scene AND this ratchet together
 * (owner). Liveness = union of {ModeEnum dispatch, literal enter('id'), parent
 * chain} -- a single-signal grep is unsound.
 *
 * Ratchet: getRuBillWizard must never leak a caught error into a user reply.
 *
 * The DB-error catch used to interpolate `error.message` straight into the
 * `ctx.reply` shown to the end user (CWE-209: information exposure through an
 * error message) -- raw Postgres/PG-driver text, constraint names, and internal
 * detail reach an untrusted Telegram user. The full error is already captured
 * by console.error + logger.error (with userId + invId) just above, so the user
 * reply needs only a static, generic sentence. This pins the fix: no argument of
 * any `ctx.reply(...)` in this file may reference `error.message` (nor a bare
 * caught-error identifier in a template substitution). Logging `error.message`
 * (console.*, logger.*) stays allowed -- only the user-facing reply is gated.
 *
 * loop-fable iter202 (backlog getRuBill-error-leak, found by the wave-6 hunt).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/getRuBillWizard/index.ts')

/** A `ctx.reply(...)` call expression. */
function isCtxReply(n: ts.Node): n is ts.CallExpression {
  return (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'ctx' &&
    n.expression.name.text === 'reply'
  )
}

/** Does the subtree reference `error.message` (property access)? */
function refsErrorMessage(n: ts.Node): boolean {
  let found = false
  const walk = (m: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(m) &&
      ts.isIdentifier(m.expression) &&
      m.expression.text === 'error' &&
      m.name.text === 'message'
    ) {
      found = true
    }
    m.forEachChild(walk)
  }
  walk(n)
  return found
}

function analyze(source: string): {
  ctxReplies: number
  catchClauses: number
  leaks: number[]
} {
  const sf = ts.createSourceFile(
    'getRuBillWizard.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  let ctxReplies = 0
  let catchClauses = 0
  const leaks: number[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isCatchClause(n)) catchClauses++
    if (isCtxReply(n)) {
      ctxReplies++
      for (const arg of n.arguments) {
        if (refsErrorMessage(arg)) {
          leaks.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1)
          break
        }
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return { ctxReplies, catchClauses, leaks }
}

describe('getRuBillWizard does not leak caught errors to the user (CWE-209)', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const { ctxReplies, catchClauses, leaks } = analyze(source)

  // matcher-not-stale floor: a renamed/gutted file that parses to zero replies
  // or zero catches would make the leak check vacuously pass. Fail loud instead.
  it('still has the replies and catch blocks this ratchet guards', () => {
    expect(ctxReplies).toBeGreaterThanOrEqual(3)
    expect(catchClauses).toBeGreaterThanOrEqual(1)
  })

  it('no ctx.reply argument interpolates error.message', () => {
    expect(leaks).toEqual([])
  })

  // self-check: the detector must be able to FIRE. If this synthetic leak is not
  // caught, the analyzer is broken and the green above means nothing.
  it('self-check: the analyzer catches an injected error.message leak', () => {
    const bad = `
      async function h(ctx: any) {
        try { await save() } catch (error) {
          await ctx.reply(\`db failed: \${error instanceof Error ? error.message : error}\`)
        }
      }`
    expect(analyze(bad).leaks.length).toBeGreaterThan(0)
  })
})
