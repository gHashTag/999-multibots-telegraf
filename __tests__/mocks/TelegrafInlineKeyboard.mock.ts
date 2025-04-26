import { vi } from 'vitest'

export const MockMarkup = {
  inlineKeyboard: vi.fn().mockImplementation(keyboard => ({
    reply_markup: { inline_keyboard: keyboard },
  })),
  removeKeyboard: vi.fn().mockImplementation(() => ({
    reply_markup: { remove_keyboard: true },
  })),
}

// Экспортируем функцию mockInlineKeyboard для использования в тестах
export const mockInlineKeyboard = vi.fn().mockImplementation(keyboard => ({
  reply_markup: { inline_keyboard: keyboard },
}))

export default MockMarkup
