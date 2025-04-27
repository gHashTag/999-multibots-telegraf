import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { levels } from './mainMenu' // levels нужны
// import { isRussian } from '@/helpers' // isRu передается аргументом
// import { createHelpButton } from './buttons' // Убираем

/**
 * Генерирует Reply клавиатуру для выбора количества шагов обучения.
 * @param {boolean} isRu - Флаг русского языка.
 * @returns {Markup.Markup<ReplyKeyboardMarkup>} Клавиатура Telegraf.
 */
export function getStepSelectionMenu(
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> {
  // Клавиатура ТОЛЬКО с шагами
  return Markup.keyboard([
    [
      Markup.button.text(isRu ? '1000 шагов' : '1000 steps'),
      Markup.button.text(isRu ? '1500 шагов' : '1500 steps'),
      Markup.button.text(isRu ? '2000 шагов' : '2000 steps'),
    ],
    [
      Markup.button.text(isRu ? '3000 шагов' : '2500 steps'),
      Markup.button.text(isRu ? '3500 шагов' : '3000 steps'),
      Markup.button.text(isRu ? '4000 шагов' : '3500 steps'),
    ],
    [
      Markup.button.text(isRu ? '5000 шагов' : '4000 steps'),
      Markup.button.text(isRu ? '5500 шагов' : '5000 steps'),
      Markup.button.text(isRu ? '6000 шагов' : '6000 steps'),
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
