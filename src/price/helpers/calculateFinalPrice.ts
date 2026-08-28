import { UNIFIED_VIDEO_MODELS as VIDEO_MODELS_CONFIG } from '@/config/unified-video-models.config'
import { SYSTEM_CONFIG } from '@/price/constants/index'
import { logger } from '@/utils/logger'

const DEFAULT_VIDEO_DURATION_SECONDS = 5 // Define default duration

/**
 * Рассчитывает окончательную стоимость модели в звездах с учетом выбранного разрешения.
 * @param modelKey Ключ модели из VIDEO_MODELS_CONFIG (e.g., 'haiper')
 * @param selectedResolution Опциональное разрешение (для моделей с priceByResolution)
 * @param selectedDuration Опциональная длительность (для моделей с priceByDuration)
 * @returns Стоимость в звездах (округленная вниз)
 */
export function calculateFinalPrice(
  modelKey: string,
  selectedResolution?: string,
  selectedDuration?: number
): number {
  const modelConfig = VIDEO_MODELS_CONFIG[modelKey]
  if (!modelConfig) {
    logger.error('calculateFinalPrice: Unknown model key', { modelKey })
    return 0
  }

  // ✅ ПРИОРИТЕТ 1: Фиксированная цена (БЕЗ наценки, уже финальная)
  if (
    modelConfig.pricing.type === 'fixed' &&
    modelConfig.pricing.fixedPriceStars
  ) {
    logger.info('calculateFinalPrice: Using fixed price (no markup)', {
      modelKey,
      fixedPriceStars: modelConfig.pricing.fixedPriceStars,
    })
    return modelConfig.pricing.fixedPriceStars
  }

  // ✅ ПРИОРИТЕТ 2: Матрица цен (длительность + разрешение) (БЕЗ наценки)
  if (
    modelConfig.pricing.type === 'per_duration_resolution' &&
    modelConfig.pricing.priceMatrix
  ) {
    const duration =
      selectedDuration ||
      modelConfig.pricing.defaultDuration ||
      DEFAULT_VIDEO_DURATION_SECONDS
    const resolution =
      selectedResolution ||
      Object.keys(modelConfig.pricing.priceMatrix[duration] || {})[0]

    const price = modelConfig.pricing.priceMatrix[duration]?.[resolution]
    if (price) {
      logger.info('calculateFinalPrice: Using price matrix (no markup)', {
        modelKey,
        duration,
        resolution,
        priceStars: price,
      })
      return price
    }
  }

  // ✅ ПРИОРИТЕТ 3: Цена по длительности (БЕЗ наценки)
  if (
    modelConfig.pricing.type === 'per_duration' &&
    modelConfig.pricing.priceByDuration
  ) {
    // Используем выбранную длительность или первую доступную как fallback
    const duration =
      selectedDuration ||
      modelConfig.pricing.defaultDuration ||
      Number(Object.keys(modelConfig.pricing.priceByDuration)[0])
    const price = modelConfig.pricing.priceByDuration[duration]
    if (price) {
      logger.info(
        'calculateFinalPrice: Using duration-based price (no markup)',
        {
          modelKey,
          selectedDuration: duration,
          priceStars: price,
        }
      )
      return price
    }
  }

  // ✅ ПРИОРИТЕТ 4: Цена по разрешению (БЕЗ наценки)
  if (
    modelConfig.pricing.type === 'per_resolution' &&
    modelConfig.pricing.priceByResolution
  ) {
    // Используем выбранное разрешение или первое доступное как fallback
    const resolution =
      selectedResolution ||
      Object.keys(modelConfig.pricing.priceByResolution)[0]
    const price = modelConfig.pricing.priceByResolution[resolution]
    if (price) {
      logger.info(
        'calculateFinalPrice: Using resolution-based price (no markup)',
        {
          modelKey,
          selectedResolution: resolution,
          priceStars: price,
        }
      )
      return price
    }
  }

  // ✅ ПРИОРИТЕТ 5: Цена за секунду (С НАЦЕНКОЙ - устаревший метод)
  if (
    modelConfig.pricing.type === 'per_second' &&
    modelConfig.pricing.pricePerSecondUSD
  ) {
    const duration =
      selectedDuration ||
      modelConfig.pricing.defaultDuration ||
      DEFAULT_VIDEO_DURATION_SECONDS
    const totalBaseCostUSD = modelConfig.pricing.pricePerSecondUSD * duration
    const basePriceInStars = totalBaseCostUSD / SYSTEM_CONFIG.starCost
    const finalPriceWithMarkup = basePriceInStars * SYSTEM_CONFIG.interestRate
    const finalPriceInStars = Math.floor(finalPriceWithMarkup)

    logger.info('calculateFinalPrice: Using per-second pricing (WITH markup)', {
      modelKey,
      duration,
      pricePerSecondUSD: modelConfig.pricing.pricePerSecondUSD,
      totalBaseCostUSD,
      starCost: SYSTEM_CONFIG.starCost,
      basePriceInStars,
      interestRate: SYSTEM_CONFIG.interestRate,
      finalPriceWithMarkup,
      finalPriceInStars,
    })

    return finalPriceInStars
  }

  logger.error('calculateFinalPrice: No valid pricing config found', {
    modelKey,
  })
  return 0
}
