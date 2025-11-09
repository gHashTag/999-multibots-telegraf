import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import {
  VIDEO_MODELS_CONFIG as VIDEO_MODELS,
  getModelPriceInStars,
  UnifiedVideoModelConfig as VideoModelInfo,
} from '@/config/unified-video-models.config'
import { VideoModelId } from '@/services/generateTextToVideo'
import { logger } from '@/utils/logger'

/**
 * Создает клавиатуру для выбора видео моделей с правильными ценами
 * @param isRu - Язык интерфейса
 * @param inputType - Тип ввода (text или image)
 * @returns Клавиатура Telegram
 */
export function createVideoModelKeyboard(
  isRu: boolean,
  inputType: 'text' | 'image'
): Markup.Markup<ReplyKeyboardMarkup> {
  logger.info('[createVideoModelKeyboard] Creating keyboard', {
    isRu,
    inputType,
  })

  // Фильтруем модели по типу ввода
  const filteredModels = Object.values(VIDEO_MODELS).filter(model =>
    model.inputTypes.includes(inputType)
  )

  logger.info('[createVideoModelKeyboard] Filtered models', {
    count: filteredModels.length,
    models: filteredModels.map(m => m.id),
  })

  // Сортируем модели по цене (от дешевых к дорогим)
  const sortedModels = filteredModels.sort((a, b) => {
    const priceA = getModelPriceInStars(a.id, a.defaultDuration)
    const priceB = getModelPriceInStars(b.id, b.defaultDuration)
    return priceA - priceB
  })

  // Формируем кнопки с названием модели и ценой
  const modelButtons: string[][] = []

  for (let i = 0; i < sortedModels.length; i += 2) {
    const row: string[] = []

    // Первая кнопка в ряду
    const model1 = sortedModels[i]
    const button1Text = formatModelButton(model1, isRu)
    row.push(button1Text)

    // Вторая кнопка в ряду (если есть)
    if (sortedModels[i + 1]) {
      const model2 = sortedModels[i + 1]
      const button2Text = formatModelButton(model2, isRu)
      row.push(button2Text)
    }

    modelButtons.push(row)
  }

  // Добавляем кнопку "Назад в меню"
  const backButtonText = isRu ? '⬅️ Назад в меню' : '⬅️ Back to Menu'
  modelButtons.push([backButtonText])

  logger.info('[createVideoModelKeyboard] Created button rows', {
    rowCount: modelButtons.length,
    buttons: modelButtons,
  })

  return Markup.keyboard(modelButtons).resize()
}

/**
 * Форматирует текст кнопки для модели
 * @param model - Информация о модели
 * @param isRu - Язык интерфейса
 * @returns Текст кнопки
 */
function formatModelButton(model: VideoModelInfo, isRu: boolean): string {
  const name = isRu ? model.nameRu : model.name

  // Для динамических моделей показываем диапазон цен или цену по умолчанию
  if (model.pricePerSecond !== undefined && model.supportedDurations) {
    // Получаем минимальную и максимальную цену
    const prices = model.supportedDurations.map(dur =>
      getModelPriceInStars(model.id, dur)
    )
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)

    // Показываем диапазон, если цены отличаются
    if (minPrice !== maxPrice) {
      return `${name} (${minPrice}-${maxPrice} ⭐)`
    } else {
      return `${name} (${minPrice} ⭐)`
    }
  }

  // Для фиксированных моделей показываем фиксированную цену
  const price = getModelPriceInStars(model.id)
  return `${name} (${price} ⭐)`
}

/**
 * Находит модель по тексту кнопки
 * @param buttonText - Текст нажатой кнопки
 * @param inputType - Тип ввода
 * @returns ID модели или undefined
 */
export function findModelByButtonText(
  buttonText: string,
  inputType: 'text' | 'image'
): VideoModelId | undefined {
  logger.info('[findModelByButtonText] Looking for model', {
    buttonText,
    inputType,
  })

  // Убираем цену из текста кнопки (все что в скобках в конце)
  const cleanText = buttonText.replace(/\s*\([^)]*\)\s*$/, '').trim()

  logger.info('[findModelByButtonText] Clean text', { cleanText })

  // Ищем модель по названию
  const model = Object.values(VIDEO_MODELS).find(m => {
    if (!m.inputTypes.includes(inputType)) {
      return false
    }

    // Проверяем совпадение с русским или английским названием
    return m.name === cleanText || m.nameRu === cleanText
  })

  if (model) {
    logger.info('[findModelByButtonText] Found model', {
      modelId: model.id,
      modelName: model.name,
    })
    return model.id
  }

  logger.warn('[findModelByButtonText] Model not found', {
    buttonText,
    cleanText,
  })

  return undefined
}
