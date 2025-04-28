import { ModeEnum } from '@/interfaces/modes'
import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'

import { logger } from '@/utils/logger'

// Экспортируем примитивные значения
export const starCost = 0.016
export const interestRate = 1.5

// Теперь создаем объект конфигурации на основе этих значений
export const SYSTEM_CONFIG = {
  starCost: starCost,
  interestRate: interestRate,
  currency: 'RUB',
}

interface ConversionRates {
  costPerStarInDollars: number
  costPerStepInStars: number
  rublesToDollarsRate: number
}

// Определяем конверсии
export const conversionRates: ConversionRates = {
  costPerStepInStars: 0.25,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: 100,
}

export const conversionRatesV2: ConversionRates = {
  costPerStepInStars: 2.1,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: 100,
}

export function calculateCostInStars(
  steps: number,
  rates: { costPerStepInStars: number }
): number {
  const totalCostInStars = steps * rates.costPerStepInStars
  return parseFloat(totalCostInStars.toFixed(2))
}

export function calculateCostInDollars(
  steps: number,
  rates: { costPerStepInStars: number; costPerStarInDollars: number }
): number {
  const totalCostInDollars =
    steps * rates.costPerStepInStars * rates.costPerStarInDollars
  return parseFloat(totalCostInDollars.toFixed(2))
}

export function calculateCostInRubles(
  steps: number,
  rates: {
    costPerStepInStars: number
    costPerStarInDollars: number
    rublesToDollarsRate: number
  }
): number {
  const totalCostInRubles =
    steps *
    rates.costPerStepInStars *
    rates.costPerStarInDollars *
    rates.rublesToDollarsRate
  return parseFloat(totalCostInRubles.toFixed(2))
}

export const stepOptions = {
  v1: [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000],
  v2: [100, 200, 300, 400, 500, 600, 700, 800, 1000],
}

export const costDetails = {
  v1: stepOptions.v1.map(steps => calculateCost(steps, 'v1')),
  v2: stepOptions.v2.map(steps => calculateCost(steps, 'v2')),
}

export interface CostDetails {
  steps: number
  stars: number
  rubles: number
  dollars: number
}

export function calculateCost(
  steps: number,
  version: 'v1' | 'v2' = 'v1'
): CostDetails {
  const rates = version === 'v1' ? conversionRates : conversionRatesV2
  const baseCost = steps * rates.costPerStepInStars

  return {
    steps,
    stars: baseCost,
    dollars: baseCost * rates.costPerStarInDollars,
    rubles: baseCost * rates.costPerStarInDollars * rates.rublesToDollarsRate,
  }
}

// НОВАЯ ФУНКЦИЯ: Расчет конечной стоимости в звездах из базовой в долларах
function calculateFinalStarCostFromDollars(baseDollarCost: number): number {
  // Предполагаем, что interestRate - это множитель наценки (например, 1.2 для 20%)
  // Если interestRate - это процент (например, 20), то формула будет (baseDollarCost / starCost) * (1 + SYSTEM_CONFIG.interestRate / 100)
  // Используем текущую логику расчета рублей как пример: умножаем на interestRate
  const finalCost = (baseDollarCost / starCost) * SYSTEM_CONFIG.interestRate
  return parseFloat(finalCost.toFixed(2))
}

export const BASE_COSTS: Partial<Record<ModeEnum, CostValue>> = {
  [ModeEnum.DigitalAvatarBody]: (steps: number) => {
    const cost = calculateCost(steps, 'v1')
    return cost.stars
  },
  [ModeEnum.DigitalAvatarBodyV2]: (steps: number) => {
    const cost = calculateCost(steps, 'v2')
    return cost.stars
  },
  [ModeEnum.NeuroPhoto]: calculateFinalStarCostFromDollars(0.08),
  [ModeEnum.NeuroPhotoV2]: calculateFinalStarCostFromDollars(0.14),
  [ModeEnum.NeuroAudio]: calculateFinalStarCostFromDollars(0.12),
  [ModeEnum.ImageToPrompt]: calculateFinalStarCostFromDollars(0.03),
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.SelectAiTextModel]: 0,
  [ModeEnum.Voice]: calculateFinalStarCostFromDollars(0.9),
  [ModeEnum.TextToSpeech]: calculateFinalStarCostFromDollars(0.12),
  [ModeEnum.ImageToVideo]: 0,
  [ModeEnum.TextToVideo]: 0,
  [ModeEnum.TextToImage]: 0,
  [ModeEnum.LipSync]: calculateFinalStarCostFromDollars(0.9),
  [ModeEnum.VoiceToText]: calculateFinalStarCostFromDollars(0.08),
}
export interface CostCalculationParams {
  mode: ModeEnum | string
  steps?: number
  numImages?: number
  modelId?: string
}

export interface CostCalculationResult {
  stars: number
  rubles: number
  dollars: number
}

export type CostValue = number | ((steps: number) => number)
// Определяем стоимость для каждого режима

export function calculateModeCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { mode, steps = 0, numImages = 1 } = params

  try {
    let stars = 0

    let normalizedMode = mode
    if (mode === ModeEnum.NeuroPhotoV2) {
      normalizedMode = ModeEnum.NeuroPhotoV2
      logger.info({
        message: '🔄 Использован алиас режима',
        description: 'Mode alias used',
        originalMode: mode,
        normalizedMode,
      })
    }

    const costValue = BASE_COSTS[normalizedMode as keyof typeof BASE_COSTS]

    if (costValue === undefined) {
      logger.error({
        message: '❌ Неизвестный режим или стоимость не определена',
        description: 'Unknown mode or cost not defined in BASE_COSTS',
        mode,
        normalizedMode,
      })
      stars = 0
    } else {
      let numericCostValue: number
      if (typeof costValue === 'function') {
        if (steps === undefined || steps === null) {
          logger.error({
            message:
              '❌ Не передано количество шагов для режима с функцией стоимости',
            description: 'Steps parameter is missing for function-based cost',
            mode,
            normalizedMode,
          })
          numericCostValue = 0
        } else {
          numericCostValue = costValue(steps)
        }
      } else {
        numericCostValue = costValue
      }

      if (
        (normalizedMode === ModeEnum.DigitalAvatarBody ||
          normalizedMode === ModeEnum.DigitalAvatarBodyV2) &&
        steps
      ) {
        stars = numericCostValue * numImages
      } else {
        stars = numericCostValue * numImages
      }
    }

    // Дополнительные переопределения стоимости, если нужны
    if (mode === ModeEnum.VoiceToText) {
      stars = 5
    }

    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    const rubles = parseFloat((dollars * SYSTEM_CONFIG.interestRate).toFixed(2))

    return { stars, dollars, rubles }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при расчете стоимости',
      description: 'Error during cost calculation',
      error: error instanceof Error ? error.message : 'Unknown error',
      mode,
      steps,
      numImages,
    })
    throw error
  }
}

export const modeCosts: Record<ModeEnum, CostValue> = {
  [ModeEnum.DigitalAvatarBody]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBody, steps }).stars,
  [ModeEnum.DigitalAvatarBodyV2]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBodyV2, steps }).stars,
  [ModeEnum.NeuroPhoto]: calculateModeCost({ mode: ModeEnum.NeuroPhoto }).stars,
  [ModeEnum.NeuroPhotoV2]: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 })
    .stars,
  [ModeEnum.NeuroAudio]: calculateModeCost({ mode: ModeEnum.NeuroAudio }).stars,
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt })
    .stars,
  [ModeEnum.Avatar]: calculateModeCost({ mode: ModeEnum.Avatar }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({
    mode: ModeEnum.ChatWithAvatar,
  }).stars,
  [ModeEnum.SelectModel]: calculateModeCost({ mode: ModeEnum.SelectModel })
    .stars,
  [ModeEnum.SelectAiTextModel]: calculateModeCost({
    mode: ModeEnum.SelectAiTextModel,
  }).stars,
  [ModeEnum.Voice]: calculateModeCost({ mode: ModeEnum.Voice }).stars,
  [ModeEnum.TextToSpeech]: calculateModeCost({ mode: ModeEnum.TextToSpeech })
    .stars,
  [ModeEnum.ImageToVideo]: calculateModeCost({ mode: ModeEnum.ImageToVideo })
    .stars,
  [ModeEnum.TextToVideo]: calculateModeCost({ mode: ModeEnum.TextToVideo })
    .stars,
  [ModeEnum.TextToImage]: calculateModeCost({ mode: ModeEnum.TextToImage })
    .stars,
  [ModeEnum.LipSync]: calculateModeCost({ mode: ModeEnum.LipSync }).stars,
  [ModeEnum.VoiceToText]: calculateModeCost({ mode: ModeEnum.VoiceToText })
    .stars,
  [ModeEnum.Subscribe]: 0,
  [ModeEnum.SelectModelWizard]: 0,
  [ModeEnum.SelectNeuroPhoto]: 0,
  [ModeEnum.ChangeSize]: 0,
  [ModeEnum.Invite]: 0,
  [ModeEnum.HelpScene]: 0,
  [ModeEnum.MainMenu]: 0,
  [ModeEnum.Balance]: 0,
  [ModeEnum.ImprovePrompt]: 0,
  [ModeEnum.TopUpBalance]: 0,
  [ModeEnum.VideoInUrl]: 0,
  [ModeEnum.Support]: 0,
  [ModeEnum.Stats]: 0,
  [ModeEnum.BroadcastWizard]: 0,
  [ModeEnum.SubscriptionCheckScene]: 0,
  [ModeEnum.ImprovePromptWizard]: 0,
  [ModeEnum.SizeWizard]: 0,
  [ModeEnum.PaymentScene]: 0,
  [ModeEnum.InviteScene]: 0,
  [ModeEnum.BalanceScene]: 0,
  [ModeEnum.Step0]: 0,
  [ModeEnum.NeuroCoderScene]: 0,
  [ModeEnum.CheckBalanceScene]: 0,
  [ModeEnum.CancelPredictionsWizard]: 0,
  [ModeEnum.EmailWizard]: 0,
  [ModeEnum.GetRuBillWizard]: 0,
  [ModeEnum.SubscriptionScene]: 0,
  [ModeEnum.CreateUserScene]: 0,
  [ModeEnum.StartScene]: 0,
  [ModeEnum.Price]: 0,
  [ModeEnum.RublePaymentScene]: 0,
  [ModeEnum.StarPaymentScene]: 0,
  [ModeEnum.MenuScene]: 0,
}
// Найдите минимальную и максимальную стоимость среди всех моделей
export const minCost = Math.min(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost(1) : cost
  )
)
export const maxCost = Math.max(
  ...Object.values(modeCosts).map(cost =>
    typeof cost === 'function' ? cost(1) : cost
  )
)
export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.CheckBalanceScene
)

// Функция для получения числового значения стоимости
export function getCostValue(cost: number | ((param?: any) => number)): number {
  return typeof cost === 'function' ? cost(1) : cost
}
