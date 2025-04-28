import { Markup } from 'telegraf'
// Убираем импорт InlineKeyboardMarkup, он не нужен
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
// import { VIDEO_MODELS } from '@/interfaces' // Старый импорт не нужен
import { VIDEO_MODELS_CONFIG } from '@/pricing/config/VIDEO_MODELS_CONFIG' // Corrected path
import { ModeEnum } from '@/interfaces/modes'
import { createHelpCancelKeyboard } from '@/menu'
import { logger } from '@/utils/logger'
import { calculateFinalStarPrice } from '@/pricing/calculator' // <-- Добавляем новый импорт
import { levels } from './mainMenu'

// Определяем тип ключей конфига
type VideoModelKey = keyof typeof VIDEO_MODELS_CONFIG

/**
 * Генерирует клавиатуру для выбора видео-моделей.
 * @param isRu - Флаг для выбора языка.
 * @returns Объект с reply_markup.
 */
export function videoModelKeyboard(isRu: boolean) {
  const buttons = Object.entries(VIDEO_MODELS_CONFIG)
    .map(([key, config]) => {
      try {
        // Используем новый калькулятор для получения цены в звездах
        const priceResult = calculateFinalStarPrice(
          ModeEnum.ImageToVideo, // Используем один из режимов видео как базу
          { modelId: key as VideoModelKey }
        )
        const priceText = priceResult ? `${priceResult.stars} ⭐` : 'N/A'
        return `${config.title} (${priceText})`
      } catch (error) {
        logger.error('Error calculating price for video model button:', {
          key,
          config,
          error,
        })
        return `${config.title} (Error)` // Обработка ошибки цены
      }
    })
    // Добавляем кнопки помощи и отмены
    .concat([isRu ? 'Помощь' : 'Help', isRu ? 'Отмена' : 'Cancel'])

  const keyboard = Markup.keyboard(buttons, {
    columns: 2, // По 2 кнопки в ряду
  })
    .resize()
    .oneTime()

  return keyboard
}
