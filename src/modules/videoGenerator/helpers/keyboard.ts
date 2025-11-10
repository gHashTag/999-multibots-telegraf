import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { logger } from '@/utils/logger'
import { UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG } from '@/config/unified-video-models.config'
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

/**
 * Создает inline клавиатуру для выбора длительности видео
 */
export function createDurationKeyboard(
  modelKey: VideoModelConfigKey,
  isRu: boolean
): ReturnType<typeof Markup.inlineKeyboard> {
  const config = VIDEO_MODELS_CONFIG[modelKey]
  if (!config.durationOptions || !config.priceByDuration) {
    return Markup.inlineKeyboard([])
  }

  const buttons = config.durationOptions.map(duration => {
    const basePrice =
      config.priceByDuration![duration] || config.basePrice * duration
    const finalPrice = Math.floor(basePrice / 0.016) // Конвертация в звезды

    const buttonText = isRu
      ? `${duration} сек (${finalPrice} ⭐)`
      : `${duration} sec (${finalPrice} ⭐)`

    return Markup.button.callback(buttonText, `veo_${modelKey}_${duration}`)
  })

  // Группируем кнопки по 2 в ряд для лучшего вида
  const rows = []
  for (let i = 0; i < buttons.length; i += 2) {
    if (i + 1 < buttons.length) {
      rows.push([buttons[i], buttons[i + 1]])
    } else {
      rows.push([buttons[i]])
    }
  }

  return Markup.inlineKeyboard(rows)
}

/**
 * Создает обычную клавиатуру для выбора соотношения сторон видео
 */
export function createAspectRatioKeyboard(
  modelKey: VideoModelConfigKey,
  isRu: boolean
): ReturnType<typeof Markup.keyboard> {
  const config = VIDEO_MODELS_CONFIG[modelKey]
  if (!config.aspectRatioOptions) {
    return Markup.keyboard([
      [isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'],
    ]).resize()
  }

  const buttons = config.aspectRatioOptions.map(aspectRatio => {
    return isRu
      ? aspectRatio === '9:16'
        ? '📱 Вертикальное (9:16)'
        : '📺 Горизонтальное (16:9)'
      : aspectRatio === '9:16'
      ? '📱 Vertical (9:16)'
      : '📺 Horizontal (16:9)'
  })

  // Располагаем кнопки в один ряд + кнопка назад
  const keyboard = [buttons, [isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu']]
  return Markup.keyboard(keyboard).resize()
}
