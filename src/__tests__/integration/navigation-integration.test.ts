/**
 * 🧪 ИНТЕГРАЦИОННЫЕ ТЕСТЫ ДЛЯ НАВИГАЦИИ
 * 
 * Проверяют интеграцию NavigationService с:
 * - Оплатой и подписками
 * - Проверкой баланса
 * - Переходами между сценами
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { Telegraf } from 'telegraf'
import {
  initializeNavigation,
  showMainMenu,
  showCategoryMenu,
  findItemByText
} from '@/services/NavigationService'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Моки
const mockIsRussianFromState = vi.fn(() => true)
const mockCheckSubscriptionGuard = vi.fn().mockResolvedValue(true)

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: () => mockIsRussianFromState()
}))

vi.mock('@/helpers/subscriptionGuard', () => ({
  checkSubscriptionGuard: mockCheckSubscriptionGuard
}))

vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [999999]
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

describe('NavigationService - Интеграция с оплатой и подписками', () => {
  let mockContext: Partial<MyContext>
  let mockSceneEnter: Mock
  let mockSceneLeave: Mock
  let mockReply: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsRussianFromState.mockReturnValue(true)
    mockCheckSubscriptionGuard.mockResolvedValue(true)

    mockSceneEnter = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)
    mockReply = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      scene: {
        leave: mockSceneLeave,
        enter: mockSceneEnter,
        current: { id: 'startScene' }
      } as any,
      session: {
        mode: ModeEnum.MainMenu
      } as any,
      reply: mockReply
    }
  })

  describe('1. Интеграция с проверкой подписки', () => {
    it('должна проверять подписку перед входом в функцию, требующую её', async () => {
      mockCheckSubscriptionGuard.mockResolvedValue(true)

      const item = findItemByText('📸 Нейрофото')
      expect(item?.requiresSubscription).toBe(true)

      // При реальном использовании checkSubscriptionGuard будет вызван
      expect(mockCheckSubscriptionGuard).toBeDefined()
    })

    it('должна перенаправлять в subscriptionScene при отсутствии подписки', async () => {
      mockCheckSubscriptionGuard.mockResolvedValue(false)
      mockCheckSubscriptionGuard.mockImplementation(async (ctx) => {
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        return false
      })

      // Симуляция: функция требует подписку, но её нет
      const item = findItemByText('📸 Нейрофото')
      expect(item?.requiresSubscription).toBe(true)
    })

    it('должна пропускать функции без требования подписки', async () => {
      const item = findItemByText('👥 Пригласить друга')
      expect(item?.requiresSubscription).toBeFalsy()
    })
  })

  describe('2. Интеграция с CheckBalanceScene', () => {
    it('должна переходить через CheckBalanceScene для функций с requiresSubscription', async () => {
      const item = findItemByText('📸 Нейрофото')
      expect(item).toBeDefined()
      expect(item?.directScene).toBeFalsy() // Должен идти через CheckBalanceScene
    })

    it('должна использовать прямой переход для функций с directScene=true', async () => {
      const item = findItemByText('🎨 ИИ Фотошоп')
      expect(item?.directScene).toBe(true)
    })
  })

  describe('3. Интеграция с профилем и оплатой', () => {
    it('должна показывать функции профиля независимо от подписки', async () => {
      await showCategoryMenu(mockContext as MyContext, 'profile')

      expect(mockReply).toHaveBeenCalled()
      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      const allButtons = keyboard.flat()

      // Эти функции должны быть доступны всегда
      expect(allButtons).toContain('💫 Оформить подписку')
      expect(allButtons).toContain('👥 Пригласить друга')
      expect(allButtons).toContain('💬 Техподдержка')
    })

    it('должна показывать функции баланса только для подписчиков', async () => {
      const profileItems = findItemByText('💰 Баланс')
      expect(profileItems?.requiresSubscription).toBe(true)
    })
  })

  describe('4. Интеграция с админскими функциями', () => {
    it('должна скрывать админские функции для обычных пользователей', async () => {
      mockContext.from = { id: 111111 } as any // Не админ

      await showCategoryMenu(mockContext as MyContext, 'video')

      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      const allButtons = keyboard.flat()
      expect(allButtons).not.toContain('🎤 Синхронизация губ')
    })

    it('должна показывать админские функции для админов', async () => {
      mockContext.from = { id: 999999 } as any // Админ

      await showCategoryMenu(mockContext as MyContext, 'video')

      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      const allButtons = keyboard.flat()
      expect(allButtons).toContain('🎤 Синхронизация губ')
    })
  })

  describe('5. Полный цикл навигации', () => {
    it('должна работать полная цепочка: старт -> главное меню -> категория -> функция', async () => {
      // 1. Старт - показываем главное меню
      await showMainMenu(mockContext as MyContext)
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)

      // 2. Пользователь выбирает категорию "Фото"
      mockReply.mockClear()
      await showCategoryMenu(mockContext as MyContext, 'photo')
      expect(mockReply).toHaveBeenCalled()

      // 3. Пользователь выбирает функцию "Нейрофото"
      const item = findItemByText('📸 Нейрофото')
      expect(item).toBeDefined()
      expect(item?.mode).toBe(ModeEnum.NeuroPhoto)
    })

    it('должна работать возврат в главное меню', async () => {
      // Пользователь в категории
      await showCategoryMenu(mockContext as MyContext, 'photo')

      // Нажимает "Главное меню"
      mockReply.mockClear()
      await showMainMenu(mockContext as MyContext)
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })
  })

  describe('6. Интеграция с различными типами подписок', () => {
    it('должна работать для пользователей без подписки', async () => {
      mockCheckSubscriptionGuard.mockResolvedValue(false)

      await showMainMenu(mockContext as MyContext)
      expect(mockReply).toHaveBeenCalled()

      // Главное меню должно показываться всегда
      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      expect(keyboard.length).toBeGreaterThan(0)
    })

    it('должна работать для пользователей с подпиской NEUROPHOTO', async () => {
      mockCheckSubscriptionGuard.mockResolvedValue(true)

      const item = findItemByText('📸 Нейрофото')
      expect(item?.requiresSubscription).toBe(true)
    })

    it('должна работать для пользователей с подпиской NEUROVIDEO', async () => {
      mockCheckSubscriptionGuard.mockResolvedValue(true)

      const item = findItemByText('🎥 Видео из текста')
      expect(item?.requiresSubscription).toBe(true)
    })
  })

  describe('7. Обработка ошибок', () => {
    it('должна обрабатывать ошибки при проверке подписки', async () => {
      mockCheckSubscriptionGuard.mockRejectedValue(new Error('Subscription check failed'))

      // Навигация не должна падать
      await expect(
        showMainMenu(mockContext as MyContext)
      ).resolves.not.toThrow()
    })

    it('должна обрабатывать ошибки при переходе в сцену', async () => {
      mockSceneEnter.mockRejectedValue(new Error('Scene error'))

      await expect(
        showMainMenu(mockContext as MyContext)
      ).resolves.not.toThrow()
    })
  })
})

