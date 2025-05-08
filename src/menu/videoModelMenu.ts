import { logger } from '@/utils/logger' // Import logger
import { Markup } from 'telegraf'
// Убираем импорт InlineKeyboardMarkup, он не нужен
import type { ReplyKeyboardMarkup } from 'telegraf/types'
// import { VIDEO_MODELS } from '@/interfaces' // Старый импорт не нужен
import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config' // Импортируем конфиг
// Импортируем функцию расчета финальной цены
import { calculateFinalPrice } from '@/price/helpers'
import { levels } from './mainMenu'
import { Translation } from '@/interfaces/translations.interface'

export const videoModelKeyboard = (
  isRu: boolean,
  inputType: 'text' | 'image' | 'morph'
): Markup.Markup<ReplyKeyboardMarkup> => {
  // --- DEBUG LOGGING START ---
  logger.debug(
    '[videoModelKeyboard] Generating keyboard. Config used:',
    VIDEO_MODELS_CONFIG,
    'Filtering by inputType:',
    inputType
  )
  // --- DEBUG LOGGING END ---

  // Фильтруем модели по inputType, затем создаем массив текстовых названий кнопок С ЦЕНОЙ В ЗВЕЗДАХ ⭐
  const buttons = Object.entries(VIDEO_MODELS_CONFIG)
    .filter(([key, config]) => config.inputType.includes(inputType))
    .map(([key, config]) => {
      // Рассчитываем финальную цену в звездах (уже по новой логике)
      const finalPriceInStars = calculateFinalPrice(key)
      // Формируем текст кнопки с ценой в звездах и эмодзи ⭐
      return `${config.title} (${finalPriceInStars} ⭐)` // Заменяем ★ на ⭐
    })

  // --- DEBUG LOGGING START ---
  logger.debug('[videoModelKeyboard] Generated button texts:', buttons)
  // --- DEBUG LOGGING END ---

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

  // --- DEBUG LOGGING START ---
  logger.debug('[videoModelKeyboard] Final rows structure:', rows)
  // --- DEBUG LOGGING END ---

  // Используем Markup.keyboard и добавляем .resize()
  return Markup.keyboard(rows).resize()
}
