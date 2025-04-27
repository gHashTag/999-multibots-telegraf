import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
import { SYSTEM_CONFIG } from '@/price/constants/index'
import { logger } from '@/utils/logger'

/**
 * Рассчитывает окончательную стоимость модели в звездах.
 * @param modelKey Ключ модели из VIDEO_MODELS_CONFIG (e.g., 'haiper')
 * @returns Стоимость в звездах (округленная вниз), не меньше 0.
 */
export function calculateFinalPrice(modelKey: string): number {
  const modelConfig = VIDEO_MODELS_CONFIG[modelKey]
  if (!modelConfig || modelConfig.basePrice < 0) {
    // Also check for negative base price here
    if (!modelConfig) {
      logger.error('calculateFinalPrice: Unknown model key', { modelKey })
    }
    // Return 0 for unknown models or models with negative base price
    return 0
  }

  // --- Новый порядок расчета ---
  // 1. Переводим базовую цену в звезды
  const basePriceInStars = modelConfig.basePrice / SYSTEM_CONFIG.starCost
  // 2. Применяем наценку к звездам
  const finalPriceWithMarkup =
    basePriceInStars * (1 + SYSTEM_CONFIG.interestRate)
  // 3. Округляем ВНИЗ до целого числа звезд
  let finalPriceInStars = Math.floor(finalPriceWithMarkup)

  // Ensure the final price is not negative
  finalPriceInStars = Math.max(0, finalPriceInStars)

  // Логируем новый расчет
  logger.info('calculateFinalPrice (New Logic): Calculated price', {
    modelKey,
    basePriceUSD: modelConfig.basePrice,
    starCost: SYSTEM_CONFIG.starCost,
    basePriceInStars: basePriceInStars, // Логируем промежуточный результат
    interestRate: SYSTEM_CONFIG.interestRate,
    finalPriceWithMarkup: finalPriceWithMarkup, // Логируем промежуточный результат
    finalPriceInStars, // Финальный результат
  })

  return finalPriceInStars
}
