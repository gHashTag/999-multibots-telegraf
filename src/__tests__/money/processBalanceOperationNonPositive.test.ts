/**
 * Ratchet: the shared IMAGE balance op (processBalanceOperation) refuses a
 * non-positive price BEFORE it charges, so a 0/NaN price cannot hand out a free
 * paid image.
 *
 * 0-cost-bypass class. The two legitimate free paths (is_welcome_gift and the
 * AvatarTransform bypass) return early; past them a paymentAmount <= 0 is an
 * anomaly (a missing/regressed price flooring to 0 -- calculateFinalImageCostIn-
 * Stars returns 0 for a 0 baseCost). A 0 slips past `currentBalance <
 * paymentAmount` (balance < 0 is always false) and updateUserBalance charges 0
 * -> free image. This is the image twin of the video-helper guard
 * (processBalanceVideoOperationHelper, #1571); processBalanceOperation is the
 * LIVE charge fn for the whole image-gen family (NanoBananaKie, Qwen(+Plus),
 * SeeDream, FluxKontext, aiPhotoshop batch, ...).
 *
 * Structural (the fn is a large supabase/Telegram I/O op; forcing the charge
 * branch behaviorally is brittle). Pins ORDER: a paymentAmount-vs-0 refuse must
 * precede the updateUserBalance charge. self-check + floor + real-source mutation.
 *
 * loop-fable iter228 (charge-side sweep of the image-gen family; generalises #1571).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../price/helpers/processBalanceOperation.ts'
)

function analyze(source: string): {
  handlerFound: boolean
  chargeCalls: number
  refuseBeforeCharge: boolean
} {
  const sf = ts.createSourceFile('p.ts', source, ts.ScriptTarget.Latest, true)

  // Locate `const processBalanceOperation = async (...) => {...}`.
  let fn: ts.Node | undefined
  const find = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'processBalanceOperation' &&
      n.initializer
    ) {
      fn = n.initializer
    }
    n.forEachChild(find)
  }
  find(sf)
  if (!fn)
    return { handlerFound: false, chargeCalls: 0, refuseBeforeCharge: false }

  const lo = fn.getStart(sf)
  const hi = fn.getEnd()
  const inFn = (n: ts.Node) => n.getStart(sf) >= lo && n.getEnd() <= hi

  const chargePos: number[] = []
  const refusePos: number[] = []
  const visit = (n: ts.Node): void => {
    if (inFn(n)) {
      // charge: updateUserBalance(...)
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'updateUserBalance'
      )
        chargePos.push(n.getStart(sf))
      // refuse: an if-condition testing paymentAmount vs 0/1
      if (ts.isIfStatement(n)) {
        const c = n.expression.getText(sf)
        if (
          /paymentAmount\s*(<=|<|>)\s*(0|1)/.test(c) ||
          /!\(\s*paymentAmount\s*>\s*0\s*\)/.test(c)
        )
          refusePos.push(n.getStart(sf))
      }
    }
    n.forEachChild(visit)
  }
  visit(sf)

  const firstCharge = chargePos.length ? Math.min(...chargePos) : Infinity
  const firstRefuse = refusePos.length ? Math.min(...refusePos) : Infinity
  return {
    handlerFound: true,
    chargeCalls: chargePos.length,
    refuseBeforeCharge: firstRefuse < firstCharge,
  }
}

describe('processBalanceOperation refuses a non-positive price before charging', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the shared image op still charges via updateUserBalance', () => {
    expect(a.handlerFound).toBe(true)
    expect(a.chargeCalls).toBeGreaterThanOrEqual(1)
  })

  it('a non-positive-price refuse precedes the charge', () => {
    expect(a.refuseBeforeCharge).toBe(true)
  })

  it('self-check: a helper that charges without a non-positive guard is detected', () => {
    const bad = `const processBalanceOperation = async ({ telegram_id, paymentAmount }) => {
      const currentBalance = await getUserBalance(telegram_id)
      if (currentBalance < paymentAmount) return { success: false }
      await updateUserBalance(telegram_id, paymentAmount, PaymentType.MONEY_OUTCOME)
    }`
    const rb = analyze(bad)
    expect(rb.handlerFound).toBe(true)
    expect(rb.refuseBeforeCharge).toBe(false)

    const good = `const processBalanceOperation = async ({ telegram_id, paymentAmount }) => {
      if (!(paymentAmount > 0)) return { success: false }
      const currentBalance = await getUserBalance(telegram_id)
      if (currentBalance < paymentAmount) return { success: false }
      await updateUserBalance(telegram_id, paymentAmount, PaymentType.MONEY_OUTCOME)
    }`
    expect(analyze(good).refuseBeforeCharge).toBe(true)
  })

  it('mutation: stripping the real non-positive guard turns the check RED', () => {
    const mutated = source.replace(
      /if \(!\(paymentAmount > 0\)\) \{[\s\S]*?\n {2}\}\n/,
      ''
    )
    expect(mutated).not.toEqual(source) // the guard really exists
    expect(analyze(mutated).refuseBeforeCharge).toBe(false)
  })
})
