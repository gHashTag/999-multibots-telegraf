import { calculateCost } from './calculateCost'
import { logger } from '@/utils/logger'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { interestRate } from '../interestRate'
// Процент наценки

// Стоимость звезды
export const starCost = 0.016

export const SYSTEM_CONFIG = {
  starCost,
  interestRate,
  currency: 'RUB',
}

// Функция для расчета стоимости в звездах
export function calculateCostInStars(costInDollars: number): number {
  return costInDollars / starCost
}

// Определяем перечисление для режимов
export enum ModeEnum {
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  ImageToPrompt = 'image_to_prompt',
  Avatar = 'avatar',
  ChatWithAvatar = 'chat_with_avatar',
  SelectModel = 'select_model',
  Voice = 'voice',
  TextToSpeech = 'text_to_speech',
  ImageToVideo = 'image_to_video',
  TextToVideo = 'text_to_video',
  TextToImage = 'text_to_image',
  LipSync = 'lip_sync',
}

// Интерфейс для параметров расчета стоимости
export interface CostCalculationParams {
  mode: ModeEnum | string // Позволяем передавать строку для обратной совместимости
  steps?: number
  numImages?: number
}

// Интерфейс для результата расчета стоимости
export interface CostCalculationResult {
  stars: number
  rubles: number
  dollars: number
}

// Базовые стоимости в долларах
const BASE_COSTS = {
  [ModeEnum.NeuroPhoto]: 0.08,
  [ModeEnum.NeuroPhotoV2]: 0.14,
  neuro_photo_2: 0.14, // Алиас для обратной совместимости
  [ModeEnum.ImageToPrompt]: 0.03,
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: 0,
  [ModeEnum.SelectModel]: 0,
  [ModeEnum.Voice]: 0.9,
  [ModeEnum.TextToSpeech]: 0.12,
  // Берем средние цены из VIDEO_MODELS_CONFIG
  [ModeEnum.ImageToVideo]:
    Object.values(VIDEO_MODELS_CONFIG)
      .filter(model => model.inputType.includes('image'))
      .reduce((acc, model) => acc + model.basePrice, 0) /
    Object.values(VIDEO_MODELS_CONFIG).filter(model =>
      model.inputType.includes('image')
    ).length,
  [ModeEnum.TextToVideo]:
    Object.values(VIDEO_MODELS_CONFIG)
      .filter(model => model.inputType.includes('text'))
      .reduce((acc, model) => acc + model.basePrice, 0) /
    Object.values(VIDEO_MODELS_CONFIG).filter(model =>
      model.inputType.includes('text')
    ).length,
  [ModeEnum.TextToImage]: 0.08,
  [ModeEnum.LipSync]: 0.9,
}

// Единая функция для расчета стоимости
export function calculateModeCost(
  params: CostCalculationParams
): CostCalculationResult {
  const { mode, steps, numImages = 1 } = params
  let stars = 0

  // Логируем входные параметры
  logger.info({
    message: '💰 Расчет стоимости операции',
    description: 'Calculating operation cost',
    mode,
    steps,
    numImages,
  })

  try {
    // Для режимов с тренировкой модели
    if (mode === ModeEnum.DigitalAvatarBody && steps) {
      const cost = calculateCost(steps, 'v1')
      stars = cost.stars
    } else if (mode === ModeEnum.DigitalAvatarBodyV2 && steps) {
      const cost = calculateCost(steps, 'v2')
      stars = cost.stars
    } else {
      // Обработка алиасов режимов для обратной совместимости
      let normalizedMode = mode
      if (mode === 'neuro_photo_2') {
        normalizedMode = ModeEnum.NeuroPhotoV2
        logger.info({
          message: '🔄 Использован алиас режима',
          description: 'Mode alias used',
          originalMode: mode,
          normalizedMode,
        })
      }

      // Получаем базовую стоимость для режима
      const baseCostInDollars = BASE_COSTS[normalizedMode as string]

      if (baseCostInDollars === undefined) {
        logger.error({
          message: '❌ Неизвестный режим',
          description: 'Unknown mode in cost calculation',
          mode,
          normalizedMode,
        })
        // Возвращаем нулевую стоимость для неизвестных режимов
        stars = 0
      } else {
        stars = (baseCostInDollars / starCost) * numImages
      }
    }

    // Округляем до 2 знаков после запятой
    stars = parseFloat(stars.toFixed(2))
    const dollars = parseFloat((stars * starCost).toFixed(2))
    const rubles = parseFloat((dollars * interestRate).toFixed(2))

    logger.info({
      message: '✅ Стоимость рассчитана',
      description: 'Cost calculation completed',
      mode,
      stars,
      dollars,
      rubles,
    })

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

// Для обратной совместимости
export const modeCosts: Record<string, number | ((param?: any) => number)> = {
  [ModeEnum.DigitalAvatarBody]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBody, steps }).stars,
  [ModeEnum.DigitalAvatarBodyV2]: (steps: number) =>
    calculateModeCost({ mode: ModeEnum.DigitalAvatarBodyV2, steps }).stars,
  [ModeEnum.NeuroPhoto]: calculateModeCost({ mode: ModeEnum.NeuroPhoto }).stars,
  [ModeEnum.NeuroPhotoV2]: calculateModeCost({ mode: ModeEnum.NeuroPhotoV2 })
    .stars,
  neuro_photo_2: calculateModeCost({ mode: 'neuro_photo_2' }).stars, // Алиас для обратной совместимости
  [ModeEnum.ImageToPrompt]: calculateModeCost({ mode: ModeEnum.ImageToPrompt })
    .stars,
  [ModeEnum.Avatar]: calculateModeCost({ mode: ModeEnum.Avatar }).stars,
  [ModeEnum.ChatWithAvatar]: calculateModeCost({
    mode: ModeEnum.ChatWithAvatar,
  }).stars,
  [ModeEnum.SelectModel]: calculateModeCost({ mode: ModeEnum.SelectModel })
    .stars,
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
