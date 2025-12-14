/**
 * Tests for getUserBalance.ts
 *
 * Critical payment function - gets user balance from Supabase
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

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
    rpc: vi.fn(),
  },
}))

import { getUserBalance, invalidateBalanceCache } from '@/core/supabase/getUserBalance'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

describe('getUserBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful balance retrieval', () => {
    it('should return balance when supabase returns data', async () => {
      ;(supabase.rpc as Mock).mockResolvedValue({
        data: 100,
        error: null,
      })

      const result = await getUserBalance('123456789')

      expect(result).toBe(100)
      expect(supabase.rpc).toHaveBeenCalledWith('get_user_balance', {
        user_telegram_id: '123456789',
      })
    })

    it('should return 0 when supabase returns null/undefined', async () => {
      ;(supabase.rpc as Mock).mockResolvedValue({
        data: null,
        error: null,
      })

      const result = await getUserBalance('123456789')

      expect(result).toBe(0)
    })

    it('should handle numeric telegram_id', async () => {
      ;(supabase.rpc as Mock).mockResolvedValue({
        data: 50,
        error: null,
      })

      const result = await getUserBalance(123456789 as unknown as string)

      expect(result).toBe(50)
      expect(supabase.rpc).toHaveBeenCalledWith('get_user_balance', {
        user_telegram_id: '123456789',
      })
    })

    it('should handle bot_name parameter', async () => {
      ;(supabase.rpc as Mock).mockResolvedValue({
        data: 75,
        error: null,
      })

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
      expect(supabase.rpc).not.toHaveBeenCalled()
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

    it('should return 0 when supabase returns error', async () => {
      ;(supabase.rpc as Mock).mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      const result = await getUserBalance('123456789')

      expect(result).toBe(0)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка получения баланса'),
        expect.any(Object)
      )
    })

    it('should return 0 when supabase throws exception', async () => {
      ;(supabase.rpc as Mock).mockRejectedValue(new Error('Network error'))

      const result = await getUserBalance('123456789')

      expect(result).toBe(0)
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка в getUserBalance'),
        expect.any(Object)
      )
    })
  })

  describe('logging', () => {
    it('should log balance request', async () => {
      ;(supabase.rpc as Mock).mockResolvedValue({
        data: 100,
        error: null,
      })

      await getUserBalance('123456789')

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Получение баланса'),
        expect.objectContaining({ telegram_id: '123456789' })
      )
    })

    it('should log successful balance retrieval', async () => {
      ;(supabase.rpc as Mock).mockResolvedValue({
        data: 100,
        error: null,
      })

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
