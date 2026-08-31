import { describe, it, expect, beforeEach, vi } from 'vitest'

// Zero-cost-bypass class (#1458 sibling). processBalanceVideoOperation derives
// the charge from calculateFinalPrice, which returns 0 on an unknown/unpriced
// config (fail-open). A 0 charge slips past the `balance < paymentAmount` check
// (balance < 0 is always false) and hands out a paid video for free. The op must
// REFUSE a non-positive price, not charge it.

const h = vi.hoisted(() => ({
  calculateFinalPrice: vi.fn(),
  getUserBalance: vi.fn(),
  updateUserBalance: vi.fn(),
}))

vi.mock('@/price/helpers/calculateFinalPrice', () => ({
  calculateFinalPrice: h.calculateFinalPrice,
}))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: h.getUserBalance,
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: h.updateUserBalance,
}))

import { processBalanceVideoOperation } from '@/price/helpers/processBalanceVideoOperation'
import type { MyContext } from '@/interfaces'

const ctx = {
  from: { id: 424242 },
  botInfo: { username: 'test_bot' },
  session: { mode: 'text_to_video' },
} as unknown as MyContext

describe('processBalanceVideoOperation refuses a non-positive price (no free video)', () => {
  beforeEach(() => {
    h.calculateFinalPrice.mockReset()
    h.getUserBalance.mockReset().mockResolvedValue(100000) // plenty of balance
    h.updateUserBalance.mockReset().mockResolvedValue(true)
  })

  it('a 0 price (calculateFinalPrice fail-open) -> success:false, never charges', async () => {
    h.calculateFinalPrice.mockReturnValue(0)
    const r = await processBalanceVideoOperation(ctx, 'sora-2', false)
    expect(r.success).toBe(false)
    expect(r.paymentAmount).toBe(0)
    // The whole point: a free video was NOT charged/handed out.
    expect(h.updateUserBalance).not.toHaveBeenCalled()
  })

  it('a negative price is refused too', async () => {
    h.calculateFinalPrice.mockReturnValue(-5)
    const r = await processBalanceVideoOperation(ctx, 'sora-2', false)
    expect(r.success).toBe(false)
    expect(h.updateUserBalance).not.toHaveBeenCalled()
  })

  it('a valid positive price passes the guard and charges once', async () => {
    h.calculateFinalPrice.mockReturnValue(50)
    const r = await processBalanceVideoOperation(ctx, 'sora-2', false)
    expect(r.success).toBe(true)
    expect(r.paymentAmount).toBe(50)
    expect(h.updateUserBalance).toHaveBeenCalledTimes(1)
  })
})
