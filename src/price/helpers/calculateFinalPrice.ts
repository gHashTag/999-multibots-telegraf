import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
import { SYSTEM_CONFIG } from '@/price/constants/index'
import { logger } from '@/utils/logger'

const DEFAULT_VIDEO_DURATION_SECONDS = 5 // Define default duration

/**
 * Рассчитывает окончательную стоимость в звездах на основе ID модели.
 * @param modelId Идентификатор модели (строка).
 * @param steps Необязательный параметр (сейчас не используется в расчете).
 * @returns Стоимость в звездах (округленная вниз), или 0 если модель не найдена или конфиг некорректен.
 */
export function calculateFinalPrice(modelId: string, steps?: number): number {
  logger.info('calculateFinalPrice: Calculating price for modelId', {
    modelId,
    steps: steps ?? 'N/A',
  })

  // 1. Находим конфигурацию модели по ID
  const modelConfig = VIDEO_MODELS_CONFIG[modelId]

  if (!modelConfig) {
    logger.error('calculateFinalPrice: Model config not found for ID', {
      modelId,
    })
    return 0 // Модель не найдена
  }

  // --- Новый порядок расчета (с учетом цены за секунду) ---
  // 1. Рассчитываем полную базовую стоимость в USD
  //    (Умножаем цену за секунду на стандартную длительность)
  //    TODO: Уточнить, нужно ли для НЕ-Kling моделей использовать другую логику или их basePrice?
  const totalBaseCostUSD =
    modelConfig.basePrice * DEFAULT_VIDEO_DURATION_SECONDS

  // Проверка констант (добавлено из HEAD)
  const starCostUsd = SYSTEM_CONFIG.starCost
  const markupMultiplier = 1 + SYSTEM_CONFIG.interestRate // Наценка = 1 + interestRate

  if (
    typeof starCostUsd !== 'number' ||
    starCostUsd <= 0 ||
    typeof markupMultiplier !== 'number' ||
    markupMultiplier < 1 // Множитель должен быть >= 1
  ) {
    logger.error('calculateFinalPrice: Invalid system pricing config', {
      starCostUsd,
      markupMultiplier,
      interestRate: SYSTEM_CONFIG.interestRate,
    })
    return 0 // Невозможно рассчитать цену
  }

  // 2. Переводим полную базовую цену в звезды
  const basePriceInStars = totalBaseCostUSD / starCostUsd
  // 3. Применяем наценку к звездам
  const finalPriceWithMarkup = basePriceInStars * markupMultiplier
  // 4. Округляем ВНИЗ до целого числа звезд
  const finalPriceInStars = Math.floor(finalPriceWithMarkup)

  // Логируем новый расчет
  logger.info('calculateFinalPrice (Per Second Logic): Calculated price', {
    // Updated log message
    modelId, // Используем modelId, как в HEAD
    basePricePerSecondUSD: modelConfig.basePrice, // Log per second price
    defaultDuration: DEFAULT_VIDEO_DURATION_SECONDS,
    totalBaseCostUSD: totalBaseCostUSD, // Log calculated total base cost
    starCost: SYSTEM_CONFIG.starCost,
    basePriceInStars: basePriceInStars, // Логируем промежуточный результат
    interestRate: SYSTEM_CONFIG.interestRate,
    markupMultiplier: markupMultiplier, // Добавлено для лога
    finalPriceWithMarkup: finalPriceWithMarkup, // Логируем промежуточный результат
    finalPriceInStars, // Финальный результат
  })

  return finalPriceInStars
}
