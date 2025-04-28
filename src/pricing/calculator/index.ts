import {
  ModeEnum,
  CostCalculationParams,
  CostCalculationResult,
} from '@/interfaces/modes'
import { logger } from '@/utils/logger'
import {
  STAR_COST_USD,
  MARKUP_MULTIPLIER,
  BASE_PRICES_USD,
  CURRENCY_RATES,
  STEP_BASED_PRICES_USD,
} from '@/pricing/config/pricing.config'
import { VIDEO_MODELS_CONFIG } from '@/pricing/config/VIDEO_MODELS_CONFIG'
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

/**
 * Конвертирует доллары в звезды с учетом наценки.
 * @param usd Цена в долларах.
 * @returns Цена в звездах (целое число).
 */
function convertUsdToStars(usd: number): number {
  if (STAR_COST_USD <= 0) {
    console.error('STAR_COST_USD должен быть больше нуля.')
    return 0 // или throw error
  }
  const markedUpUsd = usd * MARKUP_MULTIPLIER
  const stars = markedUpUsd / STAR_COST_USD
  return Math.ceil(stars) // Округляем вверх до целой звезды
}

/**
 * Конвертирует доллары в рубли.
 * @param usd Цена в долларах.
 * @returns Цена в рублях.
 */
function convertUsdToRub(usd: number): number {
  return round(usd * CURRENCY_RATES.USD_TO_RUB)
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
  mode: ModeEnum,
  options?: { modelId?: string; steps?: number }
): CostCalculationResult {
  let baseUsdPrice = 0
  const { modelId, steps } = options || {}

  // 1. Определяем базовую цену в USD
  if (
    (mode === ModeEnum.ImageToVideo || mode === ModeEnum.TextToVideo) &&
    modelId &&
    VIDEO_MODELS_CONFIG[modelId]
  ) {
    // Цена зависит от видеомодели
    baseUsdPrice = VIDEO_MODELS_CONFIG[modelId].basePrice || 0
  } else if (
    (mode === ModeEnum.DigitalAvatarBody ||
      mode === ModeEnum.DigitalAvatarBodyV2) &&
    steps &&
    STEP_BASED_PRICES_USD[mode]
  ) {
    // Цена зависит от шагов
    baseUsdPrice = (STEP_BASED_PRICES_USD[mode] || 0) * steps
  } else if (BASE_PRICES_USD[mode] !== undefined) {
    // Цена фиксирована для режима
    baseUsdPrice = BASE_PRICES_USD[mode] || 0
  } else {
    // TODO: Обработать другие режимы (например, TextToImage с выбором модели)
    console.warn(`Не найдена базовая цена для режима: ${mode}`)
    baseUsdPrice = 0 // По умолчанию 0, если цена не найдена
  }

  // 2. Применяем наценку и конвертируем в звезды и рубли
  const finalUsd = round(baseUsdPrice * MARKUP_MULTIPLIER)
  const finalStars = convertUsdToStars(baseUsdPrice)
  const finalRub = convertUsdToRub(finalUsd)

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
