import {
  ModeEnum,
  CostCalculationParams,
  CostCalculationResult,
} from '@/interfaces/modes'
import { logger } from '@/utils/logger'
// import {
//   STAR_COST_USD,
//   MARKUP_MULTIPLIER,
//   BASE_PRICES_USD,
//   CURRENCY_RATES,
//   STEP_BASED_PRICES_USD,
// } from '@/pricing/config/pricing.config'
import { VIDEO_MODELS_CONFIG } from '@/config/models.config'
// import { CostDetails } from '@/interfaces'; // Удаляем неверный импорт
// TODO: Импортировать конфиги моделей, если цена зависит от них
// import { VIDEO_MODELS_CONFIG } from '@/config/models.config';
// import { imageModelPrices } from '@/price/models'; // Старый путь, возможно, перенести

/**
 * Калькулятор цен.
 * Центральное место для всех расчетов стоимости.
 */

/**
 * Округляет число до указанного количества знаков после запятой.
 * @param num Число для округления.
 * @param decimals Количество знаков после запятой.
 * @returns Округленное число.
 */
function round(num: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round(num * factor) / factor
}

// --- TODO: Re-implement or remove these functions based on pricing.config ---
/**
 * Конвертирует доллары в звезды с учетом наценки.
 * @param usd Цена в долларах.
 * @returns Цена в звездах (целое число).
 */
function convertUsdToStars(usd: number): number {
  const STAR_COST_USD = 0.01 // Placeholder
  const MARKUP_MULTIPLIER = 2 // Placeholder
  if (STAR_COST_USD <= 0) {
    console.error('STAR_COST_USD должен быть больше нуля.')
    return 0 // или throw error
  }
  const markedUpUsd = usd * MARKUP_MULTIPLIER
  const stars = markedUpUsd / STAR_COST_USD
  // Use Math.floor as per rule price-calculation-consistency.mdc
  return Math.floor(stars) // Floor based on rule
}

/**
 * Конвертирует доллары в рубли.
 * @param usd Цена в долларах.
 * @returns Цена в рублях.
 */
function convertUsdToRub(usd: number): number {
  const USD_TO_RUB = 100 // Placeholder
  return round(usd * USD_TO_RUB)
}

/**
 * Центральная функция для расчета КОНЕЧНОЙ стоимости операции в звездах, рублях и долларах.
 * Использует базовые цены, стоимость звезды и наценку из pricing.config.ts.
 *
 * @param mode Режим операции
 * @param params Дополнительные параметры (steps, modelId, numImages)
 * @returns Объект CostCalculationResult { stars, rubles, dollars } или null при ошибке
 */
export function calculateFinalStarPrice(
  mode: ModeEnum | string, // Allow string for flexibility, map later if needed
  options?: { modelId?: string; steps?: number }
): CostCalculationResult {
  // console.log(
  //   '>>> DEBUG: VIDEO_MODELS_CONFIG inside calculateFinalStarPrice:',
  //   JSON.stringify(VIDEO_MODELS_CONFIG)
  // )

  let baseUsdPrice = 0
  const { modelId, steps } = options || {}

  // --- TODO: Refactor this logic once pricing.config.ts is implemented ---
  // --- Current implementation is simplified to pass type checks ---

  // 1. Определяем базовую цену в USD (Упрощенная логика)
  if (
    (mode === ModeEnum.ImageToVideo || mode === ModeEnum.TextToVideo) &&
    modelId &&
    VIDEO_MODELS_CONFIG && // Already imported
    VIDEO_MODELS_CONFIG[modelId]
  ) {
    baseUsdPrice = VIDEO_MODELS_CONFIG[modelId].basePrice || 0
    // console.log(`>>> DEBUG: Found price for ${modelId}: ${baseUsdPrice}`)
  }
  // Simplified step/base pricing - use placeholders or simplified logic
  else if (
    (mode === ModeEnum.DigitalAvatarBody ||
      mode === ModeEnum.DigitalAvatarBodyV2) &&
    steps
  ) {
    const STEP_PRICE = mode === ModeEnum.DigitalAvatarBody ? 0.02 : 0.025 // Placeholder
    baseUsdPrice = (STEP_PRICE || 0) * steps
  } else {
    // Placeholder fixed prices
    const BASE_PRICES_USD: Partial<Record<ModeEnum, number>> = {
      [ModeEnum.NeuroPhoto]: 0.1,
      [ModeEnum.NeuroPhotoV2]: 0.15,
      [ModeEnum.MainMenu]: 0,
      [ModeEnum.VoiceToText]: 0.05,
    }
    baseUsdPrice = BASE_PRICES_USD[mode as ModeEnum] ?? 0
  }
  // else {
  // console.warn(`Не найдена базовая цена для режима: ${mode}`)
  // baseUsdPrice = 0 // По умолчанию 0, если цена не найдена
  // }

  // 2. Применяем наценку и конвертируем в звезды и рубли (Упрощенно)
  const MARKUP_MULTIPLIER = 2 // Placeholder
  const finalUsd = round(baseUsdPrice * MARKUP_MULTIPLIER)
  const finalStars = convertUsdToStars(baseUsdPrice) // Uses placeholders internally now
  const finalRub = convertUsdToRub(finalUsd) // Uses placeholders internally now

  return {
    stars: finalStars,
    rubles: finalRub,
    dollars: finalUsd,
  }
}

// TODO: [Рефакторинг] Удалить или переосмыслить старые функции, если они больше не нужны
// Старая логика расчета (ПРИМЕР, НУЖНО УДАЛИТЬ ИЛИ АДАПТИРОВАТЬ)
/*
export function calculateCost(
  mode: ModeEnum,
  options?: { modelId?: string; steps?: number }
): number {
  // ... старая логика ...
  // Теперь должна использоваться calculateFinalStarPrice
  console.warn('Вызвана устаревшая функция calculateCost');
  return 0;
}

export function generateCostMessage(
  cost: number,
  balance: number,
  mode: ModeEnum
): string {
   // ... старая логика ...
   // Теперь должна использоваться информация из calculateFinalStarPrice и баланса
   console.warn('Вызвана устаревшая функция generateCostMessage');
  return `Устаревшее сообщение о стоимости.`;
}
*/

// TODO: Добавить функции для генерации сообщений о стоимости на основе CostDetails

// TODO: Добавить тесты для calculateFinalStarPrice

// Убираем старые TODO
// TODO: Implement logic based on modelId and steps
// TODO: Fetch actual model price if modelId is provided
// TODO: Calculate price based on steps if steps are provided

// TODO: Добавить тесты для calculateFinalStarPrice
