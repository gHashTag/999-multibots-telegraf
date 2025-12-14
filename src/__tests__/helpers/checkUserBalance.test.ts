/**
 * Tests for checkUserBalance.ts
 *
 * Balance verification helper function
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { MyContext } from '@/interfaces/telegram-bot.interface'

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
  getUserBalance: vi.fn(),
}))

vi.mock('@/price/helpers', () => ({
  sendInsufficientStarsMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn().mockReturnValue(true),
}))

import { checkUserBalance } from '@/helpers/checkUserBalance'
import { getUserBalance } from '@/core/supabase'
import { sendInsufficientStarsMessage } from '@/price/helpers'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

const createMockContext = (overrides = {}): MyContext =>
  ({
    from: { id: 123456789 },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    ...overrides,
  } as unknown as MyContext)

describe('checkUserBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful balance check', () => {
    it('should return true when balance is sufficient', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(100)

      const result = await checkUserBalance(ctx, 50)

      expect(result).toBe(true)
      expect(getUserBalance).toHaveBeenCalledWith('123456789')
      expect(sendInsufficientStarsMessage).not.toHaveBeenCalled()
    })

    it('should return true when balance equals cost', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(50)

      const result = await checkUserBalance(ctx, 50)

      expect(result).toBe(true)
    })

    it('should return true when balance is greater than cost', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(1000)

      const result = await checkUserBalance(ctx, 10)

      expect(result).toBe(true)
    })
  })

  describe('insufficient balance', () => {
    it('should return false when balance is insufficient', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(10)

      const result = await checkUserBalance(ctx, 50)

      expect(result).toBe(false)
      expect(sendInsufficientStarsMessage).toHaveBeenCalledWith(ctx, 10, true)
    })

    it('should return false when balance is zero', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(0)

      const result = await checkUserBalance(ctx, 10)

      expect(result).toBe(false)
      expect(sendInsufficientStarsMessage).toHaveBeenCalled()
    })

    it('should log insufficient funds', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(5)

      await checkUserBalance(ctx, 50)

      expect(logger.info).toHaveBeenCalledWith(
        '[checkUserBalance] Insufficient funds',
        expect.objectContaining({
          telegramId: '123456789',
          currentBalance: 5,
          cost: 50,
        })
      )
    })

    it('should use correct language for message', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(5)
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await checkUserBalance(ctx, 50)

      expect(sendInsufficientStarsMessage).toHaveBeenCalledWith(ctx, 5, false)
    })
  })

  describe('error handling', () => {
    it('should return false when telegram_id is missing', async () => {
      const ctx = createMockContext({ from: undefined })

      const result = await checkUserBalance(ctx, 10)

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        '[checkUserBalance] No telegram ID found'
      )
      expect(getUserBalance).not.toHaveBeenCalled()
    })

    it('should return false on database error', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockRejectedValue(new Error('DB error'))

      const result = await checkUserBalance(ctx, 10)

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        '[checkUserBalance] Error checking user balance:',
        expect.any(Error)
      )
    })

    it('should send error message to user on database error in Russian', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockRejectedValue(new Error('DB error'))
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await checkUserBalance(ctx, 10)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Ошибка при проверке баланса. Пожалуйста, попробуйте позже.'
      )
    })

    it('should send error message to user on database error in English', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockRejectedValue(new Error('DB error'))
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await checkUserBalance(ctx, 10)

      expect(ctx.reply).toHaveBeenCalledWith(
        '❌ Error checking balance. Please try again later.'
      )
    })
  })

  describe('edge cases', () => {
    it('should handle zero cost', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(0)

      const result = await checkUserBalance(ctx, 0)

      expect(result).toBe(true)
    })

    it('should handle negative balance (edge case)', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(-10)

      const result = await checkUserBalance(ctx, 5)

      expect(result).toBe(false)
    })

    it('should handle large numbers', async () => {
      const ctx = createMockContext()
      ;(getUserBalance as Mock).mockResolvedValue(1000000)

      const result = await checkUserBalance(ctx, 999999)

      expect(result).toBe(true)
    })

    it('should handle string telegram_id conversion', async () => {
      const ctx = createMockContext({ from: { id: 987654321 } })
      ;(getUserBalance as Mock).mockResolvedValue(100)

      await checkUserBalance(ctx, 10)

      expect(getUserBalance).toHaveBeenCalledWith('987654321')
    })
  })
})
