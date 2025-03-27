import { calculateCost } from './calculateCost'
import { logger } from '@/utils/logger'
// Процент наценки
export const interestRate = 1.5
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

export type CostValue = number | ((steps: number) => number)

// Определяем стоимость для каждого режима
export const modeCosts: Record<
  ModeEnum,
  number | ((param?: any) => number)
> = {
  [ModeEnum.DigitalAvatarBody]: (steps: number) => {
    const cost = calculateCost(steps, 'v1')
    return cost.stars
  },
  [ModeEnum.DigitalAvatarBodyV2]: (steps: number) => {
    const cost = calculateCost(steps, 'v2')
    return cost.stars
  },
  [ModeEnum.NeuroPhoto]: calculateCostInStars(0.08),
  [ModeEnum.NeuroPhotoV2]: calculateCostInStars(0.14),
  [ModeEnum.ImageToPrompt]: calculateCostInStars(0.03),
  [ModeEnum.Avatar]: 0,
  [ModeEnum.ChatWithAvatar]: calculateCostInStars(0),
  [ModeEnum.SelectModel]: calculateCostInStars(0),
  [ModeEnum.Voice]: calculateCostInStars(0.9),
  [ModeEnum.TextToSpeech]: calculateCostInStars(0.12),
  [ModeEnum.ImageToVideo]: calculateCostInStars(0),
  [ModeEnum.TextToVideo]: calculateCostInStars(0),
  [ModeEnum.TextToImage]: calculateCostInStars(0),
  [ModeEnum.LipSync]: calculateCostInStars(0.9),
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
