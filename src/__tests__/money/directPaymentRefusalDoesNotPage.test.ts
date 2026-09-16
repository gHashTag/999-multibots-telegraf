/**
 * A PERSON WHO CANNOT AFFORD A GENERATION IS NOT AN INCIDENT.
 *
 * `logger.error` is bound to a Telegram transport in src/utils/logger.ts, so
 * every logger.error in this process is a push notification to the owner's
 * group. logger.warn and logger.info are not. The level is therefore a routing
 * decision, and the question each of these tests asks is: what would an
 * operator DO with this at 3am?
 *
 * directPaymentProcessor is the shared floor under every direct-charge spend
 * path in the repository (generateNeuroPhotoDirect, plan_b/generateImageToPrompt
 * and the HTTP route), so its balance pre-check fires once per person who is out
 * of stars -- the highest-volume single source of balance-refusal pages there is.
 *
 * The refusal is a PRE-WRITE guard: it returns before the payments_v2 insert, so
 * no row exists and there is nothing to reconcile. It warns. The insert failure
 * three lines further down is our machinery losing a money write, and it still
 * pages. This file fixes both sides of that line so a later edit cannot quietly
 * move one across.
 *
 * Behavioural, not source-grepping: the refusal branch runs before any DB call,
 * so driving the real function costs one mocked getUserBalance.
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { PaymentType } from '@/interfaces/payments.interface'

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/core/supabase', () => ({
  supabase: { from: vi.fn() },
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(),
  invalidateBalanceCache: vi.fn(),
}))

vi.mock('@/helpers/sendTransactionNotification', () => ({
  sendTransactionNotificationTest: vi.fn(),
}))

import { directPaymentProcessor } from '@/core/supabase/directPayment'
import { supabase } from '@/core/supabase'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { logger } from '@/utils/logger'

/** Point the payments_v2 insert chain at a fixed outcome. */
const insertReturns = (outcome: { data: any; error: any }) => {
  ;(supabase.from as Mock).mockReturnValue({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(outcome),
      }),
    }),
  })
}

const spend = (amount: number) =>
  directPaymentProcessor({
    telegram_id: '123456789',
    amount,
    type: PaymentType.MONEY_OUTCOME,
    description: 'Payment for generating image',
    bot_name: 'test_bot',
    service_type: 'neuro_photo',
  })

describe('directPaymentProcessor: which refusals page the owner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('an empty wallet is refused without paging the owner', async () => {
    ;(getUserBalance as Mock).mockResolvedValue(0)

    const result = await spend(4)

    // The customer is still told: the caller reads `error` off this payload.
    expect(result.success).toBe(false)
    expect(result.error).toContain('Недостаточно средств')

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Недостаточно средств'),
      expect.objectContaining({ currentBalance: 0, requiredAmount: 4 })
    )
    expect(
      logger.error,
      'an empty wallet must not ring the owner'
    ).not.toHaveBeenCalled()
  })

  it('a short-by-one wallet is refused without paging either', async () => {
    ;(getUserBalance as Mock).mockResolvedValue(3)

    const result = await spend(4)

    expect(result.success).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Недостаточно средств'),
      expect.objectContaining({ currentBalance: 3, requiredAmount: 4 })
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('nothing is written when the charge is refused', async () => {
    // This is the whole reason the refusal is not an incident: the guard
    // returns above the only write in the function, so there is no half-done
    // payment for anybody to reconcile.
    ;(getUserBalance as Mock).mockResolvedValue(0)
    insertReturns({ data: { id: 1 }, error: null })

    await spend(4)

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('a failed money write still pages: that one is our machinery', async () => {
    ;(getUserBalance as Mock).mockResolvedValue(1000)
    insertReturns({ data: null, error: { message: 'connection refused' } })

    const result = await spend(4)

    expect(result.success).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Ошибка DB при вставке записи'),
      expect.any(Object)
    )
  })

  it('a committed row with no id back still pages', async () => {
    // The insert reported success but returned no usable id: we cannot tell
    // whether the money write landed. That needs a human.
    ;(getUserBalance as Mock).mockResolvedValue(1000)
    insertReturns({ data: {}, error: null })

    const result = await spend(4)

    expect(result.success).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('не удалось получить ID'),
      expect.any(Object)
    )
  })
})
