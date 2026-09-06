/**
 * 🧪 Тесты для menuKeyboard - генерация клавиатур меню
 *
 * Тестирует:
 * - createMainMenuKeyboard() - клавиатура главного меню
 * - createCategoryKeyboard() - клавиатура категории
 * - showMainMenu() - отправка главного меню
 * - showCategoryMenu() - отправка меню категории
 * - navigateToMainMenu() - переход в главное меню
 * - navigateToCategory() - переход в категорию
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import {
  createMainMenuKeyboard,
  createCategoryKeyboard,
  showMainMenu,
  showCategoryMenu,
  navigateToMainMenu,
  navigateToCategory,
} from '@/navigation/helpers/menuKeyboard'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { CATEGORIES, getCategoryText } from '@/navigation/config/categories.config'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Mock navigationLogger
vi.mock('@/navigation/helpers/navigationLogger', () => ({
  logSceneEnter: vi.fn(),
  logMainMenuReturn: vi.fn(),
}))

// Mock centralizedLanguage
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(),
}))

import { isRussianFromState } from '@/helpers/centralizedLanguage'
import type { MutableCtx } from '../helpers/mutableContext'

describe('menuKeyboard', () => {
  let mockContext: MutableCtx
  let mockReply: Mock
  let mockSceneLeave: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    mockReply = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      message: { text: 'test' } as any,
      scene: {
        current: { id: 'testScene' },
        leave: mockSceneLeave,
        enter: vi.fn().mockResolvedValue(undefined),
      } as any,
      reply: mockReply,
      state: {
        userLanguage: 'ru' as 'ru' | 'en',
      } as any,
      session: {} as any,
    }

    // По умолчанию - русский язык
    ;(isRussianFromState as Mock).mockReturnValue(true)
  })

  describe('createMainMenuKeyboard()', () => {
    /*
     * ГЛАВНОЕ МЕНЮ БОЛЬШЕ НЕ КЛАВИАТУРА, А ЕЁ СНЯТИЕ.
     *
     * Проверки здесь описывали список категорий и раскладку по три в ряд.
     * Владелец убрал список 06.09.2026: «чтобы вся работа в мини аппе или в
     * чате бота, так будет понятно». Аудит перед удалением показал, что все
     * кнопки ИСПРАВНЫ — убраны не поломанные, а лишние; сцены остались.
     *
     * Кнопка мини-аппа убрана отдельно и по другой причине: запуск с
     * reply-кнопки не несёт ни подписи, ни пользователя, поэтому приложение
     * встречало человека словом «Войти» прямо внутри Telegram. Подробности —
     * в miniAppButton.test.ts.
     */
    it('снимает клавиатуру, а не рисует пустую', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const keyboard = createMainMenuKeyboard(mockContext as MyContext)
      expect(keyboard.reply_markup).toHaveProperty('remove_keyboard', true)
    })

    it('в снятии нет ни одной кнопки — ни текстовой, ни web_app', () => {
      const сериализовано = JSON.stringify(
        createMainMenuKeyboard(mockContext as MyContext).reply_markup
      )
      expect(сериализовано).not.toContain('web_app')
      for (const cat of CATEGORIES) {
        expect(сериализовано).not.toContain(getCategoryText(cat, true))
      }
    })

    it('язык на снятие не влияет', () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)
      const keyboard = createMainMenuKeyboard(mockContext as MyContext)
      expect(keyboard.reply_markup).toHaveProperty('remove_keyboard', true)
    })
  })

  describe('createCategoryKeyboard()', () => {
    it('создаёт клавиатуру для существующей категории', () => {
      const categoryId = CATEGORIES[0].id

      const keyboard = createCategoryKeyboard(
        mockContext as MyContext,
        categoryId
      )

      expect(keyboard).toBeDefined()
      expect(keyboard.reply_markup).toBeDefined()
      expect(keyboard.reply_markup.keyboard).toBeDefined()
    })

    it('возвращает главное меню для несуществующей категории', () => {
      const keyboard = createCategoryKeyboard(
        mockContext as MyContext,
        'non-existent'
      )

      expect(keyboard).toBeDefined()
      /*
       * Возвращается ГЛАВНОЕ МЕНЮ — а оно теперь снимает клавиатуру. Важно
       * именно это: на неизвестную категорию человек получает осмысленный
       * ответ, а не пустоту и не обломок прежнего меню.
       */
      expect(keyboard.reply_markup).toHaveProperty('remove_keyboard', true)
    })

    it('группирует кнопки по 3 в ряд', () => {
      const categoryId = CATEGORIES[0].id

      const keyboard = createCategoryKeyboard(
        mockContext as MyContext,
        categoryId
      )
      const rows = keyboard.reply_markup.keyboard

      // Каждый ряд (кроме последнего с кнопкой "Главное меню") должен иметь макс 3 кнопки
      rows.slice(0, -1).forEach((row: any[]) => {
        expect(row.length).toBeLessThanOrEqual(3)
      })
    })

    it('добавляет кнопку "Главное меню" по умолчанию', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const categoryId = CATEGORIES[0].id

      const keyboard = createCategoryKeyboard(
        mockContext as MyContext,
        categoryId
      )
      const lastRow = keyboard.reply_markup.keyboard.at(-1)

      // Последний ряд должен содержать кнопку "Главное меню"
      expect(lastRow).toBeDefined()
      const buttonTexts = lastRow.map((btn: any) => btn.text || btn)
      expect(
        buttonTexts.some(
          (text: string) =>
            text.includes('Главное меню') || text.includes('Main menu')
        )
      ).toBe(true)
    })

    it('не добавляет кнопку "Главное меню" при includeBack: false', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const categoryId = CATEGORIES[0].id

      const keyboardWithBack = createCategoryKeyboard(
        mockContext as MyContext,
        categoryId,
        { includeBack: true }
      )
      const keyboardWithoutBack = createCategoryKeyboard(
        mockContext as MyContext,
        categoryId,
        { includeBack: false }
      )

      // Без кнопки "Назад" должно быть меньше строк или кнопок
      expect(
        keyboardWithoutBack.reply_markup.keyboard.length
      ).toBeLessThanOrEqual(keyboardWithBack.reply_markup.keyboard.length)
    })

    it('не показывает админские кнопки', () => {
      const categoryId = CATEGORIES[0].id

      const keyboard = createCategoryKeyboard(
        mockContext as MyContext,
        categoryId
      )
      const allButtons = keyboard.reply_markup.keyboard.flat()
      const buttonTexts = allButtons.map((btn: any) => btn.text || btn)

      // Проверяем, что нет кнопок с adminOnly
      const category = CATEGORIES.find(c => c.id === categoryId)
      const adminItems = category?.items.filter(item => item.adminOnly) || []

      adminItems.forEach(adminItem => {
        expect(buttonTexts).not.toContain(adminItem.ru)
        expect(buttonTexts).not.toContain(adminItem.en)
      })
    })

    it('имеет resize: true', () => {
      const categoryId = CATEGORIES[0].id

      const keyboard = createCategoryKeyboard(
        mockContext as MyContext,
        categoryId
      )

      expect(keyboard.reply_markup.resize_keyboard).toBe(true)
    })
  })

  describe('showMainMenu()', () => {
    it('отправляет сообщение с клавиатурой', async () => {
      await showMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalled()
    })

    it('показывает русский текст для русского языка', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await showMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('Главное меню'),
        expect.any(Object)
      )
    })

    it('показывает английский текст для английского языка', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await showMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('Main menu'),
        expect.any(Object)
      )
    })

    it('использует Markdown для форматирования', async () => {
      await showMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          parse_mode: 'Markdown',
        })
      )
    })

    it('показывает fallback при ошибке', async () => {
      mockReply
        .mockRejectedValueOnce(new Error('Telegram error'))
        .mockResolvedValueOnce(undefined)

      await showMainMenu(mockContext as MyContext)

      // Должно быть 2 вызова: первый с ошибкой, второй fallback
      expect(mockReply).toHaveBeenCalledTimes(2)
    })

    it('включает reply_markup в ответ', async () => {
      await showMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reply_markup: expect.any(Object),
        })
      )
    })
  })

  describe('showCategoryMenu()', () => {
    it('отправляет сообщение с клавиатурой категории', async () => {
      const categoryId = CATEGORIES[0].id

      await showCategoryMenu(mockContext as MyContext, categoryId)

      expect(mockReply).toHaveBeenCalled()
    })

    it('показывает главное меню для несуществующей категории', async () => {
      await showCategoryMenu(mockContext as MyContext, 'non-existent')

      // Должен показать главное меню как fallback
      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('меню') || expect.stringContaining('menu'),
        expect.any(Object)
      )
    })

    it('показывает русский текст для русского языка', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const categoryId = CATEGORIES[0].id

      await showCategoryMenu(mockContext as MyContext, categoryId)

      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('функцию'),
        expect.any(Object)
      )
    })

    it('показывает английский текст для английского языка', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)
      const categoryId = CATEGORIES[0].id

      await showCategoryMenu(mockContext as MyContext, categoryId)

      expect(mockReply).toHaveBeenCalledWith(
        expect.stringContaining('function'),
        expect.any(Object)
      )
    })

    it('показывает главное меню при ошибке', async () => {
      mockReply
        .mockRejectedValueOnce(new Error('Telegram error'))
        .mockResolvedValueOnce(undefined)

      const categoryId = CATEGORIES[0].id

      await showCategoryMenu(mockContext as MyContext, categoryId)

      // После ошибки должен показать главное меню
      expect(mockReply).toHaveBeenCalledTimes(2)
    })
  })

  describe('navigateToMainMenu()', () => {
    it('выходит из текущей сцены', async () => {
      await navigateToMainMenu(mockContext as MyContext)

      expect(mockSceneLeave).toHaveBeenCalled()
    })

    it('показывает главное меню', async () => {
      await navigateToMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalled()
    })

    it('показывает меню даже если нет текущей сцены', async () => {
      mockContext.scene!.current = null as any

      await navigateToMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalled()
    })

    it('показывает меню при ошибке выхода из сцены', async () => {
      mockSceneLeave.mockRejectedValueOnce(new Error('Leave error'))

      await navigateToMainMenu(mockContext as MyContext)

      // Всё равно должен показать меню
      expect(mockReply).toHaveBeenCalled()
    })
  })

  describe('navigateToCategory()', () => {
    it('выходит из текущей сцены', async () => {
      const categoryId = CATEGORIES[0].id

      await navigateToCategory(mockContext as MyContext, categoryId)

      expect(mockSceneLeave).toHaveBeenCalled()
    })

    it('показывает меню категории', async () => {
      const categoryId = CATEGORIES[0].id

      await navigateToCategory(mockContext as MyContext, categoryId)

      expect(mockReply).toHaveBeenCalled()
    })

    it('показывает меню даже если нет текущей сцены', async () => {
      mockContext.scene!.current = null as any
      const categoryId = CATEGORIES[0].id

      await navigateToCategory(mockContext as MyContext, categoryId)

      expect(mockReply).toHaveBeenCalled()
    })

    it('показывает главное меню при ошибке', async () => {
      mockSceneLeave.mockRejectedValueOnce(new Error('Leave error'))
      const categoryId = CATEGORIES[0].id

      await navigateToCategory(mockContext as MyContext, categoryId)

      // Должен показать меню (fallback на главное меню)
      expect(mockReply).toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('обрабатывает отсутствие from', async () => {
      mockContext.from = undefined

      // Функция должна выполниться без ошибки
      await showMainMenu(mockContext as MyContext)

      // Должен был отправить сообщение
      expect(mockReply).toHaveBeenCalled()
    })

    it('обрабатывает пустую категорию', async () => {
      // Пустая категория должна показать главное меню как fallback
      await showCategoryMenu(mockContext as MyContext, '')

      expect(mockReply).toHaveBeenCalled()
    })

    it('обрабатывает null categoryId', async () => {
      // Null категория должна показать главное меню как fallback
      await showCategoryMenu(mockContext as MyContext, null as any)

      expect(mockReply).toHaveBeenCalled()
    })

    it('обрабатывает undefined scene', async () => {
      mockContext.scene = undefined as any

      // Функция должна выполниться - она сама обрабатывает undefined scene
      await navigateToMainMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalled()
    })
  })

  describe('Keyboard structure', () => {
    it('главное меню не содержит кнопок вовсе', () => {
      /*
       * Проверка сверяла эмодзи в подписях категорий. Категорий больше нет:
       * меню снимает клавиатуру, а обе двери — приложение (кнопка меню «APP»)
       * и разговор с агентом прямо в чате.
       */
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const keyboard = createMainMenuKeyboard(mockContext as MyContext)
      expect(keyboard.reply_markup).toHaveProperty('remove_keyboard', true)
      expect(JSON.stringify(keyboard.reply_markup)).not.toContain('text')
    })

    it('клавиатура категории содержит функции категории', () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)
      const category = CATEGORIES[0]

      const keyboard = createCategoryKeyboard(
        mockContext as MyContext,
        category.id
      )
      const allButtonTexts = keyboard.reply_markup.keyboard
        .flat()
        .map((btn: any) => btn.text || btn)

      // Должна содержать хотя бы одну кнопку из items категории (не adminOnly)
      const nonAdminItems = category.items.filter(item => !item.adminOnly)
      if (nonAdminItems.length > 0) {
        const hasItemButton = allButtonTexts.some((text: string) =>
          nonAdminItems.some(item => item.ru === text || item.en === text)
        )
        expect(hasItemButton).toBe(true)
      }
    })
  })
})
