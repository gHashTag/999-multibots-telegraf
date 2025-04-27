import { vi } from 'vitest'

/**
 * Базовый мок для Telegraf Markup
 */

// Типизация для кнопки
interface MockButton {
  text: string
  callback_data?: string
  // Добавить другие типы кнопок по необходимости (url, login, etc.)
}

// Типизация для клавиатуры
interface MockKeyboard {
  reply_markup: {
    inline_keyboard?: MockButton[][]
    keyboard?: MockButton[][]
    resize_keyboard?: boolean
    one_time_keyboard?: boolean
  }
}

// Мок объекта Markup
const mockMarkup = {
  // Мок для Markup.button
  button: {
    callback: vi.fn(
      (text: string, callback_data: string): MockButton => ({
        text,
        callback_data,
      })
    ),
    // Добавить другие моки кнопок (url, text, etc.) по необходимости
  },

  // Мок для Markup.inlineKeyboard
  inlineKeyboard: vi.fn(
    (buttons: MockButton[][]): MockKeyboard => ({
      reply_markup: {
        inline_keyboard: buttons,
      },
    })
  ),

  // Мок для Markup.keyboard
  keyboard: vi.fn(
    (buttons: MockButton[][]): MockKeyboard => ({
      reply_markup: {
        keyboard: buttons,
        // По умолчанию добавляем resize и one_time, чтобы имитировать Markup
        resize_keyboard: false, // будет переопределено .resize()
        one_time_keyboard: false, // будет переопределено .oneTime()
      },
    })
  ),

  // Метод для цепочек после keyboard/inlineKeyboard
  // Возвращает this (сам объект) для поддержки цепочек
  resize: vi.fn(function (this: MockKeyboard, value = true) {
    if (this.reply_markup) {
      this.reply_markup.resize_keyboard = value
    }
    return this // Возвращаем себя для цепочки
  }),

  oneTime: vi.fn(function (this: MockKeyboard, value = true) {
    if (this.reply_markup) {
      this.reply_markup.one_time_keyboard = value
    }
    return this // Возвращаем себя для цепочки
  }),
}

// Глобально мокируем Markup
vi.mock('telegraf', async importOriginal => {
  const original = await importOriginal<typeof import('telegraf')>()
  return {
    ...original,
    Markup: mockMarkup,
  }
})

export { mockMarkup } // Экспортируем для возможного использования в тестах
