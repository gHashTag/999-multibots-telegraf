import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { logger } from '@/utils/logger'
import {
  UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG,
  getActiveModels,
  getUnifiedModelPrice,
  UnifiedVideoModelId,
  VideoInputType,
} from '@/config/unified-video-models.config'

type VideoModelConfigKey = UnifiedVideoModelId

/**
 * Получить доступные модели по типу входа
 */
function getAvailableModels(inputType: VideoInputType): UnifiedVideoModelId[] {
  const activeModels = getActiveModels()
  return activeModels
    .filter(model => model.inputTypes.includes(inputType))
    .map(model => model.id as UnifiedVideoModelId)
}

/**
 * Форматировать кнопку модели
 */
function formatModelButton(modelKey: VideoModelConfigKey, isRu: boolean = false): string {
  const config = VIDEO_MODELS_CONFIG[modelKey]
  if (!config) return modelKey

  const name = isRu ? config.nameRu : config.name
  const price = getUnifiedModelPrice(modelKey)
  return `${name} (${price}⭐)`
}

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
  const availableModels = getAvailableModels(inputType as VideoInputType)

  // Формируем кнопки с названиями моделей и ценами
  const buttons: string[][] = []
  const models = availableModels.map(key => ({
    key,
    price: getUnifiedModelPrice(key),
  }))

  // Сортируем модели по цене
  models.sort((a, b) => a.price - b.price)

  // Группируем по две кнопки в ряд
  for (let i = 0; i < models.length; i += 2) {
    const row = []
    row.push(formatModelButton(models[i].key, isRu))
    if (models[i + 1]) {
      row.push(formatModelButton(models[i + 1].key, isRu))
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

  // Проверяем наличие разрешений в apiSettings
  const resolutions = config.apiSettings.resolutions
  if (!resolutions || resolutions.length === 0) {
    return Markup.inlineKeyboard([])
  }

  // Проверяем, что модель поддерживает ценообразование по разрешениям
  if (config.pricing.type !== 'per_resolution' && config.pricing.type !== 'per_duration_resolution') {
    return Markup.inlineKeyboard([])
  }

  const buttons = resolutions.map(resolution => {
    const price = getUnifiedModelPrice(modelKey, { resolution })

    return Markup.button.callback(
      `${resolution.toUpperCase()} (${price} ⭐)`,
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

  // Проверяем наличие длительностей в apiSettings
  const durations = config.apiSettings.durations
  if (!durations || durations.length === 0) {
    return Markup.inlineKeyboard([])
  }

  // Проверяем, что модель поддерживает ценообразование по длительности
  if (config.pricing.type !== 'per_duration' && config.pricing.type !== 'per_duration_resolution' && config.pricing.type !== 'per_second') {
    return Markup.inlineKeyboard([])
  }

  const buttons = durations.map(duration => {
    const price = getUnifiedModelPrice(modelKey, { duration })

    const buttonText = isRu
      ? `${duration} сек (${price} ⭐)`
      : `${duration} sec (${price} ⭐)`

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

  // Проверяем наличие aspectRatios в apiSettings
  const aspectRatios = config.apiSettings.aspectRatios
  if (!aspectRatios || aspectRatios.length === 0) {
    return Markup.keyboard([
      [isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'],
    ]).resize()
  }

  const buttons = aspectRatios.map(aspectRatio => {
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
