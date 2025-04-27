import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types';import type { Message, Update } from "telegraf/types"
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { calculateFinalPrice } from '@/price/helpers'
import { levels } from './mainMenu' // levels нужны
// import { createHelpButton } from './buttons' // Убираем

/**
 * Генерирует Reply клавиатуру с выбором видеомоделей.
 * @param {boolean} isRu - Флаг русского языка.
 * @returns {Markup.Markup<ReplyKeyboardMarkup>} Клавиатура Telegraf.
 */
export const videoModelKeyboard = (
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> => {
  // Возвращаем логику с текстовыми кнопками
  const buttons = Object.keys(VIDEO_MODELS_CONFIG).map(key => {
    const finalPriceInStars = calculateFinalPrice(key)
    return `${VIDEO_MODELS_CONFIG[key as keyof typeof VIDEO_MODELS_CONFIG].title} (${finalPriceInStars} ⭐)`
  })

  const rows: string[][] = []
  const buttonsPerRow = 2
  for (let i = 0; i < buttons.length; i += buttonsPerRow) {
    rows.push(buttons.slice(i, i + buttonsPerRow))
  }

  // Используем тексты из levels для Справки и Главного меню
  const helpButtonText = isRu ? levels[106].title_ru : levels[106].title_en
  const mainMenuButtonText = isRu ? levels[104].title_ru : levels[104].title_en

  // Добавляем Справку и Главное меню в последнюю строку
  rows.push([helpButtonText, mainMenuButtonText])

  // Клавиатура с моделями и навигацией
  return Markup.keyboard(rows).resize()
}
