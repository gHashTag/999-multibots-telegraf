import { calculateCost } from '@/price/priceCalculator'
import { starCost, SYSTEM_CONFIG } from '@/price/constants'
import { logger } from '../utils/logger' // Используем локальный логгер модуля
import { ModeEnum } from '../types' // Используем локальный ModeEnum

// Локализуем или импортируем CostCalculationResult
// Если он простой, можно определить здесь или в ../types.ts
export interface DigitalAvatarCostCalculationResult {
  stars: number
  dollars: number
  rubles: number
}

interface DigitalAvatarCostParams {
  mode: ModeEnum.DigitalAvatarBody | ModeEnum.DigitalAvatarBodyV2
  steps: number
  // numImages не используется для DigitalAvatarBody, поэтому убираем
}

export function calculateDigitalAvatarBodyCost(
  params: DigitalAvatarCostParams
): DigitalAvatarCostCalculationResult {
  const { mode, steps } = params

  try {
    let stars = 0

    if (!steps) {
      logger.warn(
        '[DigitalAvatarPricing] Steps not provided for cost calculation',
        { mode }
      )
      // Возвращаем 0 или выбрасываем ошибку, в зависимости от требуемого поведения
      return { stars: 0, dollars: 0, rubles: 0 }
    }

    if (mode === ModeEnum.DigitalAvatarBody) {
      const cost = calculateCost(steps, 'v1')
      stars = cost.stars
    } else if (mode === ModeEnum.DigitalAvatarBodyV2) {
      const cost = calculateCost(steps, 'v2')
      stars = cost.stars
    } else {
      // Это не должно произойти из-за типизации params.mode, но на всякий случай
      logger.error(
        '[DigitalAvatarPricing] Invalid mode provided to calculateDigitalAvatarBodyCost',
        { mode }
      )
      return { stars: 0, dollars: 0, rubles: 0 }
    }

    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    // В оригинальном calculateModeCost SYSTEM_CONFIG.interestRate использовался для рублей.
    // Уточнить, нужен ли здесь interestRate или прямой курс доллара к рублю.
    // Пока использую SYSTEM_CONFIG.interestRate как в оригинале.
    const rubles = parseFloat((dollars * SYSTEM_CONFIG.interestRate).toFixed(2))

    return { stars, dollars, rubles }
  } catch (error) {
    logger.error('[DigitalAvatarPricing] Error during cost calculation', {
      error: error instanceof Error ? error.message : 'Unknown error',
      mode,
      steps,
    })
    // В зависимости от политики обработки ошибок, можно выбросить ошибку дальше
    // или вернуть результат с нулевой стоимостью и индикацией ошибки.
    // Для согласованности с оригиналом, выбрасываем ошибку.
    throw error
  }
}
