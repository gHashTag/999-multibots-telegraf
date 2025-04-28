import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG' // Возвращаем старый конфиг
import { SYSTEM_CONFIG } from '@/price/constants' // Используем константы из SYSTEM_CONFIG
import { logger } from '@/utils/logger'

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

  // 2. Получаем базовую цену в USD из конфига модели
  const basePriceUsd = modelConfig.basePrice

  if (typeof basePriceUsd !== 'number' || basePriceUsd < 0) {
    logger.error('calculateFinalPrice: Invalid basePrice in model config', {
      modelId,
      basePriceUsd,
    })
    return 0
  }

  // 3. Проверяем константы из SYSTEM_CONFIG
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

  // 4. Переводим базовую цену USD в звезды
  const basePriceInStars = basePriceUsd / starCostUsd

  // 5. Применяем наценку
  const finalPriceWithMarkup = basePriceInStars * markupMultiplier

  // 6. Округляем ВНИЗ до целого числа звезд
  const finalPriceInStars = Math.floor(finalPriceWithMarkup)

  logger.info('calculateFinalPrice: Calculated price (using modelId)', {
    modelId,
    basePriceUSD: basePriceUsd,
    starCostUSD: starCostUsd,
    basePriceInStars,
    markupMultiplier,
    finalPriceWithMarkup,
    finalPriceInStars, // Финальный результат
  })

  return finalPriceInStars
}
