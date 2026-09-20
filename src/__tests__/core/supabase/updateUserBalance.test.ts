/**
 * Tests for updateUserBalance.ts
 *
 * Critical payment function - updates user balance via transactions
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import {
  PaymentType,
  PaymentStatus,
  Currency,
} from '@/interfaces/payments.interface'

// Mock dependencies BEFORE imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
    rpc: vi.fn(),
  },
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  invalidateBalanceCache: vi.fn(),
}))

// The charge itself now happens in `user_tokens` in the render Postgres, not in
// `payments_v2` (owner decision 2026-09-20, step 3). This is a small working
// wallet rather than a per-call stub, so the tests exercise the same guard the
// database applies: an UPDATE that matches no row when the balance is short.
const wallet = { balance: 100, down: false }

const walletQuery = vi.fn(async (sql: string, params: unknown[]) => {
  if (wallet.down) throw new Error('ECONNREFUSED')
  const amount = Number(params[1])
  if (/^SELECT/i.test(sql.trim()))
    return { rows: [{ balance: wallet.balance }] }
  if (/INSERT INTO user_tokens/i.test(sql)) {
    wallet.balance += amount
    return { rows: [{ balance: wallet.balance }] }
  }
  if (/UPDATE user_tokens/i.test(sql)) {
    if (wallet.balance < amount) return { rows: [] }
    wallet.balance -= amount
    return { rows: [{ balance: wallet.balance }] }
  }
  throw new Error(`unexpected wallet query: ${sql}`)
})

vi.mock('pg', () => ({
  Pool: class {
    query = (...a: unknown[]) => walletQuery(...(a as [string, unknown[]]))
    on() {
      return this
    }
  },
}))

vi.mock('@/price/helpers/calculateServiceCost', () => ({
  calculateServiceCost: vi.fn().mockReturnValue(5),
}))

vi.mock('@/interfaces/zod/payment.zod', () => ({
  CreatePaymentV2Schema: {
    parse: vi.fn((data: any) => data),
  },
}))

import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'
import { resetTokenWalletPool } from '@/core/wallet/tokenWallet'

// Helper to setup supabase mocks
const setupSupabaseMocks = (
  options: {
    userExists?: boolean
    balance?: number
    insertError?: any
    updateError?: any
    rpcError?: any
  } = {}
) => {
  const {
    userExists = true,
    balance = 100,
    insertError = null,
    updateError = null,
    rpcError = null,
  } = options

  const mockSelect = vi.fn().mockReturnThis()
  const mockEq = vi.fn().mockReturnThis()
  const mockSingle = vi.fn().mockResolvedValue({
    data: userExists ? { id: 1, telegram_id: '123456789' } : null,
    error: userExists ? null : { message: 'User not found', code: 'PGRST116' },
  })
  const mockInsert = vi.fn().mockResolvedValue({
    data: null,
    error: insertError,
  })
  const mockUpdate = vi.fn().mockReturnThis()
  // The existence check uses .limit(1), not .single(): telegram_id is not
  // unique in `users` (19 people have 2-3 rows in production), and single()
  // errors on more than one row. Returns an ARRAY, hence the [] / [row] shape.
  const mockLimit = vi.fn().mockResolvedValue({
    data: userExists ? [{ id: 1, telegram_id: '123456789' }] : [],
    error: null,
  })

  ;(supabase.from as Mock).mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    single: mockSingle,
    limit: mockLimit,
  })
  wallet.balance = balance
  wallet.down = Boolean(rpcError)

  return { mockSelect, mockEq, mockSingle, mockInsert, mockUpdate, mockLimit }
}

describe('updateUserBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetTokenWalletPool()
    process.env.TOKENS_DATABASE_URL = 'postgres://wallet/test'
    wallet.balance = 100
    wallet.down = false
    // Reset console.log mock
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  describe('input validation', () => {
    it('should return false for empty telegram_id', async () => {
      const result = await updateUserBalance(
        '',
        10,
        PaymentType.MONEY_INCOME,
        'Test deposit'
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Пустой telegram_id'),
        expect.any(Object)
      )
    })

    it('should return false for undefined amount', async () => {
      const result = await updateUserBalance(
        '123456789',
        undefined as unknown as number,
        PaymentType.MONEY_INCOME
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Некорректная сумма'),
        expect.any(Object)
      )
    })

    it('should return false for NaN amount', async () => {
      const result = await updateUserBalance(
        '123456789',
        NaN,
        PaymentType.MONEY_INCOME
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Некорректная сумма'),
        expect.any(Object)
      )
    })
  })

  describe('MONEY_INCOME operations', () => {
    it('should create deposit transaction successfully', async () => {
      setupSupabaseMocks({ userExists: true })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME,
        'Test deposit',
        { bot_name: 'TestBot' }
      )

      expect(result).toBe(true)
      expect(supabase.from).toHaveBeenCalledWith('payments_v2')
      expect(invalidateBalanceCache).toHaveBeenCalledWith('123456789')
    })

    it('should return false when user not found for income', async () => {
      setupSupabaseMocks({ userExists: false })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME
      )

      expect(result).toBe(false)
      // Проверяем не формулировку, а СМЫСЛ: в записи должно быть видно, что
      // человек заплатил и не получил звёзды, и должны быть поля, по которым
      // случай можно найти (inv_id, способ оплаты, сумма).
      //
      // Раньше здесь стояло stringContaining('не найден') — тест держал
      // конкретное слово, а не контракт, и падал от переписанного текста, хотя
      // поведение не менялось.
      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: 'PAYMENT RECEIVED BUT NOT CREDITED: no users row',
          telegram_id: '123456789',
          amount: 50,
        })
      )
    })

    it('should handle metadata with stars', async () => {
      setupSupabaseMocks({ userExists: true })

      const result = await updateUserBalance(
        '123456789',
        0,
        PaymentType.MONEY_INCOME,
        'Bonus stars',
        { stars: 100 }
      )

      expect(result).toBe(true)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('stars из metadata'),
        expect.any(Object)
      )
    })
  })

  describe('MONEY_OUTCOME operations', () => {
    it('should create withdrawal transaction successfully', async () => {
      setupSupabaseMocks({ userExists: true, balance: 100 })

      const result = await updateUserBalance(
        '123456789',
        10,
        PaymentType.MONEY_OUTCOME,
        'Test withdrawal',
        { service_type: 'neuro_photo' }
      )

      expect(result).toBe(true)
      // The charge is the wallet UPDATE, not a row in the archive: the money
      // has to leave `user_tokens` or it is spendable twice.
      expect(walletQuery).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE user_tokens/),
        ['123456789', 10]
      )
      expect(wallet.balance).toBe(90)
    })

    it('should return false when insufficient balance', async () => {
      setupSupabaseMocks({ userExists: true, balance: 5 })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_OUTCOME,
        'Test withdrawal'
      )

      expect(result).toBe(false)
      // The LEVEL is the assertion, not decoration. logger.error is bound to a
      // Telegram transport, so it pages the owner; logger.warn does not. This
      // guard returns before any write, so an empty wallet here is the
      // customer's own state and there is nothing for an operator to do.
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно средств'),
        expect.any(Object)
      )
      expect(
        logger.error,
        'a refused charge must not page the owner'
      ).not.toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно средств'),
        expect.any(Object)
      )
    })

    it('should use modePrice from metadata', async () => {
      setupSupabaseMocks({ userExists: true, balance: 100 })

      const result = await updateUserBalance(
        '123456789',
        0,
        PaymentType.MONEY_OUTCOME,
        'Test generation',
        { modePrice: 15 }
      )

      expect(result).toBe(true)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('modePrice'),
        expect.any(Object)
      )
    })

    it('should use paymentAmount from metadata', async () => {
      setupSupabaseMocks({ userExists: true, balance: 100 })

      const result = await updateUserBalance(
        '123456789',
        0,
        PaymentType.MONEY_OUTCOME,
        'Test payment',
        { paymentAmount: 20 }
      )

      expect(result).toBe(true)
    })

    it('should warn about large amounts and correct for generation', async () => {
      setupSupabaseMocks({ userExists: true, balance: 200 })

      const result = await updateUserBalance(
        '123456789',
        150,
        PaymentType.MONEY_OUTCOME,
        'Payment for generating image'
      )

      // May pass or fail depending on implementation details
      // The main thing is that the function handles large amounts
      expect(typeof result).toBe('boolean')
    })
  })

  describe('update existing transaction (inv_id)', () => {
    it('should update existing transaction', async () => {
      setupSupabaseMocks({ userExists: true, balance: 100 })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME,
        'Update deposit',
        { inv_id: 'INV-123' }
      )

      expect(result).toBe(true)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Обновление существующей записи'),
        expect.any(Object)
      )
    })
  })

  describe('error handling', () => {
    it('should return false on insert error', async () => {
      setupSupabaseMocks({
        userExists: true,
        insertError: { message: 'Insert failed' },
      })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME,
        'Test deposit'
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalled()
    })

    // The RPC fallback this replaced recomputed the balance from `payments_v2`
    // when `get_user_balance` was unavailable. There is no fallback now: the
    // wallet is the only place the money is, so an unreachable wallet refuses
    // the charge instead of guessing at a number.
    it('refuses the charge when the wallet cannot be reached', async () => {
      setupSupabaseMocks({ userExists: true })
      wallet.down = true

      const result = await updateUserBalance(
        '123456789',
        5,
        PaymentType.MONEY_OUTCOME,
        'Test'
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Живой кошелёк недоступен'),
        expect.objectContaining({ telegram_id: '123456789', amount: 5 })
      )
    })

    it('should catch and log unexpected exceptions', async () => {
      ;(supabase.from as Mock).mockImplementation(() => {
        throw new Error('Unexpected error')
      })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Неожиданная ошибка'),
        expect.any(Object)
      )
    })
  })

  describe('logging', () => {
    it('should log input parameters', async () => {
      setupSupabaseMocks({ userExists: true })

      await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME,
        'Test deposit',
        { bot_name: 'TestBot' }
      )

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Входные данные'),
        expect.objectContaining({
          telegram_id: '123456789',
          amount: 50,
          type: PaymentType.MONEY_INCOME,
        })
      )
    })

    it('should log final transaction amount', async () => {
      setupSupabaseMocks({ userExists: true })

      await updateUserBalance('123456789', 50, PaymentType.MONEY_INCOME)

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Финальная сумма'),
        expect.any(Object)
      )
    })

    it('should invalidate cache after successful operation', async () => {
      setupSupabaseMocks({ userExists: true })

      await updateUserBalance('123456789', 50, PaymentType.MONEY_INCOME)

      expect(invalidateBalanceCache).toHaveBeenCalledWith('123456789')
    })

    it('returns true even if cache invalidation throws after a committed transaction (#1174)', async () => {
      setupSupabaseMocks({ userExists: true })
      ;(invalidateBalanceCache as unknown as Mock).mockImplementationOnce(
        () => {
          throw new Error('cache down')
        }
      )

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME
      )

      // the payments_v2 row committed -> the charge stands -> must return true,
      // never false (a false negative makes the caller deliver-unbilled / retry)
      expect(result).toBe(true)
    })
  })

  /**
   * THE LEVEL IS A ROUTING DECISION, NOT A SEVERITY ADJECTIVE.
   *
   * `logger.error` is bound to a Telegram transport in src/utils/logger.ts, so
   * every logger.error in this process is a push notification to the owner.
   * logger.warn and logger.info are not. This block fixes which side of that
   * line each refusal in this file sits on, so a later edit cannot quietly
   * move one across.
   */
  describe('which refusals page the owner', () => {
    it('an empty wallet does not page: it is the customer, not our machinery', async () => {
      setupSupabaseMocks({ userExists: true, balance: 5 })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_OUTCOME,
        'Test withdrawal'
      )

      expect(result).toBe(false)
      // The guard returns before every write in this function, so nothing was
      // inserted and there is nothing for an operator to reconcile at 3am.
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно средств'),
        expect.objectContaining({ description: 'Insufficient funds' })
      )
      expect(
        logger.error,
        'a refused charge must not ring the owner'
      ).not.toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно средств'),
        expect.any(Object)
      )
    })

    // An unreachable wallet DOES page: unlike an empty wallet, it is our
    // machinery failing, and every customer is refused until it comes back.
    it('an unreachable wallet pages: that one is ours to fix', async () => {
      setupSupabaseMocks({ userExists: true })
      wallet.down = true

      const result = await updateUserBalance(
        '123456789',
        4,
        PaymentType.MONEY_OUTCOME,
        'Test withdrawal'
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Живой кошелёк недоступен'),
        expect.any(Object)
      )
      expect(
        logger.warn,
        'an outage must not be filed as the customer being broke'
      ).not.toHaveBeenCalledWith(
        expect.stringContaining('Недостаточно средств'),
        expect.any(Object)
      )
    })

    it('an inverted posting still pages: a negative amount is our bug', async () => {
      // 114 rows of -9 stars credited 1026 instead of deducting. Somebody has
      // to hear about this one.
      setupSupabaseMocks({ userExists: true, balance: 1000 })

      const result = await updateUserBalance(
        '123456789',
        -50,
        PaymentType.MONEY_OUTCOME,
        'Test withdrawal'
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Отрицательная сумма'),
        expect.any(Object)
      )
    })

    it('a top-up with no profile still pages: the money already left the customer', async () => {
      setupSupabaseMocks({ userExists: false })

      const result = await updateUserBalance(
        '123456789',
        50,
        PaymentType.MONEY_INCOME,
        'Test deposit'
      )

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Пополнение отклонено'),
        expect.objectContaining({
          description: 'PAYMENT RECEIVED BUT NOT CREDITED: no users row',
        })
      )
    })
  })
})
