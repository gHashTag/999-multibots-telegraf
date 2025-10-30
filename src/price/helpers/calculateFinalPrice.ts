import { VIDEO_MODELS_CONFIG } from '@/modules/videoGenerator/config/models.config'
import { SYSTEM_CONFIG } from '@/price/constants/index'
import { logger } from '@/utils/logger'

const DEFAULT_VIDEO_DURATION_SECONDS = 5 // Define default duration

/**
 * Рассчитывает окончательную стоимость модели в звездах с учетом выбранного разрешения.
 * @param modelKey Ключ модели из VIDEO_MODELS_CONFIG (e.g., 'haiper')
 * @param selectedResolution Опциональное разрешение (для моделей с priceByResolution)
 * @returns Стоимость в звездах (округленная вниз)
 */
export function calculateFinalPrice(
  modelKey: string,
  selectedResolution?: string
): number {
  const modelConfig = VIDEO_MODELS_CONFIG[modelKey]
  if (!modelConfig) {
    logger.error('calculateFinalPrice: Unknown model key', { modelKey })
    return 0 // Или бросить ошибку?
  }

  // ФИКСИРОВАННЫЕ ЦЕНЫ для специальных моделей
  if (modelKey === 'veo3_fast') {
    logger.info('calculateFinalPrice: Using fixed price for Veo 3 Fast', {
      modelKey,
      fixedPriceInStars: 40,
    })
    return 40
  }

  if (modelKey === 'veo3') {
    logger.info('calculateFinalPrice: Using fixed price for Veo 3', {
      modelKey,
      fixedPriceInStars: 120,
    })
    return 120
  }

  // ФИКСИРОВАННЫЕ ЦЕНЫ для Kling v1.6 Pro Image to Video
  if (modelKey === 'kling-v1.6-pro') {
    logger.info('calculateFinalPrice: Using fixed price for Kling v1.6 Pro', {
      modelKey,
      fixedPriceInStars: 60,
    })
    return 60
  }

  // ФИКСИРОВАННЫЕ ЦЕНЫ для Minimax Image to Video
  if (modelKey === 'minimax') {
    logger.info('calculateFinalPrice: Using fixed price for Minimax', {
      modelKey,
      fixedPriceInStars: 50,
    })
    return 50
  }

  // Удаляем фиксированные цены для Kling v2.1 - пусть они рассчитываются динамически
  // так как они используют стандартную длительность 5 секунд, а не 10

  // --- Новый порядок расчета (с учетом цены за секунду и разрешения) ---
  // 1. Определяем базовую цену с учетом разрешения
  let basePrice = modelConfig.basePrice

  if (
    selectedResolution &&
    modelConfig.priceByResolution &&
    modelConfig.priceByResolution[selectedResolution]
  ) {
    basePrice = modelConfig.priceByResolution[selectedResolution]
    logger.info('calculateFinalPrice: Using resolution-based pricing', {
      modelKey,
      selectedResolution,
      resolutionPrice: basePrice,
      defaultPrice: modelConfig.basePrice,
    })
  }

  // 2. Рассчитываем полную базовую стоимость в USD
  //    (Умножаем цену за секунду на стандартную длительность)
  const totalBaseCostUSD = basePrice * DEFAULT_VIDEO_DURATION_SECONDS

  // 3. Переводим полную базовую цену в звезды
  const basePriceInStars = totalBaseCostUSD / SYSTEM_CONFIG.starCost
  // 4. Применяем наценку к звездам (interestRate уже включает наценку: 1.5 = 150% = 50% наценка)
  const finalPriceWithMarkup = basePriceInStars * SYSTEM_CONFIG.interestRate
  // 5. Округляем ВНИЗ до целого числа звезд
  const finalPriceInStars = Math.floor(finalPriceWithMarkup)

  // Логируем новый расчет
  logger.info('calculateFinalPrice (Per Second Logic): Calculated price', {
    // Updated log message
    modelKey,
    selectedResolution,
    basePricePerSecondUSD: basePrice, // Log actual price used (может быть с учетом разрешения)
    defaultBasePriceUSD: modelConfig.basePrice, // Log original base price
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
