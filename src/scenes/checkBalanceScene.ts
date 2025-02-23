import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  calculateCostInStars,
} from '@/price/helpers'
import { getUserInfo } from '@/handlers/getUserInfo'

// Определяем перечисление для режимов
export enum ModeEnum {
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBody2 = 'digital_avatar_body_2',
  NeuroPhoto = 'neuro_photo',
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
  VideoInUrl = 'video_in_url',
  AvatarBrain = 'avatar_brain',
}

// Интерфейс для конверсий
interface ConversionRates {
  costPerStarInDollars: number
  costPerStepInStars: number
  rublesToDollarsRate: number
}

// Определяем конверсии
export const conversionRates: ConversionRates = {
  costPerStarInDollars: 0.016,
  costPerStepInStars: 0.5,
  rublesToDollarsRate: 100,
}
export type CostValue = number | ((steps: number) => number)
// Определяем стоимость для каждого режима
export const modeCosts: Record<ModeEnum, number> = {
  // Установите стоимость как 0 для режимов, где стоимость будет рассчитана на сцене
  [ModeEnum.DigitalAvatarBody]: calculateCostInStars(0),
  [ModeEnum.DigitalAvatarBody2]: calculateCostInStars(0),
  [ModeEnum.NeuroPhoto]: calculateCostInStars(0.08),
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
  [ModeEnum.VideoInUrl]: calculateCostInStars(0.05),
  [ModeEnum.AvatarBrain]: calculateCostInStars(0),
}

// Найдите минимальную и максимальную стоимость среди всех моделей
export const minCost = Math.min(...Object.values(modeCosts))
export const maxCost = Math.max(...Object.values(modeCosts))

export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  'checkBalanceScene'
)

checkBalanceScene.enter(async ctx => {
  console.log('💵 CASE: checkBalanceScene')
  const isRu = ctx.from?.language_code === 'ru'
  const { userId } = getUserInfo(ctx)
  const currentBalance = await getUserBalance(userId)
  const mode = ctx.session.mode as ModeEnum
  const cost = modeCosts[mode] || 0 // Получаем стоимость для текущего режима
  console.log('⭐️ cost:', cost)
  if (cost !== 0) {
    await sendBalanceMessage(ctx, currentBalance, cost, isRu)
  }

  if (currentBalance < cost) {
    await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
    return ctx.scene.leave()
  }

  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case ModeEnum.DigitalAvatarBody:
      return ctx.scene.enter(ModeEnum.DigitalAvatarBody)
    case ModeEnum.DigitalAvatarBody2:
      return ctx.scene.enter(ModeEnum.DigitalAvatarBody2)
    case ModeEnum.NeuroPhoto:
      return ctx.scene.enter(ModeEnum.NeuroPhoto)
    case ModeEnum.ImageToPrompt:
      return ctx.scene.enter(ModeEnum.ImageToPrompt)
    case ModeEnum.Avatar:
      return ctx.scene.enter(ModeEnum.Avatar)
    case ModeEnum.ChatWithAvatar:
      return ctx.scene.enter(ModeEnum.ChatWithAvatar)
    case ModeEnum.SelectModel:
      return ctx.scene.enter(ModeEnum.SelectModel)
    case ModeEnum.Voice:
      return ctx.scene.enter(ModeEnum.Voice)
    case ModeEnum.TextToSpeech:
      return ctx.scene.enter(ModeEnum.TextToSpeech)
    case ModeEnum.ImageToVideo:
      return ctx.scene.enter(ModeEnum.ImageToVideo)
    case ModeEnum.TextToVideo:
      return ctx.scene.enter(ModeEnum.TextToVideo)
    case ModeEnum.TextToImage:
      return ctx.scene.enter(ModeEnum.TextToImage)
    case ModeEnum.LipSync:
      return ctx.scene.enter(ModeEnum.LipSync)
    case ModeEnum.VideoInUrl:
      return ctx.scene.enter(ModeEnum.VideoInUrl)
    case ModeEnum.AvatarBrain:
      return ctx.scene.enter(ModeEnum.AvatarBrain)
    default:
      return ctx.scene.leave()
  }
})
