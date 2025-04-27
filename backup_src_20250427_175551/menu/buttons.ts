import { Markup } from 'telegraf'
import { InlineKeyboardButton } from 'telegraf/types'

/**
 * Создает стандартизированную inline-кнопку "❓ Справка".
 * При нажатии отправляет callback_query 'go_help'.
 *
 * @returns {InlineKeyboardButton.CallbackButton} Объект кнопки Telegraf.
 */
export const createHelpButton = (): InlineKeyboardButton.CallbackButton => {
  return Markup.button.callback('❓ Справка', 'go_help')
}

// Можно добавить и другие общие кнопки сюда в будущем, например, 'Назад'
