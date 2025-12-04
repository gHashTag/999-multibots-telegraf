/**
 * 🧪 Тесты для NavigationService
 *
 * Покрывает всю функциональность навигации:
 * - Регистрация обработчиков категорий
 * - Регистрация обработчиков функций
 * - Регистрация обработчиков профиля (включая реферальную систему)
 * - Глобальные обработчики (Главное меню, Назад, Справка)
 * - Проверки прав доступа (админ, подписка)
 * - Отображение меню
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import {
  initializeNavigation,
  showMainMenu,
  showCategoryMenu,
  getButtonTextsByMode,
  getSpecialButtonTexts,
  CATEGORIES,
} from '@/services/NavigationService'
import { ModeEnum } from '@/interfaces/modes'
import { SubscriptionType } from '@/interfaces/subscription.interface'

// Моки
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => true),
}))

vi.mock('@/helpers/subscriptionGuard', () => ({
  checkSubscriptionGuard: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/core/supabase', () => ({
  getReferalsCountAndUserData: vi.fn(() =>
    Promise.resolve({
      subscriptionType: SubscriptionType.NEUROPHOTO,
      count: 5,
      userData: { user_id: 'test-user-id' },
    })
  ),
}))

vi.mock('@/config', () => ({
  ADMIN_IDS_ARRAY: [123456789],
}))

describe('NavigationService', () => {
  let bot: Telegraf<MyContext>
  let mockCtx: Partial<MyContext>

  beforeEach(() => {
    bot = {
      hears: vi.fn(),
    } as any

    mockCtx = {
      from: { id: 123456789 },
      scene: {
        leave: vi.fn(() => Promise.resolve()),
        enter: vi.fn(() => Promise.resolve()),
        current: { id: 'test-scene' },
      },
      reply: vi.fn(() => Promise.resolve({} as any)),
      replyWithHTML: vi.fn(() => Promise.resolve({} as any)),
      session: {
        mode: ModeEnum.MainMenu,
        language_code: 'ru',
      },
      telegram: {
        token: 'test-token',
      },
    } as any
  })

  describe('initializeNavigation', () => {
    it('должен зарегистрировать все обработчики', () => {
      initializeNavigation(bot)

      // Проверяем, что hears был вызван для категорий, функций и глобальных обработчиков
      expect(bot.hears).toHaveBeenCalled()
      const callsCount = (bot.hears as Mock).mock.calls.length
      expect(callsCount).toBeGreaterThan(0)
    })

    it('должен зарегистрировать обработчики для всех категорий', () => {
      initializeNavigation(bot)

      // Проверяем регистрацию обработчиков категорий
      const categoryCalls = (bot.hears as Mock).mock.calls.filter(
        call => CATEGORIES.some(cat => call[0]?.includes(cat.ru))
      )
      expect(categoryCalls.length).toBeGreaterThanOrEqual(CATEGORIES.length)
    })
  })

  describe('showMainMenu', () => {
    it('должен показать главное меню с категориями', async () => {
      await showMainMenu(mockCtx as MyContext)

      expect(mockCtx.reply).toHaveBeenCalled()
      const replyCall = (mockCtx.reply as Mock).mock.calls[0]
      expect(replyCall[0]).toContain('Главное меню')
      expect(replyCall[1]).toHaveProperty('reply_markup')
    })

    it('должен включить важные кнопки из профиля', async () => {
      await showMainMenu(mockCtx as MyContext)

      const replyCall = (mockCtx.reply as Mock).mock.calls[0]
      const keyboard = replyCall[1].reply_markup.keyboard
      const buttonTexts = keyboard.flat()

      // Проверяем наличие важных кнопок
      expect(buttonTexts).toContain('💫 Оформить подписку')
      expect(buttonTexts).toContain('💬 Техподдержка')
    })
  })

  describe('showCategoryMenu', () => {
    it('должен показать меню категории с функциями', async () => {
      await showCategoryMenu(mockCtx as MyContext, 'photo')

      expect(mockCtx.reply).toHaveBeenCalled()
      const replyCall = (mockCtx.reply as Mock).mock.calls[0]
      expect(replyCall[0]).toContain('📸 Фото')
      expect(replyCall[1]).toHaveProperty('reply_markup')
    })

    it('должен фильтровать функции по правам доступа', async () => {
      // Тест для админской функции
      await showCategoryMenu(mockCtx as MyContext, 'tools')

      const replyCall = (mockCtx.reply as Mock).mock.calls[0]
      const keyboard = replyCall[1].reply_markup.keyboard
      const buttonTexts = keyboard.flat()

      // Админские функции должны быть видны админу
      if (mockCtx.from?.id === 123456789) {
        expect(buttonTexts).toContain('🔍 Мониторинг конкурентов')
      }
    })
  })

  describe('getButtonTextsByMode', () => {
    it('должен вернуть тексты кнопки по mode', () => {
      const texts = getButtonTextsByMode(ModeEnum.NeuroPhoto)
      expect(texts).toBeDefined()
      expect(texts?.ru).toBe('📸 Нейрофото')
      expect(texts?.en).toBe('📸 NeuroPhoto')
    })

    it('должен вернуть null для несуществующего mode', () => {
      const texts = getButtonTextsByMode('non-existent-mode' as ModeEnum)
      expect(texts).toBeNull()
    })
  })

  describe('getSpecialButtonTexts', () => {
    it('должен вернуть тексты для главного меню', () => {
      const texts = getSpecialButtonTexts('main_menu')
      expect(texts.ru).toBe('🏠 Главное меню')
      expect(texts.en).toBe('🏠 Main menu')
    })

    it('должен вернуть тексты для справки', () => {
      const texts = getSpecialButtonTexts('help')
      expect(texts.ru).toBe('💬 Техподдержка')
      expect(texts.en).toBe('💬 Tech Support')
    })

    it('должен вернуть тексты для отмены', () => {
      const texts = getSpecialButtonTexts('cancel')
      expect(texts.ru).toBe('Отмена')
      expect(texts.en).toBe('Cancel')
    })
  })

  describe('Обработчики профиля', () => {
    it('должен обработать кнопку "Пригласить друга" (реферальная система)', async () => {
      initializeNavigation(bot)

      // Находим обработчик для кнопки "Пригласить друга"
      const inviteHandler = (bot.hears as Mock).mock.calls.find(
        call =>
          call[0]?.includes('👥 Пригласить друга') ||
          call[0]?.includes('👥 Invite Friend')
      )

      expect(inviteHandler).toBeDefined()

      if (inviteHandler) {
        const handler = inviteHandler[1]
        await handler(mockCtx as MyContext)

        // Проверяем, что установлен режим и произошел переход в сцену
        expect(mockCtx.session?.mode).toBe(ModeEnum.Invite)
        expect(mockCtx.scene?.enter).toHaveBeenCalledWith(
          ModeEnum.CheckBalanceScene
        )
      }
    })

    it('должен обработать кнопку "Баланс" с проверкой подписки', async () => {
      initializeNavigation(bot)

      // Находим обработчик для кнопки "Баланс"
      const balanceHandler = (bot.hears as Mock).mock.calls.find(
        call =>
          call[0]?.includes('💰 Баланс') || call[0]?.includes('💰 Balance')
      )

      expect(balanceHandler).toBeDefined()

      if (balanceHandler) {
        const handler = balanceHandler[1]
        await handler(mockCtx as MyContext)

        // Проверяем, что установлен режим
        expect(mockCtx.session?.mode).toBe(ModeEnum.Balance)
      }
    })

    it('должен обработать кнопку "Пополнить баланс" с проверкой подписки', async () => {
      initializeNavigation(bot)

      // Находим обработчик для кнопки "Пополнить баланс"
      const topUpHandler = (bot.hears as Mock).mock.calls.find(
        call =>
          call[0]?.includes('💎 Пополнить баланс') ||
          call[0]?.includes('💎 Top up Balance')
      )

      expect(topUpHandler).toBeDefined()

      if (topUpHandler) {
        const handler = topUpHandler[1]
        await handler(mockCtx as MyContext)

        // Проверяем, что установлен режим и произошел переход в PaymentScene
        expect(mockCtx.session?.mode).toBe(ModeEnum.TopUpBalance)
        expect(mockCtx.scene?.enter).toHaveBeenCalledWith(
          ModeEnum.PaymentScene
        )
      }
    })
  })

  describe('Глобальные обработчики', () => {
    it('должен обработать кнопку "Главное меню"', async () => {
      initializeNavigation(bot)

      const mainMenuHandler = (bot.hears as Mock).mock.calls.find(
        call =>
          call[0]?.includes('🏠 Главное меню') ||
          call[0]?.includes('🏠 Main menu')
      )

      expect(mainMenuHandler).toBeDefined()

      if (mainMenuHandler) {
        const handler = mainMenuHandler[1]
        await handler(mockCtx as MyContext)

        expect(mockCtx.scene?.leave).toHaveBeenCalled()
        expect(mockCtx.reply).toHaveBeenCalled()
      }
    })

    it('должен обработать кнопку "Назад"', async () => {
      initializeNavigation(bot)

      const backHandler = (bot.hears as Mock).mock.calls.find(
        call => call[0]?.includes('◀️ Назад') || call[0]?.includes('◀️ Back')
      )

      expect(backHandler).toBeDefined()

      if (backHandler) {
        const handler = backHandler[1]
        await handler(mockCtx as MyContext)

        expect(mockCtx.scene?.leave).toHaveBeenCalled()
        expect(mockCtx.reply).toHaveBeenCalled()
      }
    })

    it('должен обработать кнопку "Справка"', async () => {
      initializeNavigation(bot)

      const helpHandler = (bot.hears as Mock).mock.calls.find(
        call => call[0]?.includes('❓ Справка') || call[0]?.includes('❓ Help')
      )

      expect(helpHandler).toBeDefined()

      if (helpHandler) {
        const handler = helpHandler[1]
        await handler(mockCtx as MyContext)

        expect(mockCtx.scene?.leave).toHaveBeenCalled()
        expect(mockCtx.scene?.enter).toHaveBeenCalledWith(ModeEnum.Help)
      }
    })
  })

  describe('Проверки прав доступа', () => {
    it('должен проверить админские права для админских функций', async () => {
      initializeNavigation(bot)

      // Находим обработчик для админской функции (например, Lip Sync)
      const adminHandler = (bot.hears as Mock).mock.calls.find(
        call =>
          call[0]?.includes('🎤 Синхронизация губ') ||
          call[0]?.includes('🎤 Lip Sync')
      )

      expect(adminHandler).toBeDefined()

      if (adminHandler) {
        const handler = adminHandler[1]
        await handler(mockCtx as MyContext)

        // Админ должен иметь доступ
        expect(mockCtx.session?.mode).toBeDefined()
      }
    })

    it('должен проверить подписку для функций, требующих подписку', async () => {
      const { checkSubscriptionGuard } = await import('@/helpers/subscriptionGuard')

      initializeNavigation(bot)

      // Находим обработчик для функции, требующей подписку
      const subscriptionHandler = (bot.hears as Mock).mock.calls.find(
        call =>
          call[0]?.includes('📸 Нейрофото') ||
          call[0]?.includes('📸 NeuroPhoto')
      )

      expect(subscriptionHandler).toBeDefined()

      if (subscriptionHandler) {
        const handler = subscriptionHandler[1]
        await handler(mockCtx as MyContext)

        // Проверяем, что была вызвана проверка подписки
        expect(checkSubscriptionGuard).toHaveBeenCalled()
      }
    })
  })

  describe('Структура CATEGORIES', () => {
    it('должен содержать все необходимые категории', () => {
      const categoryIds = CATEGORIES.map(cat => cat.id)
      expect(categoryIds).toContain('photo')
      expect(categoryIds).toContain('video')
      expect(categoryIds).toContain('audio')
      expect(categoryIds).toContain('avatars')
      expect(categoryIds).toContain('tools')
      expect(categoryIds).toContain('profile')
    })

    it('должен содержать функции в каждой категории', () => {
      CATEGORIES.forEach(category => {
        expect(category.items.length).toBeGreaterThan(0)
        category.items.forEach(item => {
          expect(item.ru).toBeDefined()
          expect(item.en).toBeDefined()
          expect(item.mode).toBeDefined()
        })
      })
    })

    it('должен содержать реферальную систему в профиле', () => {
      const profileCategory = CATEGORIES.find(cat => cat.id === 'profile')
      expect(profileCategory).toBeDefined()

      const inviteItem = profileCategory?.items.find(
        item => item.mode === ModeEnum.Invite
      )
      expect(inviteItem).toBeDefined()
      expect(inviteItem?.ru).toBe('👥 Пригласить друга')
      expect(inviteItem?.en).toBe('👥 Invite Friend')
    })
  })
})

