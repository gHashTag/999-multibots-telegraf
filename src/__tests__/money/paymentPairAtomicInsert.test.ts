/**
 * Ratchet: a paired MONEY_INCOME + compensating MONEY_OUTCOME (Golden Foundry
 * club fee, feed-star gift) must be written as ONE atomic multi-row insert --
 * a single setPayments([income, outcome]) call -- never as two separate
 * setPayments({...}) calls.
 *
 * get_user_balance sums every COMPLETED MONEY_INCOME with no subscription_type
 * filter; the compensating outcome is the only thing keeping a club fee / gift
 * from becoming spendable generation balance. With two separate inserts, a
 * transient DB error on the SECOND one left the income committed alone: an
 * orphaned, spendable balance minted at the owner's cost, with no rollback
 * (the branch catch only logs) and no automatic retry (Telegraf does not
 * redeliver a successful_payment after the handler throws). One multi-row
 * INSERT is all-or-nothing in Postgres, so the pair can no longer be
 * half-written.
 *
 * Pins: (a) setPayments accepts an array (Array.isArray branch -> one insert);
 * (b) in the payment handler, every call carrying a paired-outcome
 * service_type is an ARRAY call that also carries a MONEY_INCOME row; (c) no
 * standalone object call carries such an outcome. Atomicity fix (no credit,
 * no charge change) -> autonomous. Found by wave23; loop-fable.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const HANDLER = path.resolve(
  __dirname,
  '../../handlers/paymentHandlers/index.ts'
)
const SETPAY = path.resolve(__dirname, '../../core/supabase/setPayments.ts')

// Outcome service_types that must always be written alongside their income.
const PAIRED_OUTCOMES = ['golden_foundry_membership', 'feed_star_gift']

type CallInfo = {
  isArray: boolean
  types: Set<string>
  serviceTypes: Set<string>
}

function analyzeHandler(source: string): {
  calls: CallInfo[]
  pairAtomic: Record<string, boolean>
  standaloneOutcome: boolean
} {
  const sf = ts.createSourceFile('h.ts', source, ts.ScriptTarget.Latest, true)
  const calls: CallInfo[] = []

  const collect = (node: ts.Node, info: CallInfo): void => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const txt = node.initializer.getText(sf)
      if (node.name.text === 'type') {
        if (/MONEY_INCOME$/.test(txt)) info.types.add('MONEY_INCOME')
        if (/MONEY_OUTCOME$/.test(txt)) info.types.add('MONEY_OUTCOME')
      }
      if (
        node.name.text === 'service_type' &&
        ts.isStringLiteral(node.initializer)
      ) {
        info.serviceTypes.add(node.initializer.text)
      }
    }
    node.forEachChild(c => collect(c, info))
  }

  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'setPayments' &&
      n.arguments.length >= 1
    ) {
      const arg = n.arguments[0]
      const info: CallInfo = {
        isArray: ts.isArrayLiteralExpression(arg),
        types: new Set(),
        serviceTypes: new Set(),
      }
      collect(arg, info)
      calls.push(info)
    }
    n.forEachChild(visit)
  }
  visit(sf)

  const pairAtomic: Record<string, boolean> = {}
  for (const st of PAIRED_OUTCOMES) {
    pairAtomic[st] = calls.some(
      c =>
        c.isArray &&
        c.serviceTypes.has(st) &&
        c.types.has('MONEY_INCOME') &&
        c.types.has('MONEY_OUTCOME')
    )
  }
  const standaloneOutcome = calls.some(
    c => !c.isArray && PAIRED_OUTCOMES.some(st => c.serviceTypes.has(st))
  )
  return { calls, pairAtomic, standaloneOutcome }
}

// setPayments must normalise its input with Array.isArray (array -> one insert).
function setPaymentsAcceptsArray(source: string): boolean {
  const sf = ts.createSourceFile('s.ts', source, ts.ScriptTarget.Latest, true)
  let found = false
  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'isArray' &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === 'Array'
    ) {
      found = true
    }
    n.forEachChild(visit)
  }
  visit(sf)
  return found
}

describe('paired income+outcome payments are one atomic insert', () => {
  const handler = fs.readFileSync(HANDLER, 'utf8')
  const setpay = fs.readFileSync(SETPAY, 'utf8')
  const a = analyzeHandler(handler)

  it('floor: both paired outcome service_types still exist in the handler', () => {
    for (const st of PAIRED_OUTCOMES) {
      expect(handler.includes(`'${st}'`), st).toBe(true)
    }
    expect(a.calls.length).toBeGreaterThan(0)
  })

  it('setPayments accepts an array (one multi-row insert)', () => {
    expect(setPaymentsAcceptsArray(setpay)).toBe(true)
  })

  it('each paired outcome is written in ONE array call together with its income', () => {
    for (const st of PAIRED_OUTCOMES) {
      expect(
        a.pairAtomic[st],
        `${st} is not an atomic income+outcome array call`
      ).toBe(true)
    }
    expect(
      a.standaloneOutcome,
      'a paired outcome is written as a standalone call'
    ).toBe(false)
  })

  it('self-check: two separate object calls are detected; one array call passes', () => {
    const bad = `
      await setPayments({ type: PaymentType.MONEY_INCOME, InvId: p })
      await setPayments({ type: PaymentType.MONEY_OUTCOME, service_type: 'golden_foundry_membership', InvId: p + '_m' })`
    const rb = analyzeHandler(bad)
    expect(rb.pairAtomic['golden_foundry_membership']).toBe(false)
    expect(rb.standaloneOutcome).toBe(true)

    const good = `
      await setPayments([
        { type: PaymentType.MONEY_INCOME, InvId: p },
        { type: PaymentType.MONEY_OUTCOME, service_type: 'golden_foundry_membership', InvId: p + '_m' },
      ])`
    const rg = analyzeHandler(good)
    expect(rg.pairAtomic['golden_foundry_membership']).toBe(true)
    expect(rg.standaloneOutcome).toBe(false)
  })

  it('mutation (setPayments): dropping the array acceptance turns the check RED', () => {
    const mutated = setpay.replace(
      'Array.isArray(input) ? input : [input]',
      '[input]'
    )
    expect(mutated).not.toEqual(setpay)
    expect(setPaymentsAcceptsArray(mutated)).toBe(false)
  })

  it('mutation (handler): removing the income from the foundry array turns the check RED', () => {
    // Flip the foundry INCOME row's type (the row whose metadata carries
    // club: 'golden_foundry' first) so the array no longer holds a MONEY_INCOME.
    const anchor = handler.indexOf("club: 'golden_foundry'")
    expect(anchor).toBeGreaterThan(0)
    const k = handler.lastIndexOf('type: PaymentType.MONEY_INCOME,', anchor)
    expect(k).toBeGreaterThan(0)
    const mutated =
      handler.slice(0, k) +
      'type: PaymentType.MONEY_OUTCOME,' +
      handler.slice(k + 'type: PaymentType.MONEY_INCOME,'.length)
    expect(mutated).not.toEqual(handler)
    expect(
      analyzeHandler(mutated).pairAtomic['golden_foundry_membership']
    ).toBe(false)
  })
})
