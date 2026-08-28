/**
 * @file Tests for getOwnedBots and isUserBotOwner
 * @description Tests for bot ownership verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock supabase - factory function with inline mock
vi.mock('@/core/supabase/client', () => {
  const mockEq = vi.fn()
  const mockSelect = vi.fn(() => ({
    eq: mockEq,
  }))
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
  }))

  return {
    supabase: {
      from: mockFrom,
      // Expose mocks for test access
      __mocks: { mockFrom, mockSelect, mockEq },
    },
  }
})

// Mock config with admin IDs
vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [144022504, 123456789],
}))

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { getOwnedBots, isUserBotOwner } from '@/core/supabase/getOwnedBots'
import { supabase } from '@/core/supabase/client'

// Get access to mocks
const mocks = (supabase as any).__mocks as {
  mockFrom: ReturnType<typeof vi.fn>
  mockSelect: ReturnType<typeof vi.fn>
  mockEq: ReturnType<typeof vi.fn>
}

describe('getOwnedBots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getOwnedBots()', () => {
    it('should return bots for valid owner', async () => {
      mocks.mockEq.mockResolvedValue({
        data: [{ bot_name: 'neuro_blogger_bot' }, { bot_name: 'ZavaraBot' }],
        error: null,
      })

      const result = await getOwnedBots('144022504')

      expect(result).toEqual(['neuro_blogger_bot', 'ZavaraBot'])
      expect(mocks.mockFrom).toHaveBeenCalledWith('avatars')
      expect(mocks.mockSelect).toHaveBeenCalledWith('bot_name')
      expect(mocks.mockEq).toHaveBeenCalledWith('telegram_id', '144022504')
    })

    it('should return empty array for non-owner', async () => {
      mocks.mockEq.mockResolvedValue({
        data: [],
        error: null,
      })

      const result = await getOwnedBots('999999999')

      expect(result).toEqual([])
    })

    it('should return null when ownerTelegramId is empty', async () => {
      const result = await getOwnedBots('')

      expect(result).toBeNull()
      expect(mocks.mockFrom).not.toHaveBeenCalled()
    })

    it('should return null on database error', async () => {
      mocks.mockEq.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      })

      const result = await getOwnedBots('123456')

      expect(result).toBeNull()
    })

    it('should filter out null bot_names', async () => {
      mocks.mockEq.mockResolvedValue({
        data: [
          { bot_name: 'neuro_blogger_bot' },
          { bot_name: null },
          { bot_name: 'ZavaraBot' },
          { bot_name: '' },
        ],
        error: null,
      })

      const result = await getOwnedBots('144022504')

      // Empty strings are filtered, null values are filtered
      expect(result).toEqual(['neuro_blogger_bot', 'ZavaraBot'])
    })
  })

  describe('isUserBotOwner()', () => {
    it('should return true for super-admin (144022504)', async () => {
      // Super-admins should always have access, no DB call needed
      const result = await isUserBotOwner(144022504)

      expect(result).toBe(true)
    })

    it('should return true for super-admin as string', async () => {
      const result = await isUserBotOwner('144022504')

      expect(result).toBe(true)
    })

    it('should return true for another admin (123456789)', async () => {
      const result = await isUserBotOwner(123456789)

      expect(result).toBe(true)
    })

    it('should return true for user who owns bots', async () => {
      mocks.mockEq.mockResolvedValue({
        data: [{ bot_name: 'some_bot' }],
        error: null,
      })

      const result = await isUserBotOwner('555555555')

      expect(result).toBe(true)
    })

    it('should return false for non-owner non-admin', async () => {
      mocks.mockEq.mockResolvedValue({
        data: [],
        error: null,
      })

      const result = await isUserBotOwner('999999999')

      expect(result).toBe(false)
    })

    it('should return false for undefined telegramId', async () => {
      const result = await isUserBotOwner(undefined)

      expect(result).toBe(false)
    })

    it('should return false on database error (non-admin)', async () => {
      mocks.mockEq.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      })

      const result = await isUserBotOwner('777777777')

      expect(result).toBe(false)
    })
  })
})
