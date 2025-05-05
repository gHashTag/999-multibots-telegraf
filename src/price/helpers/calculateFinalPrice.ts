import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { SYSTEM_CONFIG } from '@/price/constants/index'
import { logger } from '@/utils/logger'

const DEFAULT_VIDEO_DURATION_SECONDS = 5 // Define default duration

/**
 * Рассчитывает окончательную стоимость модели в звездах.
 * @param modelKey Ключ модели из VIDEO_MODELS_CONFIG (e.g., 'haiper')
 * @returns Стоимость в звездах (округленная вниз)
 */
export function calculateFinalPrice(modelKey: string): number {
  const modelConfig = VIDEO_MODELS_CONFIG[modelKey]
  if (!modelConfig) {
    logger.error('calculateFinalPrice: Unknown model key', { modelKey })
    return 0 // Или бросить ошибку?
  }

  // --- Новый порядок расчета (с учетом цены за секунду) ---
  // 1. Рассчитываем полную базовую стоимость в USD
  //    (Умножаем цену за секунду на стандартную длительность)
  //    TODO: Уточнить, нужно ли для НЕ-Kling моделей использовать другую логику или их basePrice?
  const totalBaseCostUSD =
    modelConfig.basePrice * DEFAULT_VIDEO_DURATION_SECONDS

  // 2. Переводим полную базовую цену в звезды
  const basePriceInStars = totalBaseCostUSD / SYSTEM_CONFIG.starCost
  // 3. Применяем наценку к звездам
  const finalPriceWithMarkup =
    basePriceInStars * (1 + SYSTEM_CONFIG.interestRate)
  // 4. Округляем ВНИЗ до целого числа звезд
  const finalPriceInStars = Math.floor(finalPriceWithMarkup)

  // Логируем новый расчет
  logger.info('calculateFinalPrice (Per Second Logic): Calculated price', {
    // Updated log message
    modelKey,
    basePricePerSecondUSD: modelConfig.basePrice, // Log per second price
    defaultDuration: DEFAULT_VIDEO_DURATION_SECONDS,
    totalBaseCostUSD: totalBaseCostUSD, // Log calculated total base cost
    starCost: SYSTEM_CONFIG.starCost,
    basePriceInStars: basePriceInStars, // Логируем промежуточный результат
    interestRate: SYSTEM_CONFIG.interestRate,
    finalPriceWithMarkup: finalPriceWithMarkup, // Логируем промежуточный результат
    finalPriceInStars, // Финальный результат
  })

  return finalPriceInStars
}
