/**
 * 🧪 Тесты для messages.ts - утилиты для отправки сообщений
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import {
  sendGenericErrorMessage,
  cancelMenu,
  cancelHelpArray,
  createHelpCancelKeyboard,
  sendPhotoDescriptionRequest,
  sendPromptImprovementMessage,
  sendPromptImprovementFailureMessage,
  getStepSelectionMenu,
  getStepSelectionMenuV2,
  createGenerateImageKeyboard
} from '@/navigation/helpers/messages'
import { MyContext } from '@/interfaces/telegram-bot.interface'

// Mock centralizedLanguage
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn()
}))

import { isRussianFromState } from '@/helpers/centralizedLanguage'

describe('messages', () => {
  let mockContext: Partial<MyContext>
  let mockReply: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    mockReply = vi.fn().mockResolvedValue(undefined)

    mockContext = {
      from: { id: 123456 } as any,
      reply: mockReply,
      state: {
        userLanguage: 'ru' as 'ru' | 'en'
      } as any,
      session: {} as any
    }

    // По умолчанию - русский язык
    ;(isRussianFromState as Mock).mockReturnValue(true)
  })

  describe('sendGenericErrorMessage()', () => {
    it('отправляет сообщение об ошибке на русском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await sendGenericErrorMessage(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '❌ Произошла ошибка. Попробуйте позже.'
      )
    })

    it('отправляет сообщение об ошибке на английском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await sendGenericErrorMessage(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '❌ An error occurred. Please try again later.'
      )
    })

    it('использует кастомный текст ошибки', async () => {
      const customError = 'Кастомная ошибка'

      await sendGenericErrorMessage(mockContext as MyContext, customError)

      expect(mockReply).toHaveBeenCalledWith(customError)
    })

    it('игнорирует язык при кастомном тексте', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)
      const customError = 'Custom error'

      await sendGenericErrorMessage(mockContext as MyContext, customError)

      expect(mockReply).toHaveBeenCalledWith(customError)
    })
  })

  describe('cancelMenu()', () => {
    it('отправляет сообщение об отмене на русском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await cancelMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '❌ Операция отменена',
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.any(Array)
          })
        })
      )
    })

    it('отправляет сообщение об отмене на английском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await cancelMenu(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '❌ Operation cancelled',
        expect.any(Object)
      )
    })

    it('добавляет кнопку возврата в меню', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await cancelMenu(mockContext as MyContext)

      const callArgs = mockReply.mock.calls[0]
      const keyboard = callArgs[1]

      expect(keyboard.reply_markup.inline_keyboard).toBeDefined()
      expect(keyboard.reply_markup.inline_keyboard[0][0].callback_data).toBe('back_to_menu')
    })
  })

  describe('cancelHelpArray', () => {
    it('содержит массив с кнопками', () => {
      expect(Array.isArray(cancelHelpArray)).toBe(true)
      expect(cancelHelpArray.length).toBe(1)
      expect(cancelHelpArray[0].length).toBe(2)
    })

    it('содержит кнопку отмены', () => {
      const cancelButton = cancelHelpArray[0][0]
      expect(cancelButton.text).toBe('❌ Отмена')
      expect(cancelButton.callback_data).toBe('cancel')
    })

    it('содержит кнопку помощи', () => {
      const helpButton = cancelHelpArray[0][1]
      expect(helpButton.text).toBe('❓ Помощь')
      expect(helpButton.callback_data).toBe('help')
    })
  })

  describe('createHelpCancelKeyboard()', () => {
    it('создаёт клавиатуру для русского языка', () => {
      const keyboard = createHelpCancelKeyboard(true)

      expect(keyboard.reply_markup).toBeDefined()
      expect(keyboard.reply_markup.inline_keyboard).toBeDefined()

      const buttons = keyboard.reply_markup.inline_keyboard[0]
      expect(buttons[0].text).toBe('❌ Отмена')
      expect(buttons[1].text).toBe('❓ Помощь')
    })

    it('создаёт клавиатуру для английского языка', () => {
      const keyboard = createHelpCancelKeyboard(false)

      const buttons = keyboard.reply_markup.inline_keyboard[0]
      expect(buttons[0].text).toBe('❌ Cancel')
      expect(buttons[1].text).toBe('❓ Help')
    })

    it('кнопки имеют правильные callback_data', () => {
      const keyboard = createHelpCancelKeyboard(true)

      const buttons = keyboard.reply_markup.inline_keyboard[0]
      expect(buttons[0].callback_data).toBe('cancel')
      expect(buttons[1].callback_data).toBe('help')
    })
  })

  describe('sendPhotoDescriptionRequest()', () => {
    it('отправляет запрос на русском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await sendPhotoDescriptionRequest(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '📸 Отправьте описание для генерации изображения:',
        expect.any(Object)
      )
    })

    it('отправляет запрос на английском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await sendPhotoDescriptionRequest(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '📸 Send a description for image generation:',
        expect.any(Object)
      )
    })

    it('добавляет кнопку отмены', async () => {
      await sendPhotoDescriptionRequest(mockContext as MyContext)

      const callArgs = mockReply.mock.calls[0]
      const keyboard = callArgs[1]

      expect(keyboard.reply_markup.inline_keyboard[0][0].callback_data).toBe('cancel')
    })
  })

  describe('sendPromptImprovementMessage()', () => {
    it('отправляет сообщение на русском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await sendPromptImprovementMessage(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith('✨ Улучшаю ваш промпт...')
    })

    it('отправляет сообщение на английском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await sendPromptImprovementMessage(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith('✨ Improving your prompt...')
    })
  })

  describe('sendPromptImprovementFailureMessage()', () => {
    it('отправляет сообщение об ошибке на русском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(true)

      await sendPromptImprovementFailureMessage(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '❌ Не удалось улучшить промпт. Попробуйте еще раз.'
      )
    })

    it('отправляет сообщение об ошибке на английском', async () => {
      ;(isRussianFromState as Mock).mockReturnValue(false)

      await sendPromptImprovementFailureMessage(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalledWith(
        '❌ Failed to improve prompt. Please try again.'
      )
    })
  })

  describe('getStepSelectionMenu()', () => {
    it('создаёт меню для русского языка', () => {
      const menu = getStepSelectionMenu(true)

      expect(menu.reply_markup).toBeDefined()
      expect(menu.reply_markup.keyboard).toBeDefined()
      expect(menu.reply_markup.resize_keyboard).toBe(true)
      expect(menu.reply_markup.one_time_keyboard).toBe(true)
    })

    it('создаёт меню для английского языка', () => {
      const menu = getStepSelectionMenu(false)

      expect(menu.reply_markup.keyboard).toBeDefined()
    })

    it('содержит 3 ряда с шагами и 1 с Справка/Отмена', () => {
      const menu = getStepSelectionMenu(true)

      expect(menu.reply_markup.keyboard.length).toBe(3)
    })

    it('русское меню содержит правильные шаги', () => {
      const menu = getStepSelectionMenu(true)
      const keyboard = menu.reply_markup.keyboard

      // Первый ряд: 1000, 1500, 2000
      expect(keyboard[0][0].text).toBe('1000 шагов')
      expect(keyboard[0][1].text).toBe('1500 шагов')
      expect(keyboard[0][2].text).toBe('2000 шагов')
    })

    it('английское меню содержит правильные шаги', () => {
      const menu = getStepSelectionMenu(false)
      const keyboard = menu.reply_markup.keyboard

      expect(keyboard[0][0].text).toBe('1000 steps')
      expect(keyboard[0][1].text).toBe('1500 steps')
      expect(keyboard[0][2].text).toBe('2000 steps')
    })

    it('содержит кнопки Справка и Отмена', () => {
      const menu = getStepSelectionMenu(true)
      const lastRow = menu.reply_markup.keyboard[2]

      expect(lastRow[0].text).toBe('❓ Справка')
      expect(lastRow[1].text).toBe('Отмена')
    })
  })

  describe('getStepSelectionMenuV2()', () => {
    it('создаёт меню V2 для русского языка', () => {
      const menu = getStepSelectionMenuV2(true)

      expect(menu.reply_markup).toBeDefined()
      expect(menu.reply_markup.keyboard).toBeDefined()
      expect(menu.reply_markup.resize_keyboard).toBe(true)
    })

    it('содержит 4 ряда', () => {
      const menu = getStepSelectionMenuV2(true)

      expect(menu.reply_markup.keyboard.length).toBe(4)
    })

    it('русское меню V2 содержит меньшие шаги', () => {
      const menu = getStepSelectionMenuV2(true)
      const keyboard = menu.reply_markup.keyboard

      // Первый ряд: 100, 200, 300
      expect(keyboard[0][0].text).toBe('100 шагов')
      expect(keyboard[0][1].text).toBe('200 шагов')
      expect(keyboard[0][2].text).toBe('300 шагов')
    })

    it('английское меню V2 содержит меньшие шаги', () => {
      const menu = getStepSelectionMenuV2(false)
      const keyboard = menu.reply_markup.keyboard

      expect(keyboard[0][0].text).toBe('100 steps')
      expect(keyboard[0][1].text).toBe('200 steps')
    })

    it('содержит кнопки Справка и Отмена', () => {
      const menu = getStepSelectionMenuV2(true)
      const lastRow = menu.reply_markup.keyboard[3]

      expect(lastRow[0].text).toBe('Справка по команде')
      expect(lastRow[1].text).toBe('Отмена')
    })
  })

  describe('createGenerateImageKeyboard()', () => {
    it('создаёт inline клавиатуру', () => {
      const keyboard = createGenerateImageKeyboard()

      expect(keyboard.inline_keyboard).toBeDefined()
      expect(Array.isArray(keyboard.inline_keyboard)).toBe(true)
    })

    it('содержит кнопку генерации', () => {
      const keyboard = createGenerateImageKeyboard()
      const button = keyboard.inline_keyboard[0][0]

      expect(button.text).toBe('Сгенерировать')
      expect(button.callback_data).toBe('generate_image')
    })

    it('содержит кнопку отмены', () => {
      const keyboard = createGenerateImageKeyboard()
      const button = keyboard.inline_keyboard[0][1]

      expect(button.text).toBe('Отмена')
      expect(button.callback_data).toBe('cancel')
    })

    it('возвращает объект с правильной структурой', () => {
      const keyboard = createGenerateImageKeyboard()

      expect(keyboard).toEqual({
        inline_keyboard: [
          [
            { text: 'Сгенерировать', callback_data: 'generate_image' },
            { text: 'Отмена', callback_data: 'cancel' }
          ]
        ]
      })
    })
  })

  describe('Edge cases', () => {
    it('sendGenericErrorMessage работает без ctx.from', async () => {
      mockContext.from = undefined

      await sendGenericErrorMessage(mockContext as MyContext)

      expect(mockReply).toHaveBeenCalled()
    })

    it('cancelMenu работает с разными языками', async () => {
      // Русский
      ;(isRussianFromState as Mock).mockReturnValue(true)
      await cancelMenu(mockContext as MyContext)
      expect(mockReply).toHaveBeenCalledWith('❌ Операция отменена', expect.any(Object))

      vi.clearAllMocks()

      // Английский
      ;(isRussianFromState as Mock).mockReturnValue(false)
      await cancelMenu(mockContext as MyContext)
      expect(mockReply).toHaveBeenCalledWith('❌ Operation cancelled', expect.any(Object))
    })

    it('меню шагов имеют resize и oneTime', () => {
      const menu1 = getStepSelectionMenu(true)
      const menu2 = getStepSelectionMenuV2(true)

      expect(menu1.reply_markup.resize_keyboard).toBe(true)
      expect(menu1.reply_markup.one_time_keyboard).toBe(true)
      expect(menu2.reply_markup.resize_keyboard).toBe(true)
      expect(menu2.reply_markup.one_time_keyboard).toBe(true)
    })
  })
})
