import { Markup } from 'telegraf'
// Убираем импорт InlineKeyboardMarkup, он не нужен
import type { ReplyKeyboardMarkup } from 'telegraf/types'
// import { VIDEO_MODELS } from '@/interfaces' // Старый импорт не нужен
import {
  VIDEO_MODELS_CONFIG,
  VideoModelConfig,
} from '../modules/localImageToVideo/VIDEO_MODELS_CONFIG' // Updated path and added type import
// Импортируем функцию расчета финальной цены
import { calculateFinalPrice } from '@/price/helpers'
import { levels } from './mainMenu'
import { Translation } from '@/interfaces/translations.interface'

export const videoModelKeyboard = (
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> => {
  // Создаем массив текстовых названий кнопок С ЦЕНОЙ В ЗВЕЗДАХ ⭐
  const buttons = Object.entries(VIDEO_MODELS_CONFIG).map(
    ([key, config]: [string, VideoModelConfig]) => {
      // Added explicit type
      // Рассчитываем финальную цену в звездах (уже по новой логике)
      const finalPriceInStars = calculateFinalPrice(key)
      // Формируем текст кнопки с ценой в звездах и эмодзи ⭐
      return `${config.title} (${finalPriceInStars} ⭐)` // Заменяем ★ на ⭐
    }
  )

  // Группируем кнопки моделей по 2 в ряд
  const rows: string[][] = [] // Массив массивов строк
  const buttonsPerRow = 2 // Можно изменить на 3
  for (let i = 0; i < buttons.length; i += buttonsPerRow) {
    rows.push(buttons.slice(i, i + buttonsPerRow))
  }

  // Добавляем кнопки Главное меню, Помощь и Отмена как строки
  // Используем правильные тексты и levels
  const helpButtonText = isRu ? 'Справка по команде' : 'Help for the command' // Жестко закодированный текст
  const cancelButtonText = isRu ? 'Отмена' : 'Cancel' // Жестко закодированный текст
  // Используем levels[104] для "Главного меню"
  const mainMenuButtonText = levels[104]
    ? isRu
      ? levels[104].title_ru
      : levels[104].title_en
    : isRu
      ? '🏠 Главное меню'
      : '🏠 Main menu' // Резервный текст

  rows.push(
    [helpButtonText, cancelButtonText], // Ряд 1: Справка, Отмена
    [mainMenuButtonText] // Ряд 2: Главное меню
  )

  // Используем Markup.keyboard и добавляем .resize()
  return Markup.keyboard(rows).resize()
}
