/**
 * Ratchet: TON top-up "check payment" credits only the payment's OWNER.
 *
 * The ton_check_/tonn_check_ actions fetch the PENDING payment by inv_id and
 * credit updateUserBalance(ctx.from.id, ...). The invId is the PUBLIC on-chain
 * USDT transfer memo, and callback_query data is client-forgeable, so an
 * attacker who reads a victim's memo off the blockchain could tap
 * ton_check_<victimInvId> in their own scene session and be credited for the
 * victim's confirmed top-up (theft). The payment belongs to whoever created it
 * (payment.telegram_id), not the caller.
 *
 * Fix: an ownership guard (payment.telegram_id !== telegramId -> refuse) BEFORE
 * the credit, in BOTH tonPaymentScene and tonNativePaymentScene. This pins it:
 * each file references payment.telegram_id in a guard positioned before the
 * MONEY_INCOME credit. Skip-only (never adds credit) -> autonomous-safe.
 *
 * loop-fable iter210 (wave-13 auth-scope-confusion lens).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

const FILES = [
  'tonPaymentScene/index.ts',
  'tonNativePaymentScene/index.ts',
].map(f => path.resolve(__dirname, '../../scenes', f))

function subtreeHas(n: ts.Node, pred: (m: ts.Node) => boolean): boolean {
  let hit = false
  const w = (m: ts.Node): void => {
    if (pred(m)) hit = true
    m.forEachChild(w)
  }
  w(n)
  return hit
}

/** Does the subtree reference `payment.telegram_id` (property access)? */
const refsPaymentOwner = (n: ts.Node): boolean =>
  subtreeHas(
    n,
    m =>
      ts.isPropertyAccessExpression(m) &&
      ts.isIdentifier(m.expression) &&
      m.expression.text === 'payment' &&
      m.name.text === 'telegram_id'
  )

function analyze(source: string): {
  incomeCredits: number
  guardedBeforeCredit: boolean
} {
  const sf = ts.createSourceFile('t.ts', source, ts.ScriptTarget.Latest, true)

  // Position of the first MONEY_INCOME updateUserBalance credit.
  let creditPos = -1
  // Position of the first ownership guard: an `if` whose condition references
  // payment.telegram_id and whose body returns (refuses).
  let guardPos = -1
  let incomeCredits = 0

  const visit = (n: ts.Node): void => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'updateUserBalance' &&
      subtreeHas(
        n,
        m => ts.isPropertyAccessExpression(m) && m.name.text === 'MONEY_INCOME'
      )
    ) {
      incomeCredits++
      if (creditPos === -1) creditPos = n.getStart(sf)
    }
    if (
      ts.isIfStatement(n) &&
      refsPaymentOwner(n.expression) &&
      subtreeHas(n.thenStatement, m => ts.isReturnStatement(m)) &&
      guardPos === -1
    ) {
      guardPos = n.getStart(sf)
    }
    n.forEachChild(visit)
  }
  visit(sf)

  return {
    incomeCredits,
    guardedBeforeCredit:
      guardPos !== -1 && creditPos !== -1 && guardPos < creditPos,
  }
}

describe('TON top-up check credits only the payment owner', () => {
  for (const file of FILES) {
    const name = path.basename(path.dirname(file))
    const a = analyze(fs.readFileSync(file, 'utf8'))

    it(`${name}: still has a MONEY_INCOME credit this ratchet guards (floor)`, () => {
      expect(a.incomeCredits).toBeGreaterThanOrEqual(1)
    })

    it(`${name}: an ownership guard (payment.telegram_id) precedes the credit`, () => {
      expect(a.guardedBeforeCredit).toBe(true)
    })
  }

  it('self-check: an unguarded credit is detected', () => {
    const bad = `async function h(ctx) {
      const { data: payment } = await supabase.from('payments_v2')
        .eq('inv_id', invId).single()
      if (!payment) return ctx.scene.leave()
      await updateUserBalance(String(telegramId), payment.stars, PaymentType.MONEY_INCOME, 'x')
    }`
    const r = analyze(bad)
    expect(r.incomeCredits).toBe(1)
    expect(r.guardedBeforeCredit).toBe(false)
  })
})
