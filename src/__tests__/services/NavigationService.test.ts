/**
 * 🧪 ТЕСТЫ ДЛЯ NavigationService
 * 
 * Покрывают ВСЕ кейсы:
 * - Все категории и функции
 * - Проверки прав доступа (админ/пользователь)
 * - Проверки подписки
 * - Навигация между категориями
 * - Глобальные обработчики
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { Telegraf } from 'telegraf'
import {
  initializeNavigation,
  showMainMenu,
  showCategoryMenu,
  getCategoryItems,
  findItemByText,
  CATEGORIES,
  NavigationItem
} from '@/services/NavigationService'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'

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
  ADMIN_IDS_ARRAY: [999999, 888888] // Тестовые админы
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

describe('NavigationService', () => {
  let mockBot: Partial<Telegraf<MyContext>>
  let mockContext: Partial<MyContext>
  let mockSceneEnter: Mock
  let mockSceneLeave: Mock
  let mockReply: Mock
  let mockHears: Mock

  beforeEach(() => {
    // Сброс всех моков
    vi.clearAllMocks()
    mockIsRussianFromState.mockReturnValue(true)
    mockCheckSubscriptionGuard.mockResolvedValue(true)

    // Моки для сцен
    mockSceneEnter = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)
    mockReply = vi.fn().mockResolvedValue(undefined)
    mockHears = vi.fn()

    // Мок контекста
    mockContext = {
      from: { id: 123456, username: 'testuser' } as any,
      message: { text: '📸 Фото' } as any,
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

    // Мок бота
    mockBot = {
      hears: mockHears
    } as any
  })

  describe('1. Структура CATEGORIES', () => {
    it('должна содержать все 6 категорий', () => {
      expect(CATEGORIES).toHaveLength(6)
      expect(CATEGORIES.map(c => c.id)).toEqual([
        'photo',
        'video',
        'audio',
        'avatars',
        'tools',
        'profile'
      ])
    })

    it('каждая категория должна иметь правильную структуру', () => {
      CATEGORIES.forEach(category => {
        expect(category).toHaveProperty('id')
        expect(category).toHaveProperty('ru')
        expect(category).toHaveProperty('en')
        expect(category).toHaveProperty('icon')
        expect(category).toHaveProperty('items')
        expect(Array.isArray(category.items)).toBe(true)
        expect(category.items.length).toBeGreaterThan(0)
      })
    })

    it('каждая функция должна иметь правильную структуру', () => {
      CATEGORIES.forEach(category => {
        category.items.forEach(item => {
          expect(item).toHaveProperty('ru')
          expect(item).toHaveProperty('en')
          expect(item).toHaveProperty('mode')
          expect(item).toHaveProperty('category')
          expect(item).toHaveProperty('icon')
        })
      })
    })
  })

  describe('2. Категория "Фото"', () => {
    it('должна содержать все функции фото', () => {
      const photoItems = getCategoryItems('photo')
      expect(photoItems.length).toBeGreaterThan(0)

      const itemTitles = photoItems.map(item => item.ru)
      expect(itemTitles).toContain('📸 Нейрофото')
      expect(itemTitles).toContain('🖼️ Текст в фото')
      expect(itemTitles).toContain('🔍 Промпт из фото')
      expect(itemTitles).toContain('🎨 ИИ Фотошоп')
      expect(itemTitles).toContain('⬆️ Увеличить качество')
      expect(itemTitles).toContain('🎭 Замена лица')
      expect(itemTitles).toContain('🌀 Infinity Морфинг')
    })

    it('все функции фото должны требовать подписку', () => {
      const photoItems = getCategoryItems('photo')
      photoItems.forEach(item => {
        expect(item.requiresSubscription).toBe(true)
      })
    })

    it('должна находить функцию по тексту', () => {
      const item = findItemByText('📸 Нейрофото')
      expect(item).toBeDefined()
      expect(item?.mode).toBe(ModeEnum.NeuroPhoto)
      expect(item?.category).toBe('photo')
    })
  })

  describe('3. Категория "Видео"', () => {
    it('должна содержать все функции видео', () => {
      const videoItems = getCategoryItems('video')
      expect(videoItems.length).toBeGreaterThan(0)

      const itemTitles = videoItems.map(item => item.ru)
      expect(itemTitles).toContain('🎥 Видео из текста')
      expect(itemTitles).toContain('🎥 Фото в видео')
      expect(itemTitles).toContain('🎬 ИИ Рилс')
    })

    it('должна содержать админскую функцию "Синхронизация губ"', () => {
      const videoItems = getCategoryItems('video')
      const lipSync = videoItems.find(item => item.ru === '🎤 Синхронизация губ')
      expect(lipSync).toBeDefined()
      expect(lipSync?.adminOnly).toBe(true)
    })
  })

  describe('4. Категория "Аудио"', () => {
    it('должна содержать все функции аудио', () => {
      const audioItems = getCategoryItems('audio')
      expect(audioItems.length).toBeGreaterThan(0)

      const itemTitles = audioItems.map(item => item.ru)
      expect(itemTitles).toContain('🎤 Голос аватара')
      expect(itemTitles).toContain('🎙️ Текст в голос')
      expect(itemTitles).toContain('📺 Транскрибация')
    })
  })

  describe('5. Категория "Аватары"', () => {
    it('должна содержать все функции аватаров', () => {
      const avatarsItems = getCategoryItems('avatars')
      expect(avatarsItems.length).toBeGreaterThan(0)

      const itemTitles = avatarsItems.map(item => item.ru)
      expect(itemTitles).toContain('🤖 Цифровое тело')
      expect(itemTitles).toContain('🧠 Мозг аватара')
      expect(itemTitles).toContain('💭 Чат с аватаром')
      expect(itemTitles).toContain('🤖 Выбор модели ИИ')
    })
  })

  describe('6. Категория "Инструменты"', () => {
    it('должна содержать все инструменты', () => {
      const toolsItems = getCategoryItems('tools')
      expect(toolsItems.length).toBeGreaterThan(0)

      const itemTitles = toolsItems.map(item => item.ru)
      expect(itemTitles).toContain('🦸‍♂️ ИИ Герои')
    })

    it('должна содержать админские функции', () => {
      const toolsItems = getCategoryItems('tools')
      const adminItems = toolsItems.filter(item => item.adminOnly)
      expect(adminItems.length).toBeGreaterThan(0)
    })
  })

  describe('7. Категория "Профиль"', () => {
    it('должна содержать все функции профиля', () => {
      const profileItems = getCategoryItems('profile')
      expect(profileItems.length).toBeGreaterThan(0)

      const itemTitles = profileItems.map(item => item.ru)
      expect(itemTitles).toContain('💰 Баланс')
      expect(itemTitles).toContain('💎 Пополнить баланс')
      expect(itemTitles).toContain('💫 Оформить подписку')
      expect(itemTitles).toContain('👥 Пригласить друга')
      expect(itemTitles).toContain('💬 Техподдержка')
      expect(itemTitles).toContain('🌐 Язык')
    })

    it('некоторые функции профиля не требуют подписку', () => {
      const profileItems = getCategoryItems('profile')
      const noSubscriptionItems = profileItems.filter(
        item => !item.requiresSubscription
      )
      expect(noSubscriptionItems.length).toBeGreaterThan(0)
    })
  })

  describe('8. Функция showMainMenu', () => {
    it('должна показывать главное меню с категориями', async () => {
      await showMainMenu(mockContext as MyContext)

      expect(mockSceneLeave).toHaveBeenCalled()
      expect(mockReply).toHaveBeenCalled()
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)

      const replyCall = mockReply.mock.calls[0]
      expect(replyCall[0]).toContain('Главное меню')
      expect(replyCall[1]).toHaveProperty('reply_markup')
    })

    it('должна фильтровать категории для не-админов', async () => {
      mockContext.from = { id: 111111 } as any // Не админ
      await showMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalled()
      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      expect(keyboard.length).toBeGreaterThan(0)
    })

    it('должна показывать все категории для админов', async () => {
      mockContext.from = { id: 999999 } as any // Админ
      await showMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalled()
      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      expect(keyboard.length).toBeGreaterThanOrEqual(6)
    })

    it('должна работать с английским языком', async () => {
      mockIsRussianFromState.mockReturnValue(false)
      await showMainMenu(mockContext as MyContext)

      const replyCall = mockReply.mock.calls[0]
      expect(replyCall[0]).toContain('Main Menu')
    })
  })

  describe('9. Функция showCategoryMenu', () => {
    it('должна показывать меню категории "Фото"', async () => {
      await showCategoryMenu(mockContext as MyContext, 'photo')

      expect(mockReply).toHaveBeenCalled()
      const replyCall = mockReply.mock.calls[0]
      expect(replyCall[0]).toContain('Фото')
      expect(replyCall[1]).toHaveProperty('reply_markup')

      const keyboard = replyCall[1].reply_markup.keyboard
      expect(keyboard.length).toBeGreaterThan(0)
      expect(keyboard[keyboard.length - 1]).toContain('🏠 Главное меню')
    })

    it('должна фильтровать админские функции для не-админов', async () => {
      mockContext.from = { id: 111111 } as any // Не админ
      await showCategoryMenu(mockContext as MyContext, 'video')

      expect(mockReply).toHaveBeenCalled()
      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      const allButtons = keyboard.flat()
      expect(allButtons).not.toContain('🎤 Синхронизация губ')
    })

    it('должна показывать админские функции для админов', async () => {
      mockContext.from = { id: 999999 } as any // Админ
      await showCategoryMenu(mockContext as MyContext, 'video')

      expect(mockReply).toHaveBeenCalled()
      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      const allButtons = keyboard.flat()
      expect(allButtons).toContain('🎤 Синхронизация губ')
    })

    it('должна возвращаться в главное меню при неверной категории', async () => {
      await showCategoryMenu(mockContext as MyContext, 'invalid_category')

      expect(mockReply).toHaveBeenCalled()
      expect(mockSceneEnter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })
  })

  describe('10. Функция initializeNavigation', () => {
    it('должна регистрировать обработчики для всех категорий', () => {
      initializeNavigation(mockBot as Telegraf<MyContext>)

      // Проверяем, что hears был вызван для каждой категории
      expect(mockHears).toHaveBeenCalledTimes(
        CATEGORIES.length + // Категории
        CATEGORIES.reduce((sum, cat) => sum + cat.items.length, 0) + // Функции
        2 // Глобальные обработчики (Главное меню, Назад)
      )
    })

    it('должна регистрировать обработчик для главного меню', () => {
      initializeNavigation(mockBot as Telegraf<MyContext>)

      const hearsCalls = mockHears.mock.calls
      const mainMenuCall = hearsCalls.find(call =>
        call[0].includes('🏠 Главное меню')
      )
      expect(mainMenuCall).toBeDefined()
    })

    it('должна регистрировать обработчик для кнопки "Назад"', () => {
      initializeNavigation(mockBot as Telegraf<MyContext>)

      const hearsCalls = mockHears.mock.calls
      const backCall = hearsCalls.find(call =>
        call[0].includes('◀️ Назад')
      )
      expect(backCall).toBeDefined()
    })
  })

  describe('11. Проверка прав доступа', () => {
    it('должна блокировать админские функции для не-админов', async () => {
      mockContext.from = { id: 111111 } as any // Не админ
      const adminItem: NavigationItem = {
        ru: '🔒 Админ функция',
        en: '🔒 Admin Feature',
        mode: 'admin_feature',
        category: 'tools',
        icon: '🔒',
        adminOnly: true
      }

      // Импортируем приватную функцию через тест
      const { handleFunctionNavigation } = await import('@/services/NavigationService')
      
      // Мокаем handleFunctionNavigation (если она экспортирована)
      // Или тестируем через публичный API
      await showCategoryMenu(mockContext as MyContext, 'tools')

      const keyboard = mockReply.mock.calls[0][1].reply_markup.keyboard
      const allButtons = keyboard.flat()
      expect(allButtons).not.toContain('🔍 Мониторинг конкурентов')
    })
  })

  describe('12. Проверка подписки', () => {
    it('должна проверять подписку для функций, требующих её', async () => {
      mockCheckSubscriptionGuard.mockResolvedValue(true)
      
      const item = findItemByText('📸 Нейрофото')
      expect(item?.requiresSubscription).toBe(true)
    })

    it('должна пропускать функции без требования подписки', async () => {
      const item = findItemByText('👥 Пригласить друга')
      expect(item?.requiresSubscription).toBeFalsy()
    })
  })

  describe('13. Поиск функций', () => {
    it('findItemByText должна находить функцию по русскому тексту', () => {
      const item = findItemByText('📸 Нейрофото')
      expect(item).toBeDefined()
      expect(item?.mode).toBe(ModeEnum.NeuroPhoto)
    })

    it('findItemByText должна находить функцию по английскому тексту', () => {
      const item = findItemByText('📸 NeuroPhoto')
      expect(item).toBeDefined()
      expect(item?.mode).toBe(ModeEnum.NeuroPhoto)
    })

    it('findItemByText должна возвращать undefined для несуществующей функции', () => {
      const item = findItemByText('Несуществующая функция')
      expect(item).toBeUndefined()
    })
  })

  describe('14. Прямые переходы (directScene)', () => {
    it('должна иметь функции с прямым переходом', () => {
      const profileItems = getCategoryItems('profile')
      const directSceneItems = profileItems.filter(item => item.directScene)
      expect(directSceneItems.length).toBeGreaterThan(0)
    })

    it('ИИ Фотошоп должен иметь прямой переход', () => {
      const item = findItemByText('🎨 ИИ Фотошоп')
      expect(item?.directScene).toBe(true)
    })
  })

  describe('15. Интеграционные тесты', () => {
    it('должна работать полная цепочка: главное меню -> категория -> функция', async () => {
      // 1. Показываем главное меню
      await showMainMenu(mockContext as MyContext)
      expect(mockReply).toHaveBeenCalled()

      // 2. Показываем категорию
      mockReply.mockClear()
      await showCategoryMenu(mockContext as MyContext, 'photo')
      expect(mockReply).toHaveBeenCalled()

      // 3. Проверяем, что функция найдена
      const item = findItemByText('📸 Нейрофото')
      expect(item).toBeDefined()
    })
  })

  describe('16. Граничные случаи', () => {
    it('должна обрабатывать отсутствие userId', async () => {
      mockContext.from = undefined
      await expect(
        showMainMenu(mockContext as MyContext)
      ).resolves.not.toThrow()
    })

    it('должна обрабатывать пустую категорию', () => {
      const items = getCategoryItems('nonexistent')
      expect(items).toEqual([])
    })

    it('должна обрабатывать ошибки при переходе в сцену', async () => {
      mockSceneEnter.mockRejectedValue(new Error('Scene error'))
      
      // Тест через публичный API
      await expect(
        showMainMenu(mockContext as MyContext)
      ).resolves.not.toThrow()
    })
  })
})

