import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { logger } from '@/utils/logger'
import { VIDEO_MODELS_CONFIG } from '../config/models.config'
import {
  getAvailableModels,
  formatModelButton,
  VideoModelConfigKey,
} from './modelMapping'

/**
 * Создает клавиатуру для выбора модели видео
 */
export function createVideoModelKeyboard(
  isRu: boolean,
  inputType: 'text' | 'image'
): ReturnType<typeof Markup.keyboard> {
  logger.info('[createVideoModelKeyboard] Creating keyboard', {
    isRu,
    inputType,
  })

  // Получаем доступные модели
  const availableModels = getAvailableModels(inputType)

  // Формируем кнопки с названиями моделей и ценами
  const buttons: string[][] = []
  const models = availableModels.map(key => ({
    key,
    price: VIDEO_MODELS_CONFIG[key].basePrice,
  }))

  // Сортируем модели по цене
  models.sort((a, b) => a.price - b.price)

  // Группируем по две кнопки в ряд
  for (let i = 0; i < models.length; i += 2) {
    const row = []
    row.push(formatModelButton(models[i].key))
    if (models[i + 1]) {
      row.push(formatModelButton(models[i + 1].key))
    }
    buttons.push(row)
  }

  // Добавляем кнопку "Назад в меню"
  buttons.push([isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'])

  logger.info('[createVideoModelKeyboard] Created button rows', {
    buttonCount: buttons.reduce((acc, row) => acc + row.length, 0),
    models: models.map(m => m.key),
  })

  return Markup.keyboard(buttons).resize()
}

/**
 * Создает inline клавиатуру для выбора разрешения видео
 */
export function createResolutionKeyboard(
  modelKey: VideoModelConfigKey,
  isRu: boolean
): ReturnType<typeof Markup.inlineKeyboard> {
  const config = VIDEO_MODELS_CONFIG[modelKey]
  if (!config.resolutionOptions || !config.priceByResolution) {
    return Markup.inlineKeyboard([])
  }

  const buttons = config.resolutionOptions.map(resolution => {
    const basePrice = config.priceByResolution[resolution] || config.basePrice
    const finalPrice = Math.floor(((basePrice * 5) / 0.016) * 1.5)

    return Markup.button.callback(
      `${resolution.toUpperCase()} (${finalPrice} ⭐)`,
      `wan_${modelKey}_${resolution}`
    )
  })

  return Markup.inlineKeyboard(buttons.map(btn => [btn]))
}
