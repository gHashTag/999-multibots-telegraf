/**
 * Tests for getUserBalance.ts
 *
 * Critical payment function - gets user balance from Supabase
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies BEFORE imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// The balance moved from the `get_user_balance` RPC over `payments_v2` to the
// `user_tokens` table in the render Postgres (owner decision 2026-09-20,
// step 3), so the wallet's connection pool is what gets mocked here.
const query = vi.fn()

vi.mock('pg', () => ({
  Pool: class {
    query = query
    on() {
      return this
    }
  },
}))

import {
  getUserBalance,
  invalidateBalanceCache,
} from '@/core/supabase/getUserBalance'
import { resetTokenWalletPool } from '@/core/wallet/tokenWallet'
import { logger } from '@/utils/logger'

/** A wallet row holding `balance` stars. */
const wallet = (balance: number) => ({ rows: [{ balance }] })

describe('getUserBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetTokenWalletPool()
    process.env.TOKENS_DATABASE_URL = 'postgres://wallet/test'
  })

  describe('successful balance retrieval', () => {
    it('should return the balance held in the wallet', async () => {
      query.mockResolvedValue(wallet(100))

      const result = await getUserBalance('123456789')

      expect(result).toBe(100)
      expect(query).toHaveBeenCalledWith(expect.any(String), ['123456789'])
    })

    it('should return 0 when the user has no wallet row yet', async () => {
      query.mockResolvedValue({ rows: [] })

      const result = await getUserBalance('123456789')

      expect(result).toBe(0)
    })

    it('should handle numeric telegram_id', async () => {
      query.mockResolvedValue(wallet(50))

      const result = await getUserBalance(123456789 as unknown as string)

      expect(result).toBe(50)
      expect(query).toHaveBeenCalledWith(expect.any(String), ['123456789'])
    })

    it('should handle bot_name parameter', async () => {
      query.mockResolvedValue(wallet(75))

      const result = await getUserBalance('123456789', 'TestBot')

      expect(result).toBe(75)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Получение баланса'),
        expect.objectContaining({ bot_name: 'TestBot' })
      )
    })
  })

  describe('error handling', () => {
    it('should return 0 when telegram_id is empty', async () => {
      const result = await getUserBalance('')

      expect(result).toBe(0)
      expect(logger.warn).toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    })

    it('should return 0 when telegram_id is undefined', async () => {
      const result = await getUserBalance(undefined as unknown as string)

      expect(result).toBe(0)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('should return 0 when telegram_id is null', async () => {
      const result = await getUserBalance(null as unknown as string)

      expect(result).toBe(0)
      expect(logger.warn).toHaveBeenCalled()
    })

    // Deliberately NOT "returns 0": a wallet we cannot reach means the balance
    // is unknown, and answering 0 tells a paying customer they have no money.
    it('should throw rather than answer 0 when the wallet is unreachable', async () => {
      query.mockRejectedValue(new Error('Network error'))

      await expect(getUserBalance('123456789')).rejects.toThrow()
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка в getUserBalance'),
        expect.any(Object)
      )
    })
  })

  describe('logging', () => {
    it('should log balance request', async () => {
      query.mockResolvedValue(wallet(100))

      await getUserBalance('123456789')

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Получение баланса'),
        expect.objectContaining({ telegram_id: '123456789' })
      )
    })

    it('should log successful balance retrieval', async () => {
      query.mockResolvedValue(wallet(100))

      await getUserBalance('123456789')

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Баланс пользователя получен'),
        expect.objectContaining({ stars: 100 })
      )
    })
  })
})

describe('invalidateBalanceCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should log that caching is disabled', () => {
    invalidateBalanceCache('123456789')

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('кэширование отключено'),
      expect.any(Object)
    )
  })

  it('should not throw for any input', () => {
    expect(() => invalidateBalanceCache('123456789')).not.toThrow()
    expect(() => invalidateBalanceCache('' as any)).not.toThrow()
    expect(() => invalidateBalanceCache(null as any)).not.toThrow()
  })
})
