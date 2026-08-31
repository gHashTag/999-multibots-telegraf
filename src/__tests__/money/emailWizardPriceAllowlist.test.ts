/**
 * Ratchet: emailWizard's setPayments is gated by a paymentOptions allowlist.
 *
 * emailWizard.on('text') parses (stars, amount) out of the user's message via a
 * regex, then creates a Robokassa invoice for `amount` RUB and a PENDING
 * payment crediting `stars`. Because the text is user-controlled, a crafted
 * "buy 6250 stars for 1 RUB" would otherwise mint 6250 stars for 1 RUB. The fix
 * validates the (stars, amount) pair against paymentOptions before proceeding.
 *
 * This pins it: every setPayments call in the scene must have an `if` ancestor
 * whose condition references the allowlist (isValidOption / paymentOptions).
 *
 * loop-fable iter196 (found by the bug-hunt-fresh-lenses workflow, validation lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(__dirname, '../../scenes/emailWizard/index.ts')

function calleeName(n: ts.CallExpression): string {
  const e = n.expression
  return ts.isIdentifier(e)
    ? e.text
    : ts.isPropertyAccessExpression(e)
      ? e.name.text
      : ''
}

/** Does `n` have an `if` ancestor whose condition mentions the allowlist? */
function guardedByAllowlist(n: ts.Node, sf: ts.SourceFile): boolean {
  let c: ts.Node | undefined = n.parent
  while (c) {
    if (
      ts.isIfStatement(c) &&
      /\b(isValidOption|paymentOptions)\b/.test(c.expression.getText(sf))
    ) {
      return true
    }
    c = c.parent
  }
  return false
}

function analyze(source: string) {
  const sf = ts.createSourceFile(
    'emailWizard.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )
  const sites: { line: number; guarded: boolean }[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && calleeName(n) === 'setPayments') {
      sites.push({
        line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
        guarded: guardedByAllowlist(n, sf),
      })
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return sites
}

describe('emailWizard setPayments is allowlist-guarded', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const sites = analyze(source)

  it('self-check: detector distinguishes guarded from unguarded setPayments', () => {
    const guarded = `
      async function h() {
        if (match && isValidOption) {
          await setPayments({ stars, OutSum: amount })
        }
      }
    `
    const bare = `
      async function h() {
        if (match) {
          await setPayments({ stars, OutSum: amount })
        }
      }
    `
    expect(analyze(guarded).map(s => s.guarded)).toEqual([true])
    expect(analyze(bare).map(s => s.guarded)).toEqual([false])
  })

  it('matcher is not stale: the scene still calls setPayments', () => {
    expect(sites.length).toBeGreaterThanOrEqual(1)
  })

  it('every setPayments is gated by a paymentOptions allowlist check', () => {
    const unguarded = sites.filter(s => !s.guarded)
    expect(
      unguarded.map(s => s.line),
      `emailWizard calls setPayments without validating the user-supplied ` +
        `(stars, amount) against paymentOptions -- a crafted message mints stars ` +
        `for a fraction of the price. Gate it: if (match && isValidOption).`
    ).toEqual([])
  })
})
