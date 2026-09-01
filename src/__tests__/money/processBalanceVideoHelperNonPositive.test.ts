/**
 * Ratchet: the LIVE video balance op (processBalanceVideoOperationHelper) refuses
 * a non-positive price BEFORE it charges, so a 0/NaN price cannot hand out a free
 * paid video.
 *
 * 0-cost-bypass class. getUnifiedModelPrice is fail-closed (throws for unknown,
 * documented "Fail CLOSED, not to 0"), but the balance op had no non-positive
 * guard of its own: a 0 paymentAmount slips past `currentBalance < paymentAmount`
 * (balance < 0 is always false) and updateUserBalance charges 0 -> free video.
 *
 * NOTE: the dead twin `processBalanceVideoOperation` (price/helpers) and its
 * ratchet were deleted in #1572 (it was exported but never imported/called). The
 * LIVE path (morphingWizard etc.) calls processBalanceVideoOperationHelper
 * (modules/videoGenerator/helpers/priceHelper), which this ratchet pins.
 * Structural -> self-check + floor + mutation-verified.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILE = path.resolve(
  __dirname,
  '../../modules/videoGenerator/helpers/priceHelper.ts'
)

function analyze(source: string): {
  handlerFound: boolean
  chargeCalls: number
  refuseBeforeCharge: boolean
} {
  const sf = ts.createSourceFile('p.ts', source, ts.ScriptTarget.Latest, true)

  // Locate the processBalanceVideoOperationHelper arrow/function.
  let fn: ts.Node | undefined
  const find = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'processBalanceVideoOperationHelper' &&
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
      // refuse: an if-condition testing paymentAmount vs 0 (paymentAmount > 0,
      // paymentAmount <= 0, !(paymentAmount > 0), paymentAmount < 1)
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

describe('processBalanceVideoOperationHelper refuses a non-positive price before charging', () => {
  const source = fs.readFileSync(FILE, 'utf8')
  const a = analyze(source)

  it('floor: the live helper still charges via updateUserBalance', () => {
    expect(a.handlerFound).toBe(true)
    expect(a.chargeCalls).toBeGreaterThanOrEqual(1)
  })

  it('a non-positive-price refuse precedes the charge', () => {
    expect(a.refuseBeforeCharge).toBe(true)
  })

  it('self-check: a helper that charges without a non-positive guard is detected', () => {
    const bad = `const processBalanceVideoOperationHelper = async (telegramId, modelId) => {
      const paymentAmount = getUnifiedModelPrice(modelId)
      if (currentBalance < paymentAmount) return { success: false }
      await updateUserBalance(telegramId, paymentAmount, PaymentType.MONEY_OUTCOME)
    }`
    const rb = analyze(bad)
    expect(rb.handlerFound).toBe(true)
    expect(rb.refuseBeforeCharge).toBe(false)

    const good = `const processBalanceVideoOperationHelper = async (telegramId, modelId) => {
      const paymentAmount = getUnifiedModelPrice(modelId)
      if (!(paymentAmount > 0)) return { success: false }
      if (currentBalance < paymentAmount) return { success: false }
      await updateUserBalance(telegramId, paymentAmount, PaymentType.MONEY_OUTCOME)
    }`
    expect(analyze(good).refuseBeforeCharge).toBe(true)
  })
})
