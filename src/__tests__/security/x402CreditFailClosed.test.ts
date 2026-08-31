/**
 * Ratchet: every balance-credit path in the x402 routes must be fail-closed.
 *
 * x402 (USDC-on-Base) has NO settlement verification in this project:
 * `validatePaymentHeader` is never called and only checks field presence, and
 * there is no facilitator settle/verify nor any on-chain check of the
 * transaction_hash. Both the GET /x402-topup handler and the POST /x402-payment
 * callback take telegram_id + stars straight from the request. Crediting from
 * those inputs would let anyone who knows a pending inv_id mint balance to any
 * account for any amount.
 *
 * The router is currently NOT mounted, but the file's own posture is to fail
 * closed anyway (a `res.status(501)` refusal before any credit) so that wiring
 * the router later cannot silently open a mint. This test pins that posture:
 * every `updateUserBalance(..., MONEY_INCOME, ...)` call in x402.routes.ts must
 * be preceded, within its enclosing route handler, by a `res.status(501)`
 * response. If a credit path is added or a guard removed, this goes RED.
 *
 * See loop-fable iter189.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const X402_ROUTES = path.resolve(
  __dirname,
  '../../api_server/routes/x402.routes.ts'
)

interface CreditSite {
  line: number
  guardedByFailClosed: boolean
}

/**
 * For the given TypeScript source, return every MONEY_INCOME credit call site
 * and whether a `res.status(501)` response precedes it inside the same
 * enclosing function (route handler).
 */
function analyzeCreditSites(source: string): CreditSite[] {
  const sf = ts.createSourceFile(
    'x402.routes.ts',
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )

  // Positions of every `<expr>.status(501)` call in the file.
  const failClosedPositions: number[] = []
  const collectStatus = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'status' &&
      n.arguments.length > 0 &&
      n.arguments[0].getText(sf) === '501'
    ) {
      failClosedPositions.push(n.getStart(sf))
    }
    n.forEachChild(collectStatus)
  }
  collectStatus(sf)

  const enclosingFunction = (n: ts.Node): ts.Node | undefined => {
    let c: ts.Node | undefined = n.parent
    while (c) {
      if (
        ts.isFunctionDeclaration(c) ||
        ts.isFunctionExpression(c) ||
        ts.isArrowFunction(c) ||
        ts.isMethodDeclaration(c)
      ) {
        return c
      }
      c = c.parent
    }
    return undefined
  }

  const isMoneyIncomeCredit = (n: ts.Node): boolean => {
    if (!ts.isCallExpression(n)) return false
    const e = n.expression
    const name = ts.isIdentifier(e)
      ? e.text
      : ts.isPropertyAccessExpression(e)
        ? e.name.text
        : ''
    if (name !== 'updateUserBalance') return false
    return n.arguments.some(a => /MONEY_INCOME/.test(a.getText(sf)))
  }

  const sites: CreditSite[] = []
  const visit = (n: ts.Node): void => {
    if (isMoneyIncomeCredit(n)) {
      const creditPos = n.getStart(sf)
      const fn = enclosingFunction(n)
      const fnStart = fn ? fn.getStart(sf) : 0
      const guarded = failClosedPositions.some(
        p => p >= fnStart && p < creditPos
      )
      sites.push({
        line: sf.getLineAndCharacterOfPosition(creditPos).line + 1,
        guardedByFailClosed: guarded,
      })
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return sites
}

describe('x402 credit paths are fail-closed', () => {
  const source = fs.readFileSync(X402_ROUTES, 'utf8')
  const sites = analyzeCreditSites(source)

  it('self-check: the detector distinguishes guarded from unguarded credits', () => {
    // A guarded handler: a 501 refusal precedes the credit -> fail-closed.
    const guarded = `
      router.post('/pay', async (req, res) => {
        res.status(501).json({ error: 'nope' })
        return
        await updateUserBalance(req.body.id, req.body.stars, PaymentType.MONEY_INCOME)
      })
    `
    // An unguarded handler: the credit is reachable with no 501 refusal.
    const unguarded = `
      router.post('/pay', async (req, res) => {
        await updateUserBalance(req.body.id, req.body.stars, PaymentType.MONEY_INCOME)
        res.status(200).json({ ok: true })
      })
    `
    const g = analyzeCreditSites(guarded)
    const u = analyzeCreditSites(unguarded)
    expect(g.map(s => s.guardedByFailClosed)).toEqual([true])
    expect(u.map(s => s.guardedByFailClosed)).toEqual([false])
  })

  it('matcher is not stale: finds every credit site (>= 2)', () => {
    // Two credit paths exist today (GET /x402-topup, POST /x402-payment). If the
    // matcher silently finds zero, the main assertion would pass vacuously.
    expect(sites.length).toBeGreaterThanOrEqual(2)
  })

  it('every MONEY_INCOME credit is preceded by a 501 fail-closed response', () => {
    const unguarded = sites.filter(s => !s.guardedByFailClosed)
    expect(
      unguarded,
      `x402.routes.ts has a balance-credit path with no preceding res.status(501) ` +
        `refusal (lines: ${unguarded.map(s => s.line).join(', ')}). ` +
        `x402 has no settlement verification; every credit must fail closed.`
    ).toEqual([])
  })
})
