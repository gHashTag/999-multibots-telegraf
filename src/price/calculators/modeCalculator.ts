import { logger } from '@/utils/logger'
import { ModeEnum } from '../helpers/modelsCost'
import { PricingStrategy } from '../types/strategies'
import { CostCalculationParams, CostCalculationResult } from '../types/common'
import { MODE_PRICING_STRATEGY } from '../constants/pricingStrategies'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { calculateCost } from '../helpers/calculateCost'
import { starCost, BASE_COSTS, interestRate } from '../helpers/modelsCost'

/**
 * Рассчитывает стоимость для фиксированной стратегии ценообразования
 */
function calculateFixedCost(
  mode: ModeEnum | string,
  numImages: number = 1
): CostCalculationResult {
  const normalizedMode = mode as ModeEnum
  const baseCostInDollars = BASE_COSTS[normalizedMode]

  if (baseCostInDollars === undefined) {
    logger.error({
      message: '❌ Неизвестный режим для фиксированной стоимости',
      description: 'Unknown mode for fixed cost calculation',
      mode,
    })
    return { stars: 0, dollars: 0, rubles: 0 }
  }

  const stars = (baseCostInDollars / starCost) * numImages
  const roundedStars = parseFloat(stars.toFixed(2))
  const dollars = parseFloat((roundedStars * starCost).toFixed(2))
  const rubles = parseFloat((dollars * interestRate).toFixed(2))

  return { stars: roundedStars, dollars, rubles }
}

/**
 * Рассчитывает стоимость для стратегии, основанной на выбранной модели
 */
function calculateModelBasedCost(
  mode: ModeEnum | string,
  modelId: string,
  numImages: number = 1
): CostCalculationResult {
  // Получаем конфигурацию модели
  const modelConfig = VIDEO_MODELS_CONFIG[modelId]

  if (!modelConfig) {
    logger.error({
      message: '❌ Неизвестная модель',
      description: 'Unknown model for cost calculation',
      mode,
      modelId,
    })
    return { stars: 0, dollars: 0, rubles: 0 }
  }

  // Базовая стоимость из конфигурации модели
  const baseCostInDollars = modelConfig.basePrice
  const stars = (baseCostInDollars / starCost) * numImages
  const roundedStars = parseFloat(stars.toFixed(2))
  const dollars = parseFloat((roundedStars * starCost).toFixed(2))
  const rubles = parseFloat((dollars * interestRate).toFixed(2))

  return { stars: roundedStars, dollars, rubles }
}

/**
 * Рассчитывает стоимость для стратегии, основанной на количестве шагов
 */
function calculateStepBasedCost(
  mode: ModeEnum | string,
  steps: number
): CostCalculationResult {
  const normalizedMode = mode as ModeEnum
  // Определяем версию на основе режима
  const version = normalizedMode === ModeEnum.DigitalAvatarBodyV2 ? 'v2' : 'v1'

  return calculateCost(steps, version)
}

/**
 * Универсальная функция для расчета стоимости в зависимости от режима
 */
export function calculateModeCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { mode, steps, numImages = 1, modelId } = params

  try {
    // Определяем стратегию ценообразования для режима
    const pricingStrategy = MODE_PRICING_STRATEGY[mode as ModeEnum]

    if (!pricingStrategy) {
      logger.error({
        message: '❌ Неизвестная стратегия ценообразования',
        description: 'Unknown pricing strategy',
        mode,
      })
      return { stars: 0, dollars: 0, rubles: 0 }
    }

    // Расчет на основе стратегии
    switch (pricingStrategy) {
      case PricingStrategy.FREE:
        // Бесплатный режим
        return { stars: 0, dollars: 0, rubles: 0 }

      case PricingStrategy.FIXED:
        // Фиксированная стоимость
        return calculateFixedCost(mode, numImages)

      case PricingStrategy.MODEL_BASED:
        // Стоимость зависит от модели
        if (!modelId) {
          throw new Error(`Для режима ${mode} требуется указать modelId`)
        }
        return calculateModelBasedCost(mode, modelId, numImages)

      case PricingStrategy.STEP_BASED:
        // Стоимость зависит от количества шагов
        if (!steps) {
          throw new Error(
            `Для режима ${mode} требуется указать количество шагов`
          )
        }
        return calculateStepBasedCost(mode, steps)

      default:
        logger.error({
          message: '❌ Неподдерживаемая стратегия ценообразования',
          description: 'Unsupported pricing strategy',
          mode,
          strategy: pricingStrategy,
        })
        return { stars: 0, dollars: 0, rubles: 0 }
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при расчете стоимости',
      description: 'Error during cost calculation',
      error: error instanceof Error ? error.message : 'Unknown error',
      mode,
      steps,
      numImages,
      modelId,
    })
    throw error
  }
}
