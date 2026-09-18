/**
 * THE MATCHING RULE IS THE SCENE'S, AND IT IS TESTED WITHOUT SENDING COINS.
 *
 * A reconcile that is looser than the credit path invents debts; one that is
 * stricter hides them. Both are worse than no tool, because both are read as
 * facts about money. So the three ways a transfer can look right and not be --
 * a comment that merely contains the id, an amount short of what was asked, a
 * transfer that predates the invoice -- are pinned here against invented
 * transfers rather than against whatever the chain happens to hold tonight.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'

const { matches, AMOUNT_TOLERANCE } = createRequire(__filename)(
  path.join(__dirname, 'ton-pending-reconcile.cjs')
) as {
  matches: (
    invoice: { inv_id: string; amountTon: number; issuedAt: number | null },
    tx: { at: number; valueNano: number; comment: string }
  ) => boolean
  AMOUNT_TOLERANCE: number
}

const ISSUED = Date.parse('2026-09-10T10:00:00.000Z')
const INVOICE = {
  inv_id: 'TONN-1789017520884-Q1JHHH',
  amountTon: 1,
  issuedAt: ISSUED,
}
const ton = (n: number) => Math.round(n * 1e9)

const transfer = (
  over: Partial<{ at: number; valueNano: number; comment: string }> = {}
) => ({
  at: ISSUED + 60_000,
  valueNano: ton(1),
  comment: INVOICE.inv_id,
  ...over,
})

describe('did this transfer pay this invoice', () => {
  it('accepts the payment as the scene would', () => {
    expect(matches(INVOICE, transfer())).toBe(true)
  })

  /*
   * THE COMMENT IS THE IDENTITY. A transfer whose comment merely CONTAINS the
   * id belongs to somebody else's invoice; treating it as payment would credit
   * one person for another's coins.
   */
  it('refuses a comment that only contains the invoice id', () => {
    expect(
      matches(INVOICE, transfer({ comment: `pay ${INVOICE.inv_id} now` }))
    ).toBe(false)
    expect(matches(INVOICE, transfer({ comment: '' }))).toBe(false)
  })

  /*
   * FEES, BUT NOT DISCOUNTS. The scene allows 1% for network fees and nothing
   * more -- half the money is not a payment.
   */
  it('allows the fee margin and refuses anything short of it', () => {
    expect(
      matches(INVOICE, transfer({ valueNano: ton(AMOUNT_TOLERANCE) }))
    ).toBe(true)
    expect(matches(INVOICE, transfer({ valueNano: ton(0.5) }))).toBe(false)
  })

  it('accepts more than was asked', () => {
    expect(matches(INVOICE, transfer({ valueNano: ton(1.5) }))).toBe(true)
  })

  /*
   * A TRANSFER OLDER THAN THE INVOICE CANNOT BE ITS PAYMENT. Without this, an
   * earlier top-up with a recycled comment would settle a new invoice for free.
   */
  it('refuses a transfer that predates the invoice', () => {
    expect(matches(INVOICE, transfer({ at: ISSUED - 60_000 }))).toBe(false)
  })

  it('judges by comment alone when the invoice names no amount', () => {
    const noAmount = { ...INVOICE, amountTon: Number.NaN }
    expect(matches(noAmount, transfer({ valueNano: ton(0.01) }))).toBe(true)
  })
})
