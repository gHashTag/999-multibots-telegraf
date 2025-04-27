import { describe, it, expect, vi, beforeEach } from 'vitest'
// Удаляем импорт Markup, так как будем мокировать всю Telegraf
// import { Markup } from 'telegraf'
import { startMenu } from '@/menu/startMenu'
import { levels } from '@/menu/mainMenu'
import { createMockContext } from '__tests__/helpers/context'
import type { Context } from 'telegraf'

// --- Mocking telegraf ---
// Создаем мок для метода resize
const mockResize = vi.fn(() => ({
  // Возвращаем объект, который будет передан в ctx.reply
  // Структура зависит от того, что ожидает Telegraf
  reply_markup: {
    keyboard: [['mocked button array']], // Заглушка, будет проверяться ниже
    resize_keyboard: true,
  },
}))

// Создаем мок для Markup.keyboard, который возвращает объект с методом resize
const mockKeyboard = vi.fn((buttonArray: string[][]) => {
  // Сохраняем кнопки для проверки в тестах
  mockResize.mockReturnValueOnce({
    reply_markup: {
      keyboard: buttonArray.map(row => row.map(text => ({ text }))), // Преобразуем строки в объекты кнопок
      resize_keyboard: true,
    },
  })
  return {
    resize: mockResize,
  }
})

// Мокируем весь модуль telegraf
vi.mock('telegraf', async importOriginal => {
  const original = await importOriginal<typeof import('telegraf')>()
  return {
    ...original, // Сохраняем оригинальные экспорты, если они нужны
    // Мокируем Markup внутри Telegraf
    Markup: {
      keyboard: mockKeyboard,
      button: {
        text: vi.fn((text: string) => ({ text })), // Мок для button.text, если нужен
      },
      // Добавьте другие моки Markup по необходимости
    },
    // Мокируем Telegraf класс и другие нужные части, если необходимо
    // Telegraf: vi.fn()...
  }
})
// --- End Mocking ---

describe('startMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Очищаем моки Markup перед каждым тестом
    mockKeyboard.mockClear()
    mockResize.mockClear()
  })

  it('should reply with Russian text and button when isRu is true', async () => {
    const ctx = createMockContext()
    const isRu = true
    const expectedText = 'Добро пожаловать в главное меню!'
    const expectedButtonText = levels[104]?.title_ru
    expect(expectedButtonText).toBeDefined()

    if (!vi.isMockFunction(ctx.reply)) {
      ctx.reply = vi.fn()
    }

    // ACT
    await startMenu(ctx as any, isRu)

    // ASSERT
    expect(ctx.reply).toHaveBeenCalledTimes(1)

    // Проверяем аргументы ctx.reply
    const [replyText, replyMarkup] = vi.mocked(ctx.reply).mock.calls[0]

    expect(replyText).toBe(expectedText)

    // Проверяем, что Markup.keyboard был вызван с правильными кнопками
    expect(mockKeyboard).toHaveBeenCalledTimes(1)
    expect(mockKeyboard).toHaveBeenCalledWith([[expectedButtonText]])

    // Проверяем, что resize был вызван
    expect(mockResize).toHaveBeenCalledTimes(1)

    // Проверяем структуру replyMarkup, возвращаемую моком resize
    expect(replyMarkup).toBeDefined()
    expect(replyMarkup).toHaveProperty('reply_markup')
    expect(replyMarkup.reply_markup).toHaveProperty('keyboard')
    // Ожидаем структуру кнопки, как ее создает наш мок
    expect(replyMarkup.reply_markup.keyboard).toEqual([
      [{ text: expectedButtonText }],
    ])
    expect(replyMarkup.reply_markup).toHaveProperty('resize_keyboard', true)
  })

  it('should reply with English text and button when isRu is false', async () => {
    const ctx = createMockContext()
    const isRu = false
    const expectedText = 'Welcome to the main menu!'
    const expectedButtonText = levels[104]?.title_en
    expect(expectedButtonText).toBeDefined()

    if (!vi.isMockFunction(ctx.reply)) {
      ctx.reply = vi.fn()
    }

    // ACT
    await startMenu(ctx as any, isRu)

    // ASSERT
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const [replyText, replyMarkup] = vi.mocked(ctx.reply).mock.calls[0]
    expect(replyText).toBe(expectedText)

    // Проверяем, что Markup.keyboard был вызван с правильными кнопками
    expect(mockKeyboard).toHaveBeenCalledTimes(1)
    expect(mockKeyboard).toHaveBeenCalledWith([[expectedButtonText]])

    // Проверяем, что resize был вызван
    expect(mockResize).toHaveBeenCalledTimes(1)

    // Проверяем структуру replyMarkup, возвращаемую моком resize
    expect(replyMarkup).toBeDefined()
    expect(replyMarkup).toHaveProperty('reply_markup')
    expect(replyMarkup.reply_markup).toHaveProperty('keyboard')
    // Ожидаем структуру кнопки, как ее создает наш мок
    expect(replyMarkup.reply_markup.keyboard).toEqual([
      [{ text: expectedButtonText }],
    ])
    expect(replyMarkup.reply_markup).toHaveProperty('resize_keyboard', true)
  })

  // Удалены тесты, проверявшие возвращаемое значение startMenu,
  // так как функция ничего не возвращает (void).
})
