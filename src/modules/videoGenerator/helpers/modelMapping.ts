import { VIDEO_MODELS_CONFIG } from '../config/models.config'
import { calculateFinalPrice } from '@/price/helpers'
import { calculateKieAiPriceInStars } from '@/config/unified-pricing.config'
import { logger } from '@/utils/logger'

export type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

/**
 * Форматирует текст кнопки для модели с учетом цены
 * Не показывает цену для моделей с переменной стоимостью (durationOptions/resolutionOptions)
 */
export function formatModelButton(modelKey: VideoModelConfigKey): string {
  const config = VIDEO_MODELS_CONFIG[modelKey]

  // Если модель имеет переменную стоимость (выбор длительности или разрешения), не показываем цену
  if (
    config.durationOptions?.length > 0 ||
    config.resolutionOptions?.length > 0
  ) {
    return config.title
  }

  // Для моделей с фиксированной ценой показываем стоимость
  let finalPrice: number
  if (isKieAiModel(modelKey)) {
    // Берем длительность по умолчанию из API конфига
    const duration = config.api.input.duration || 5
    finalPrice = calculateKieAiPriceInStars(modelKey, duration)
  } else {
    finalPrice = calculateFinalPrice(modelKey)
  }

  return `${config.title} (${finalPrice} ⭐)`
}

/**
 * Находит ключ модели по тексту кнопки
 * Теперь поддерживает поиск для кнопок с переменной стоимостью (без цены)
 */
export function findModelByButtonText(
  buttonText: string
): VideoModelConfigKey | null {
  logger.info('[findModelByButtonText] Looking for model', { buttonText })

  for (const [key, config] of Object.entries(VIDEO_MODELS_CONFIG)) {
    const expectedButtonText = formatModelButton(key as VideoModelConfigKey)
    if (expectedButtonText === buttonText) {
      logger.info('[findModelByButtonText] Found exact match', {
        buttonText,
        modelKey: key,
      })
      return key as VideoModelConfigKey
    }
  }

  logger.warn('[findModelByButtonText] No model found for button text', {
    buttonText,
  })
  return null
}

/**
 * Получает список доступных моделей для данного типа ввода
 */
export function getAvailableModels(
  inputType: 'text' | 'image'
): VideoModelConfigKey[] {
  return Object.entries(VIDEO_MODELS_CONFIG)
    .filter(([_, config]) => config.inputType.includes(inputType))
    .map(([key]) => key as VideoModelConfigKey)
}

/**
 * Проверяет, поддерживает ли модель выбор разрешения
 */
export function supportsResolution(modelKey: VideoModelConfigKey): boolean {
  const config = VIDEO_MODELS_CONFIG[modelKey]
  return Boolean(config.resolutionOptions?.length)
}

/**
 * Получает доступные разрешения для модели
 */
export function getAvailableResolutions(
  modelKey: VideoModelConfigKey
): string[] {
  const config = VIDEO_MODELS_CONFIG[modelKey]
  return config.resolutionOptions || []
}

/**
 * Получает цену для определенного разрешения
 */
/**
 * Проверяет, является ли модель моделью Kie.AI
 */
function isKieAiModel(modelKey: string): boolean {
  return ['veo-3-fast', 'veo-3', 'runway-aleph'].includes(modelKey)
}

export function getPriceForResolution(
  modelKey: VideoModelConfigKey,
  resolution: string
): number {
  const config = VIDEO_MODELS_CONFIG[modelKey]

  // Для моделей Kie.ai всегда используем единую цену (они не поддерживают разрешения)
  if (isKieAiModel(modelKey)) {
    const duration = config.api.input.duration || 5
    return calculateKieAiPriceInStars(modelKey, duration)
  }

  if (!config.priceByResolution) {
    return calculateFinalPrice(modelKey)
  }

  const basePrice = config.priceByResolution[resolution] || config.basePrice
  return Math.floor(((basePrice * 5) / 0.016) * 1.5) // Формула расчета звезд (50% наценка)
}
