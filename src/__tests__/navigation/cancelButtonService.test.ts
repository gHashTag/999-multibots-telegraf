import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import {
  CancelButtonService,
  handleHelpCancel,
  createCancelButton,
  cancelHelpArray,
} from '@/navigation/services/CancelButtonService'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import type { MutableCtx } from '../helpers/mutableContext'

// Create mock function
// vi.mock поднимается выше объявлений — обычная const внутри фабрики
// недоступна. vi.hoisted поднимает объявление вместе с моком.
const { mockIsRussianFromState } = vi.hoisted(() => ({
  mockIsRussianFromState: vi.fn(() => true),
}))

// Mock dependencies
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: mockIsRussianFromState,
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock showMainMenu
vi.mock('@/navigation/helpers/menuKeyboard', () => ({
  showMainMenu: vi.fn().mockResolvedValue(undefined),
}))

describe('CancelButtonService', () => {
  let mockContext: MutableCtx
  let mockSceneEnter: Mock
  let mockSceneLeave: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    // По умолчанию - русский язык
    mockIsRussianFromState.mockReturnValue(true)

    mockSceneEnter = vi.fn().mockResolvedValue(undefined)
    mockSceneLeave = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      message: undefined,
      callbackQuery: undefined,
      scene: {
        leave: mockSceneLeave,
        enter: mockSceneEnter,
      } as any,
      reply: vi.fn().mockResolvedValue(undefined),
      answerCbQuery: vi.fn().mockResolvedValue(undefined),
    }
  })

  describe('1. Экспорт методов CancelButtonService', () => {
    it('должен экспортировать все необходимые статические методы', () => {
      expect(CancelButtonService.createCancelButton).toBeDefined()
      expect(CancelButtonService.createMainMenuButton).toBeDefined()
      expect(CancelButtonService.createInlineCancelButton).toBeDefined()
      expect(CancelButtonService.createInlineMainMenuButton).toBeDefined()
      expect(CancelButtonService.createHelpCancelArray).toBeDefined()
      expect(CancelButtonService.createHelpCancelKeyboard).toBeDefined()
      expect(CancelButtonService.handleCancelButton).toBeDefined()
      expect(CancelButtonService.handleMainMenuButton).toBeDefined()
      expect(CancelButtonService.handleCancelAndMenu).toBeDefined()
      expect(CancelButtonService.handleCancelCallback).toBeDefined()
      expect(CancelButtonService.handleMainMenuCallback).toBeDefined()
      expect(CancelButtonService.executeCancel).toBeDefined()
      expect(CancelButtonService.executeMainMenu).toBeDefined()
    })

    it('все методы должны быть функциями', () => {
      expect(typeof CancelButtonService.createCancelButton).toBe('function')
      expect(typeof CancelButtonService.handleCancelButton).toBe('function')
      expect(typeof CancelButtonService.handleCancelAndMenu).toBe('function')
      expect(typeof CancelButtonService.executeCancel).toBe('function')
    })
  })

  describe('2. Создание кнопок', () => {
    it('createCancelButton должна создавать кнопку отмены без эмодзи (RU)', () => {
      const button = CancelButtonService.createCancelButton(true)
      expect(button).toHaveLength(1)
      expect(button[0].text).toBe('Отмена')
      expect(button[0].text).not.toContain('❌')
    })

    it('createCancelButton должна создавать кнопку отмены без эмодзи (EN)', () => {
      const button = CancelButtonService.createCancelButton(false)
      expect(button).toHaveLength(1)
      expect(button[0].text).toBe('Cancel')
      expect(button[0].text).not.toContain('❌')
    })

    it('createMainMenuButton должна создавать кнопку главного меню (RU)', () => {
      const button = CancelButtonService.createMainMenuButton(true)
      expect(button).toHaveLength(1)
      expect(button[0].text).toBe('🏠 Главное меню')
    })

    it('createMainMenuButton должна создавать кнопку главного меню (EN)', () => {
      const button = CancelButtonService.createMainMenuButton(false)
      expect(button).toHaveLength(1)
      expect(button[0].text).toBe('🏠 Main menu')
    })

    it('createInlineCancelButton должна создавать inline кнопку отмены', () => {
      const button = CancelButtonService.createInlineCancelButton(
        true,
        'cancel'
      )
      expect(button.text).toBe('Отмена')
      expect(button.callback_data).toBe('cancel')
    })

    it('createInlineMainMenuButton должна создавать inline кнопку главного меню', () => {
      const button = CancelButtonService.createInlineMainMenuButton(true)
      expect(button.text).toBe('🏠 Главное меню')
      expect(button.callback_data).toBe('main_menu')
    })

    it('createHelpCancelArray должна создавать массив с кнопками справки и отмены (RU)', () => {
      const array = CancelButtonService.createHelpCancelArray(true)
      expect(array).toHaveLength(2)
      expect(array[0]).toEqual(['ℹ️ Справка'])
      expect(array[1]).toEqual(['Отмена'])
    })

    it('createHelpCancelArray должна создавать массив с кнопками справки и отмены (EN)', () => {
      const array = CancelButtonService.createHelpCancelArray(false)
      expect(array).toHaveLength(2)
      expect(array[0]).toEqual(['ℹ️ Help'])
      expect(array[1]).toEqual(['Cancel'])
    })

    it('createHelpCancelKeyboard должна создавать клавиатуру', () => {
      const keyboard = CancelButtonService.createHelpCancelKeyboard(true)
      expect(keyboard).toBeDefined()
      expect(keyboard.reply_markup).toBeDefined()
      expect(keyboard.reply_markup.keyboard).toHaveLength(2)
    })
  })

  describe('3. Обработка Reply Keyboard - handleCancelButton', () => {
    it('должна обрабатывать русскую "Отмена"', async () => {
      mockContext.message = { text: 'Отмена' } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      // Реализация вызывает ctx.reply с customMessage='Отмена'
      expect(mockContext.reply).toHaveBeenCalledWith('Отмена', {
        reply_markup: { remove_keyboard: true },
      })
      expect(mockContext.scene?.leave).toHaveBeenCalled()
    })

    it('должна обрабатывать английское "Cancel"', async () => {
      mockIsRussianFromState.mockReturnValue(false)
      mockContext.message = { text: 'Cancel' } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      expect(mockContext.scene?.leave).toHaveBeenCalled()
      // Сообщение будет 'Cancel' так как isRu=false
      expect(mockContext.reply).toHaveBeenCalledWith('Cancel', {
        reply_markup: { remove_keyboard: true },
      })
    })

    it('должна обрабатывать команду /cancel', async () => {
      mockContext.message = { text: '/cancel' } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      expect(mockContext.scene?.leave).toHaveBeenCalled()
    })

    it('должна обрабатывать текст с разным регистром', async () => {
      mockContext.message = { text: 'ОТМЕНА' } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
    })

    it('должна возвращать false для неподходящего текста', async () => {
      mockContext.message = { text: 'Привет' } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(false)
      expect(mockContext.reply).not.toHaveBeenCalled()
    })

    it('должна возвращать false если нет сообщения', async () => {
      mockContext.message = undefined
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(false)
    })

    it('должна возвращать false если сообщение без текста', async () => {
      mockContext.message = { photo: [] } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(false)
    })
  })

  describe('4. Обработка Reply Keyboard - handleMainMenuButton', () => {
    it('должна обрабатывать русское "Главное меню"', async () => {
      mockContext.message = { text: 'Главное меню' } as any
      const result = await CancelButtonService.handleMainMenuButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Переходим в главное меню.',
        { reply_markup: { remove_keyboard: true } }
      )
      expect(mockContext.scene?.leave).toHaveBeenCalled()
    })

    it('должна обрабатывать английское "Main menu" (lowercase)', async () => {
      mockIsRussianFromState.mockReturnValue(false)
      mockContext.message = { text: 'main menu' } as any
      const result = await CancelButtonService.handleMainMenuButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
    })

    it('должна обрабатывать "🏠 Главное меню" с эмодзи', async () => {
      mockContext.message = { text: '🏠 Главное меню' } as any
      const result = await CancelButtonService.handleMainMenuButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
    })

    it('должна обрабатывать команду /menu', async () => {
      mockContext.message = { text: '/menu' } as any
      const result = await CancelButtonService.handleMainMenuButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
    })

    it('должна обрабатывать просто "меню"', async () => {
      mockContext.message = { text: 'меню' } as any
      const result = await CancelButtonService.handleMainMenuButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
    })

    it('должна возвращать false для неподходящего текста', async () => {
      mockContext.message = { text: 'Другой текст' } as any
      const result = await CancelButtonService.handleMainMenuButton(
        mockContext as MyContext
      )

      expect(result).toBe(false)
    })
  })

  describe('5. Обработка Inline кнопок', () => {
    it('handleCancelCallback должна обрабатывать callback "cancel"', async () => {
      mockContext.callbackQuery = { data: 'cancel' } as any
      const result = await CancelButtonService.handleCancelCallback(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
      expect(mockContext.reply).toHaveBeenCalled()
      expect(mockContext.scene?.leave).toHaveBeenCalled()
      // showMainMenu вызывается вместо scene.enter напрямую
    })

    it('handleCancelCallback должна поддерживать кастомный callback data', async () => {
      mockContext.callbackQuery = { data: 'custom_cancel' } as any
      const result = await CancelButtonService.handleCancelCallback(
        mockContext as MyContext,
        'custom_cancel'
      )

      expect(result).toBe(true)
    })

    it('handleCancelCallback должна возвращать false для другого callback', async () => {
      mockContext.callbackQuery = { data: 'other_action' } as any
      const result = await CancelButtonService.handleCancelCallback(
        mockContext as MyContext
      )

      expect(result).toBe(false)
    })

    it('handleMainMenuCallback должна обрабатывать callback "main_menu"', async () => {
      mockContext.callbackQuery = { data: 'main_menu' } as any
      const result = await CancelButtonService.handleMainMenuCallback(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      expect(mockContext.answerCbQuery).toHaveBeenCalled()
      expect(mockContext.scene?.leave).toHaveBeenCalled()
      // showMainMenu вызывается вместо scene.enter напрямую
    })
  })

  describe('6. Универсальный обработчик handleCancelAndMenu', () => {
    it('должна обрабатывать отмену через универсальный метод', async () => {
      mockContext.message = { text: 'Отмена' } as any
      const result = await CancelButtonService.handleCancelAndMenu(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      expect(mockContext.scene?.leave).toHaveBeenCalled()
    })

    it('должна обрабатывать главное меню через универсальный метод', async () => {
      mockContext.message = { text: 'Главное меню' } as any
      const result = await CancelButtonService.handleCancelAndMenu(
        mockContext as MyContext
      )

      expect(result).toBe(true)
      expect(mockContext.scene?.leave).toHaveBeenCalled()
    })

    it('должна возвращать false если ничего не подошло', async () => {
      mockContext.message = { text: 'Какой-то текст' } as any
      const result = await CancelButtonService.handleCancelAndMenu(
        mockContext as MyContext
      )

      expect(result).toBe(false)
    })
  })

  describe('7. Прямые действия executeCancel и executeMainMenu', () => {
    it('executeCancel должна выполнять отмену с дефолтным сообщением', async () => {
      await CancelButtonService.executeCancel(mockContext as MyContext)

      // Дефолтное сообщение для русского языка
      expect(mockContext.reply).toHaveBeenCalledWith(
        'Отменено. Возвращаю в главное меню.',
        { reply_markup: { remove_keyboard: true } }
      )
      expect(mockContext.scene?.leave).toHaveBeenCalled()
    })

    it('executeCancel должна поддерживать кастомное сообщение', async () => {
      const customMessage = 'Процесс прерван'
      await CancelButtonService.executeCancel(
        mockContext as MyContext,
        customMessage
      )

      expect(mockContext.reply).toHaveBeenCalledWith(customMessage, {
        reply_markup: { remove_keyboard: true },
      })
    })

    it('executeMainMenu должна выполнять переход с дефолтным сообщением', async () => {
      await CancelButtonService.executeMainMenu(mockContext as MyContext)

      // Без customMessage reply не вызывается
      expect(mockContext.scene?.leave).toHaveBeenCalled()
    })

    it('executeMainMenu должна поддерживать кастомное сообщение', async () => {
      const customMessage = 'Возврат в меню'
      await CancelButtonService.executeMainMenu(
        mockContext as MyContext,
        customMessage
      )

      expect(mockContext.reply).toHaveBeenCalledWith(customMessage, {
        reply_markup: { remove_keyboard: true },
      })
    })
  })

  describe('8. Обратная совместимость - экспорты функций', () => {
    it('handleHelpCancel должна быть экспортирована', () => {
      expect(handleHelpCancel).toBeDefined()
      expect(typeof handleHelpCancel).toBe('function')
    })

    it('createCancelButton должна быть экспортирована', () => {
      expect(createCancelButton).toBeDefined()
      expect(typeof createCancelButton).toBe('function')
    })

    it('cancelHelpArray должна быть экспортирована', () => {
      expect(cancelHelpArray).toBeDefined()
      expect(typeof cancelHelpArray).toBe('function')
    })

    it('экспортированная createCancelButton должна работать корректно', () => {
      const button = createCancelButton(true)
      expect(button).toHaveLength(1)
      expect(button[0].text).toBe('Отмена')
    })

    it('экспортированная cancelHelpArray должна работать корректно', () => {
      const array = cancelHelpArray(true)
      expect(array).toHaveLength(2)
      expect(array[0]).toEqual(['ℹ️ Справка'])
      expect(array[1]).toEqual(['Отмена'])
    })
  })

  describe('9. handleHelpCancel - экспорт для обратной совместимости', () => {
    it('handleHelpCancel должна быть функцией', () => {
      expect(typeof handleHelpCancel).toBe('function')
    })

    it('handleHelpCancel должна принимать MyContext и возвращать Promise<boolean>', () => {
      expect(handleHelpCancel.length).toBe(1) // один параметр
    })
  })

  describe('10. Edge cases и безопасность', () => {
    it('должна корректно обрабатывать пустую строку', async () => {
      mockContext.message = { text: '' } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(false)
    })

    it('должна корректно обрабатывать пробелы', async () => {
      mockContext.message = { text: '   Отмена   ' } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(true)
    })

    it('должна быть устойчива к undefined context.from', async () => {
      mockContext.from = undefined
      mockContext.message = { text: 'Отмена' } as any

      await expect(
        CancelButtonService.handleCancelButton(mockContext as MyContext)
      ).resolves.toBe(true)
    })

    it('не должна падать если scene.leave выбрасывает ошибку', async () => {
      mockContext.message = { text: 'Отмена' } as any
      mockContext.scene!.leave = vi
        .fn()
        .mockRejectedValue(new Error('Scene error'))

      // Реализация обрабатывает ошибку внутри try-catch и использует fallback
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )
      expect(result).toBe(true)
      // При ошибке должен попытаться войти в MainMenu как fallback
      expect(mockContext.scene?.enter).toHaveBeenCalledWith(ModeEnum.MainMenu)
    })

    it('должна обрабатывать null и undefined в тексте сообщения', async () => {
      mockContext.message = { text: null as any } as any
      const result = await CancelButtonService.handleCancelButton(
        mockContext as MyContext
      )

      expect(result).toBe(false)
    })
  })
})
