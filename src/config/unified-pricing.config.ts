/**
 * 🕉️ ЕДИНАЯ КОНФИГУРАЦИЯ ЦЕНООБРАЗОВАНИЯ
 *
 * КРИТИЧЕСКИ ВАЖНО: Это ЕДИНСТВЕННОЕ место определения цен в системе!
 * Все расчёты должны использовать эти константы.
 */

import { z } from 'zod'
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
export async function getUsdToRubRate(
  fallback = DEFAULT_USD_TO_RUB_RATE
): Promise<number> {
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
  'veo3': {
    pricePerSecondUSD: 0.4,
    supportedDurations: [2, 4, 6, 8],
    defaultDuration: 8,
  },
  'veo3_fast': {
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
  // Видео модели - АКТУАЛЬНЫЕ ЦЕНЫ Kie.ai (2025)
  'veo3_fast': {
    pricePerSecondUSD: 0.05, // ✅ ИСПРАВЛЕНО: $0.40 / 8 сек = $0.05/сек → 37⭐ за 8 сек
    supportedDurations: [8], // VEO FAST поддерживает только 8 секунд
    defaultDuration: 8,
    maxDuration: 8,
  },
  'veo3': {
    pricePerSecondUSD: 0.25, // ✅ ИСПРАВЛЕНО: $2.00 / 8 сек = $0.25/сек → 187⭐ за 8 сек
    supportedDurations: [2, 4, 6, 8, 10],
    defaultDuration: 8,
    maxDuration: 10,
  },
  'runway-aleph': {
    pricePerSecondUSD: 0.485, // 182⭐ за 6 сек = $2.912 за 6 сек = $0.485/сек (конкурентно с +8.1% наценкой)
    supportedDurations: [2, 4, 6, 8, 10],
    defaultDuration: 6,
    maxDuration: 10,
  },

  // OpenAI Sora 2 модели через Kie.ai
  'sora-2': {
    pricePerSecondUSD: 0.015, // $0.15 за 10 сек = 94⭐ за 10 сек (Kie.ai pricing)
    supportedDurations: [10],
    defaultDuration: 10,
    maxDuration: 10,
  },
  'sora-2-pro': {
    pricePerSecondUSD: 0.045, // $0.45 за 10 сек standard = 28⭐ за 10 сек (Kie.ai pricing)
    supportedDurations: [10, 15],
    defaultDuration: 10,
    maxDuration: 15,
  },

  // Sora 2 Image-to-Video (те же цены что и text-to-video)
  'sora-2-i2v': {
    pricePerSecondUSD: 0.015, // $0.15 за 10 сек = 9⭐ за 10 сек (Kie.ai pricing)
    supportedDurations: [10],
    defaultDuration: 10,
    maxDuration: 10,
  },
  'sora-2-pro-i2v': {
    pricePerSecondUSD: 0.045, // $0.45 за 10 сек standard = 28⭐ за 10 сек (Kie.ai pricing)
    supportedDurations: [10, 15],
    defaultDuration: 10,
    maxDuration: 15,
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
      modelId === 'veo3_fast' ||
      modelId === 'veo3' ||
      modelId === 'runway-aleph' ||
      modelId === 'sora-2' ||
      modelId === 'sora-2-pro' ||
      modelId === 'sora-2-i2v' ||
      modelId === 'sora-2-pro-i2v'
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
// ZOD СХЕМЫ ВАЛИДАЦИИ
// ============================================

/**
 * Схема для модели Kie.ai
 */
export const KieAiModelPriceSchema = z.object({
  pricePerSecondUSD: z.number().positive().optional(),
  pricePerImageUSD: z.number().positive().optional(),
  priceBaseUSD: z.number().positive().optional(),
  maxDuration: z.number().positive().optional(),
  supportedDurations: z.array(z.number().positive()).optional(),
  defaultDuration: z.number().positive().optional(),
}).refine(
  (data) => data.pricePerSecondUSD || data.pricePerImageUSD || data.priceBaseUSD,
  { message: 'At least one pricing field must be defined' }
)

/**
 * Схема для динамической видео-модели
 */
export const DynamicVideoPriceSchema = z.object({
  pricePerSecondUSD: z.number().positive(),
  supportedDurations: z.array(z.number().positive()),
  defaultDuration: z.number().positive(),
})

/**
 * Валидация конфигурации Kie.ai моделей
 */
export function validateKieAiPricing(): void {
  Object.entries(KIE_AI_MODELS_PRICING).forEach(([modelId, config]) => {
    try {
      KieAiModelPriceSchema.parse(config)
    } catch (error) {
      throw new Error(`Invalid Kie.ai pricing config for model "${modelId}": ${error}`)
    }
  })
}

/**
 * Валидация конфигурации VEO моделей
 */
export function validateVeoPricing(): void {
  Object.entries(VEO_MODELS_PRICING).forEach(([modelId, config]) => {
    try {
      DynamicVideoPriceSchema.parse(config)
    } catch (error) {
      throw new Error(`Invalid VEO pricing config for model "${modelId}": ${error}`)
    }
  })
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

// Валидируем конфигурации моделей
try {
  validateKieAiPricing()
  validateVeoPricing()
  console.log('✅ Pricing configuration validated successfully')
} catch (error) {
  console.error('❌ Pricing configuration validation failed:', error)
  throw error
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
