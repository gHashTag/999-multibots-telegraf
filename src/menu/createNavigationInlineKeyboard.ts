import { Markup } from 'telegraf'
import type { Message, Update } from "telegraf/types"

/**
 * Создает стандартную Inline клавиатуру для навигации.
 * @param isRu - Флаг русского языка.
 * @param options - Опции для кастомизации кнопок.
 * @param options.hideBack - Скрыть кнопку "Назад".
 * @param options.hideHelp - Скрыть кнопку "Справка".
 * @param options.hideMainMenu - Скрыть кнопку "Главное меню".
 * @returns {Markup.Markup<InlineKeyboardMarkup>} Inline клавиатура Telegraf.
 */
export function createNavigationInlineKeyboard(
  isRu: boolean,
  options: {
    hideBack?: boolean
    hideHelp?: boolean
    hideMainMenu?: boolean
  } = {}
): Markup.Markup<InlineKeyboardMarkup> {
  const buttons = []

  if (!options.hideBack) {
    buttons.push(
      Markup.button.callback(isRu ? '⬅️ Назад' : '⬅️ Back', 'go_back')
    )
  }

  if (!options.hideHelp) {
    buttons.push(
      Markup.button.callback(isRu ? '❓ Справка' : '❓ Help', 'go_help')
    )
  }

  if (!options.hideMainMenu) {
    buttons.push(
      Markup.button.callback(
        isRu ? '🏠 Главное меню' : '🏠 Main menu',
        'go_main_menu'
      )
    )
  }

  // Располагаем кнопки в один ряд, если их 3 или меньше, иначе в несколько
  if (buttons.length <= 3) {
    return Markup.inlineKeyboard(buttons)
  } else {
    // Просто возвращаем массив кнопок, Telegraf сам расположит их
    // Можно добавить логику для разбиения на ряды при необходимости
    return Markup.inlineKeyboard(buttons)
  }
}
