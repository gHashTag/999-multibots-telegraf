import { getTranslation } from '@/core'
// import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram' // Удаляем старый путь
import type { ReplyKeyboardMarkup } from 'telegraf/types' // Используем правильный путь
import { Markup } from 'telegraf'
import { type MyContext } from '@/interfaces'
import { levels } from './mainMenu' // Импортируем levels
// import { isRussian } from '@/helpers'
// import { createHelpButton } from './buttons'
// import { levels } from './mainMenu' // levels больше не нужны здесь

/**
 * Генерирует Reply клавиатуру для выбора количества шагов обучения (версия 2).
 * @param {boolean} isRu - Флаг русского языка.
 * @returns {Markup.Markup<ReplyKeyboardMarkup>} Клавиатура Telegraf.
 */
export function getStepSelectionMenuV2(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  // Клавиатура с шагами и навигацией
  return Markup.keyboard([
    [
      Markup.button.text(isRu ? '100 шагов' : '100 steps'),
      Markup.button.text(isRu ? '200 шагов' : '200 steps'),
      Markup.button.text(isRu ? '300 шагов' : '300 steps'),
    ],
    [
      Markup.button.text(isRu ? '400 шагов' : '400 steps'),
      Markup.button.text(isRu ? '500 шагов' : '500 steps'),
      Markup.button.text(isRu ? '600 шагов' : '600 steps'),
    ],
    [
      Markup.button.text(isRu ? '700 шагов' : '700 steps'),
      Markup.button.text(isRu ? '800 шагов' : '800 steps'),
      Markup.button.text(isRu ? '1000 шагов' : '1000 steps'),
    ],
    // Возвращаем кнопки навигации
    [
      Markup.button.text(isRu ? levels[106].title_ru : levels[106].title_en),
      Markup.button.text(isRu ? levels[104].title_ru : levels[104].title_en),
    ],
  ])
    .resize()
    .oneTime()
}
