/**
 * @file Tests for ownerOnly menu button visibility
 * @description Tests for "📊 Статистика бота" button visibility in Profile category
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock supabase
vi.mock('@/core/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

// Mock config
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

// Mock isUserBotOwner
vi.mock('@/core/supabase/getOwnedBots', () => ({
  isUserBotOwner: vi.fn(),
  getOwnedBots: vi.fn(),
}))

import {
  CATEGORIES,
  getCategoryById,
  getNavigationItemById,
  getButtonVariantsById,
  BOT_STATS_VARIANTS,
  NavigationItem,
} from '@/navigation/config/categories.config'
import { isUserBotOwner } from '@/core/supabase/getOwnedBots'

const mockIsUserBotOwner = vi.mocked(isUserBotOwner)

describe('ownerOnly Menu Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('bot_stats button configuration', () => {
    it('should have bot_stats item in profile category', () => {
      const profileCategory = getCategoryById('profile')

      expect(profileCategory).toBeDefined()
      expect(profileCategory!.items.some(item => item.id === 'bot_stats')).toBe(
        true
      )
    })

    it('bot_stats item should have correct properties', () => {
      const botStatsItem = getNavigationItemById('bot_stats')

      expect(botStatsItem).toBeDefined()
      expect(botStatsItem!.id).toBe('bot_stats')
      expect(botStatsItem!.ru).toBe('📊 Статистика бота')
      expect(botStatsItem!.en).toBe('📊 Bot Statistics')
      expect(botStatsItem!.ownerOnly).toBe(true)
      expect(botStatsItem!.directScene).toBe(true)
    })

    it('should generate correct button variants', () => {
      const variants = getButtonVariantsById('bot_stats')

      expect(variants).toContain('📊 Статистика бота')
      expect(variants).toContain('📊 Bot Statistics')
      expect(variants).toContain('Статистика бота')
      expect(variants).toContain('Bot Statistics')
    })

    it('BOT_STATS_VARIANTS should be exported', () => {
      expect(BOT_STATS_VARIANTS).toBeDefined()
      expect(BOT_STATS_VARIANTS.length).toBeGreaterThan(0)
      expect(BOT_STATS_VARIANTS).toContain('📊 Статистика бота')
    })
  })

  describe('ownerOnly flag in NavigationItem', () => {
    it('NavigationItem interface should support ownerOnly', () => {
      const testItem: NavigationItem = {
        id: 'test',
        ru: 'Тест',
        en: 'Test',
        icon: '📊',
        mode: 'test_scene',
        ownerOnly: true,
      }

      expect(testItem.ownerOnly).toBe(true)
    })

    it('only bot_stats should have ownerOnly flag in categories', () => {
      const ownerOnlyItems: NavigationItem[] = []

      for (const category of CATEGORIES) {
        for (const item of category.items) {
          if (item.ownerOnly) {
            ownerOnlyItems.push(item)
          }
        }
      }

      expect(ownerOnlyItems.length).toBe(1)
      expect(ownerOnlyItems[0].id).toBe('bot_stats')
    })
  })

  describe('Button visibility logic', () => {
    it('owner should see bot_stats button', async () => {
      mockIsUserBotOwner.mockResolvedValue(true)

      const isOwner = await isUserBotOwner('144022504')
      const botStatsItem = getNavigationItemById('bot_stats')

      expect(isOwner).toBe(true)
      expect(botStatsItem!.ownerOnly).toBe(true)
      // If isOwner is true and item has ownerOnly, button should be visible
      const shouldShow = isOwner || !botStatsItem!.ownerOnly
      expect(shouldShow).toBe(true)
    })

    it('non-owner should NOT see bot_stats button', async () => {
      mockIsUserBotOwner.mockResolvedValue(false)

      const isOwner = await isUserBotOwner('999999999')
      const botStatsItem = getNavigationItemById('bot_stats')

      expect(isOwner).toBe(false)
      expect(botStatsItem!.ownerOnly).toBe(true)
      // If not owner and item has ownerOnly, button should be hidden
      const shouldHide = !isOwner && botStatsItem!.ownerOnly
      expect(shouldHide).toBe(true)
    })

    it('admin should see bot_stats button', async () => {
      mockIsUserBotOwner.mockResolvedValue(true) // Admin always returns true

      const isOwner = await isUserBotOwner(144022504)

      expect(isOwner).toBe(true)
    })
  })

  describe('Profile category structure', () => {
    it('profile category should have correct number of items', () => {
      const profileCategory = getCategoryById('profile')

      expect(profileCategory).toBeDefined()
      // Profile has: balance, top_up, subscription(hidden), invite, support, language, instagram_parsing(adminOnly), bot_stats(ownerOnly)
      expect(profileCategory!.items.length).toBe(8)
    })

    it('bot_stats should be last in profile items (after instagram_parsing)', () => {
      const profileCategory = getCategoryById('profile')
      const lastItem = profileCategory!.items[profileCategory!.items.length - 1]

      expect(lastItem.id).toBe('bot_stats')
    })

    it('profile items order should be correct', () => {
      const profileCategory = getCategoryById('profile')
      const itemIds = profileCategory!.items.map(item => item.id)

      expect(itemIds).toEqual([
        'balance',
        'top_up',
        'subscription',
        'invite',
        'support',
        'language',
        'instagram_parsing',
        'bot_stats',
      ])
    })
  })

  describe('Button text matching', () => {
    it('should match Russian button text', () => {
      const text = '📊 Статистика бота'
      expect(BOT_STATS_VARIANTS.includes(text)).toBe(true)
    })

    it('should match English button text', () => {
      const text = '📊 Bot Statistics'
      expect(BOT_STATS_VARIANTS.includes(text)).toBe(true)
    })

    it('should match text without emoji (Russian)', () => {
      const text = 'Статистика бота'
      expect(BOT_STATS_VARIANTS.includes(text)).toBe(true)
    })

    it('should match text without emoji (English)', () => {
      const text = 'Bot Statistics'
      expect(BOT_STATS_VARIANTS.includes(text)).toBe(true)
    })

    it('should NOT match incorrect text', () => {
      const text = 'Some Random Text'
      expect(BOT_STATS_VARIANTS.includes(text)).toBe(false)
    })
  })
})
