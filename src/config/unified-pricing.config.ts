/**
 * 🕉️ ЕДИНАЯ КОНФИГУРАЦИЯ ЦЕНООБРАЗОВАНИЯ
 *
 * КРИТИЧЕСКИ ВАЖНО: Это ЕДИНСТВЕННОЕ место определения цен в системе!
 * Все расчёты должны использовать эти константы.
 */

import { getCurrentRate } from '@/modules/currency-rate'

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
 * Курс USD к RUB по умолчанию
 * Используется как fallback если динамический курс недоступен
 */
export const DEFAULT_USD_TO_RUB_RATE = 85

/**
 * Получает актуальный курс USD к RUB динамически через Bybit API
 * @param fallback - значение по умолчанию если API недоступен
 * @returns Promise с актуальным курсом
 */
export async function getUsdToRubRate(fallback = DEFAULT_USD_TO_RUB_RATE): Promise<number> {
  return await getCurrentRate({ fallback })
}

/**
 * @deprecated Используйте getUsdToRubRate() для динамического курса
 */
export const USD_TO_RUB_RATE = DEFAULT_USD_TO_RUB_RATE

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
 * Преобразует количество звёзд в рубли (статический курс)
 * @deprecated Используйте starsToRUBAsync() для динамического курса
 * @param stars - количество звёзд
 * @returns стоимость в рублях
 */
export function starsToRUB(stars: number): number {
  const usd = starsToUSD(stars)
  return Math.round(usd * DEFAULT_USD_TO_RUB_RATE)
}

/**
 * Преобразует рубли в количество звёзд (статический курс)
 * @deprecated Используйте rubToStarsAsync() для динамического курса
 * @param rub - сумма в рублях
 * @returns количество звёзд (округлённое вниз)
 */
export function rubToStars(rub: number): number {
  const usd = rub / DEFAULT_USD_TO_RUB_RATE
  return usdToStars(usd)
}

/**
 * Преобразует количество звёзд в рубли с актуальным курсом
 * @param stars - количество звёзд
 * @param fallback - курс по умолчанию если API недоступен
 * @returns Promise со стоимостью в рублях
 */
export async function starsToRUBAsync(stars: number, fallback = DEFAULT_USD_TO_RUB_RATE): Promise<number> {
  const usd = starsToUSD(stars)
  const rate = await getUsdToRubRate(fallback)
  return Math.round(usd * rate)
}

/**
 * Преобразует рубли в количество звёзд с актуальным курсом
 * @param rub - сумма в рублях
 * @param fallback - курс по умолчанию если API недоступен
 * @returns Promise с количеством звёзд (округлённое вниз)
 */
export async function rubToStarsAsync(rub: number, fallback = DEFAULT_USD_TO_RUB_RATE): Promise<number> {
  const rate = await getUsdToRubRate(fallback)
  const usd = rub / rate
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
// КОНФИГУРАЦИЯ МОДЕЛЕЙ KIE.AI
// ============================================

export interface KieAiModelPrice {
  pricePerSecondUSD?: number // Для видео моделей
  pricePerImageUSD?: number // Для изображений
  priceBaseUSD?: number // Базовая цена для музыки
  maxDuration?: number // Максимальная длительность
  supportedDurations?: number[]
  defaultDuration?: number
}

export const KIE_AI_MODELS_PRICING: Record<string, KieAiModelPrice> = {
  // Видео модели - КОНКУРЕНТНЫЕ ЦЕНЫ с наценкой +8.1% (2025)
  'kie-veo-3-fast': {
    pricePerSecondUSD: 0.08, // 40⭐ за 8 сек = $0.64 за 8 сек = $0.08/сек (конкурентно с +8.1% наценкой)
    supportedDurations: [8], // VEO FAST поддерживает только 8 секунд
    defaultDuration: 8,
    maxDuration: 8,
  },
  'kie-veo-3': {
    pricePerSecondUSD: 0.404, // 202⭐ за 8 сек = $3.232 за 8 сек = $0.404/сек (конкурентно с +8.1% наценкой)
    supportedDurations: [2, 4, 6, 8, 10],
    defaultDuration: 8,
    maxDuration: 10,
  },
  'kie-runway-aleph': {
    pricePerSecondUSD: 0.485, // 182⭐ за 6 сек = $2.912 за 6 сек = $0.485/сек (конкурентно с +8.1% наценкой)
    supportedDurations: [2, 4, 6, 8, 10],
    defaultDuration: 6,
    maxDuration: 10,
  },

  // Модели изображений
  'kie-gpt-4o-image': {
    pricePerImageUSD: 0.1,
  },
  'kie-midjourney-v7': {
    pricePerImageUSD: 0.15,
  },
  'kie-flux-1-kontext': {
    pricePerImageUSD: 0.08,
  },

  // Музыкальные модели (цена за поколение)
  'kie-suno-v3.5': {
    priceBaseUSD: 0.2,
    maxDuration: 180, // 3 минуты
  },
  'kie-suno-v4': {
    priceBaseUSD: 0.25,
    maxDuration: 240, // 4 минуты
  },
  'kie-suno-v4.5': {
    priceBaseUSD: 0.3,
    maxDuration: 300, // 5 минут
  },
  'kie-suno-v4.5-plus': {
    priceBaseUSD: 0.4,
    maxDuration: 480, // 8 минут
  },
}

/**
 * Рассчитывает цену в звёздах для Kie.ai модели
 */
export function calculateKieAiPriceInStars(
  modelId: string,
  duration?: number,
  numImages?: number
): number {
  const model = KIE_AI_MODELS_PRICING[modelId]
  if (!model) {
    throw new Error(`Unknown Kie.ai model: ${modelId}`)
  }

  let totalCostUSD = 0

  // Видео модели - конкурентное ценообразование
  if (model.pricePerSecondUSD) {
    const finalDuration = duration || model.defaultDuration || 5
    totalCostUSD = model.pricePerSecondUSD * finalDuration

    // Для конкурентных видео моделей возвращаем точную цену в звёздах без дополнительной наценки
    if (
      modelId === 'kie-veo-3-fast' ||
      modelId === 'kie-veo-3' ||
      modelId === 'kie-runway-aleph'
    ) {
      return Math.floor(totalCostUSD / STAR_COST_USD)
    }
  }
  // Модели изображений
  else if (model.pricePerImageUSD) {
    const finalNumImages = numImages || 1
    totalCostUSD = model.pricePerImageUSD * finalNumImages
  }
  // Музыкальные модели
  else if (model.priceBaseUSD) {
    totalCostUSD = model.priceBaseUSD
  }

  // Для остальных моделей применяем стандартную наценку
  return usdToStars(totalCostUSD)
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

if (DEFAULT_USD_TO_RUB_RATE <= 0) {
  throw new Error('DEFAULT_USD_TO_RUB_RATE must be positive')
}

// ============================================
// ЭКСПОРТ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ============================================

// Эти экспорты для обратной совместимости со старым кодом
export const starCost = STAR_COST_USD
export const interestRate = MARKUP_MULTIPLIER
export const rubRate = DEFAULT_USD_TO_RUB_RATE

// Для логирования конфигурации
export async function logPricingConfig(): Promise<void> {
  const currentRate = await getUsdToRubRate()
  console.log('💰 PRICING CONFIGURATION:')
  console.log(`  1 ⭐ = $${STAR_COST_USD}`)
  console.log(`  Markup: ${((MARKUP_MULTIPLIER - 1) * 100).toFixed(0)}%`)
  console.log(`  1 USD = ${currentRate} RUB (dynamic)`)
  console.log(`  Fallback rate: ${DEFAULT_USD_TO_RUB_RATE} RUB`)
  console.log('  VEO Models:')
  Object.entries(VEO_MODELS_PRICING).forEach(([model, config]) => {
    console.log(`    ${model}: $${config.pricePerSecondUSD}/sec`)
  })
}

// ============================================
// ГЕНЕРАЦИЯ ПАКЕТОВ ПОПОЛНЕНИЯ
// ============================================

/**
 * Генерирует пакет пополнения для заданной суммы в рублях (статический курс)
 * @deprecated Используйте generateTopUpPackageAsync() для динамического курса
 * @param amountRub - сумма в рублях
 * @returns объект с суммой в рублях и количеством звёзд
 */
export function generateTopUpPackage(amountRub: number): { amountRub: number; stars: number } {
  const stars = rubToStars(amountRub)
  return { amountRub, stars }
}

/**
 * Генерирует пакет пополнения для заданной суммы в рублях с актуальным курсом
 * @param amountRub - сумма в рублях
 * @param fallback - курс по умолчанию если API недоступен
 * @returns Promise с объектом пакета пополнения
 */
export async function generateTopUpPackageAsync(amountRub: number, fallback = DEFAULT_USD_TO_RUB_RATE): Promise<{ amountRub: number; stars: number }> {
  const stars = await rubToStarsAsync(amountRub, fallback)
  return { amountRub, stars }
}

/**
 * Стандартные пакеты пополнения в рублях
 */
export const STANDARD_RUB_PACKAGES = [10, 500, 1000, 2000, 5000, 10000]

/**
 * Готовые пакеты пополнения (статические)
 * @deprecated Используйте generateDynamicTopUpPackages() для динамических пакетов
 */
export const TOP_UP_PACKAGES = STANDARD_RUB_PACKAGES.map(generateTopUpPackage)

/**
 * Генерирует динамические пакеты пополнения с актуальным курсом
 * @param fallback - курс по умолчанию если API недоступен
 * @returns Promise с массивом пакетов пополнения
 */
export async function generateDynamicTopUpPackages(fallback = DEFAULT_USD_TO_RUB_RATE): Promise<{ amountRub: number; stars: number }[]> {
  return Promise.all(
    STANDARD_RUB_PACKAGES.map(amount => generateTopUpPackageAsync(amount, fallback))
  )
}
