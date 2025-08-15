/**
 * 🕉️ ЕДИНАЯ КОНФИГУРАЦИЯ ЦЕНООБРАЗОВАНИЯ
 *
 * КРИТИЧЕСКИ ВАЖНО: Это ЕДИНСТВЕННОЕ место определения цен в системе!
 * Все расчёты должны использовать эти константы.
 */

// ============================================
// БАЗОВЫЕ КОНСТАНТЫ (НЕ ИЗМЕНЯТЬ БЕЗ СОГЛАСОВАНИЯ!)
// ============================================

/**
 * Стоимость 1 звезды в USD
 * Это базовая единица расчёта во всей системе
 */
export const STAR_COST_USD = 0.016

/**
 * Множитель наценки (markup)
 * 1.5 = 50% наценки на все услуги
 */
export const MARKUP_MULTIPLIER = 1.5

/**
 * Курс USD к RUB
 * Используется для отображения цен в рублях
 */
export const USD_TO_RUB_RATE = 100

// ============================================
// РАСЧЁТНЫЕ ФУНКЦИИ
// ============================================

/**
 * Преобразует базовую стоимость в USD в количество звёзд с учётом наценки
 * @param baseCostUSD - базовая стоимость услуги в USD (себестоимость)
 * @returns количество звёзд (округлённое вниз)
 */
export function usdToStars(baseCostUSD: number): number {
  const starsBeforeMarkup = baseCostUSD / STAR_COST_USD
  const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
  return Math.floor(starsWithMarkup)
}

/**
 * Преобразует количество звёзд в USD
 * @param stars - количество звёзд
 * @returns стоимость в USD
 */
export function starsToUSD(stars: number): number {
  return stars * STAR_COST_USD
}

/**
 * Преобразует количество звёзд в рубли
 * @param stars - количество звёзд
 * @returns стоимость в рублях
 */
export function starsToRUB(stars: number): number {
  const usd = starsToUSD(stars)
  return Math.round(usd * USD_TO_RUB_RATE)
}

/**
 * Преобразует рубли в количество звёзд
 * @param rub - сумма в рублях
 * @returns количество звёзд (округлённое вниз)
 */
export function rubToStars(rub: number): number {
  const usd = rub / USD_TO_RUB_RATE
  return usdToStars(usd)
}

// ============================================
// ДИНАМИЧЕСКОЕ ЦЕНООБРАЗОВАНИЕ ДЛЯ VEO
// ============================================

export interface DynamicVideoPrice {
  pricePerSecondUSD: number
  supportedDurations: number[]
  defaultDuration: number
}

/**
 * Рассчитывает цену в звёздах для видео модели с динамическим ценообразованием
 * @param pricePerSecondUSD - цена за секунду в USD
 * @param duration - длительность в секундах
 * @returns цена в звёздах
 */
export function calculateVideoPriceInStars(
  pricePerSecondUSD: number,
  duration: number
): number {
  const totalCostUSD = pricePerSecondUSD * duration
  return usdToStars(totalCostUSD)
}

// ============================================
// КОНФИГУРАЦИЯ ДИНАМИЧЕСКИХ МОДЕЛЕЙ VEO
// ============================================

export const VEO_MODELS_PRICING: Record<string, DynamicVideoPrice> = {
  'veo-3': {
    pricePerSecondUSD: 0.4,
    supportedDurations: [2, 4, 6, 8],
    defaultDuration: 8,
  },
  'veo-3-fast': {
    pricePerSecondUSD: 0.3,
    supportedDurations: [2, 4, 6, 8],
    defaultDuration: 4,
  },
  'veo-2': {
    pricePerSecondUSD: 0.3,
    supportedDurations: [4, 6, 8, 10],
    defaultDuration: 8,
  },
}

// ============================================
// ВАЛИДАЦИЯ КОНФИГУРАЦИИ
// ============================================

// Проверяем корректность констант при загрузке модуля
if (STAR_COST_USD <= 0) {
  throw new Error('STAR_COST_USD must be positive')
}

if (MARKUP_MULTIPLIER < 1) {
  throw new Error('MARKUP_MULTIPLIER must be >= 1 (no negative markup allowed)')
}

if (USD_TO_RUB_RATE <= 0) {
  throw new Error('USD_TO_RUB_RATE must be positive')
}

// ============================================
// ЭКСПОРТ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ============================================

// Эти экспорты для обратной совместимости со старым кодом
export const starCost = STAR_COST_USD
export const interestRate = MARKUP_MULTIPLIER
export const rubRate = USD_TO_RUB_RATE

// Для логирования конфигурации
export function logPricingConfig(): void {
  console.log('💰 PRICING CONFIGURATION:')
  console.log(`  1 ⭐ = $${STAR_COST_USD}`)
  console.log(`  Markup: ${((MARKUP_MULTIPLIER - 1) * 100).toFixed(0)}%`)
  console.log(`  1 USD = ${USD_TO_RUB_RATE} RUB`)
  console.log('  VEO Models:')
  Object.entries(VEO_MODELS_PRICING).forEach(([model, config]) => {
    console.log(`    ${model}: $${config.pricePerSecondUSD}/sec`)
  })
}
