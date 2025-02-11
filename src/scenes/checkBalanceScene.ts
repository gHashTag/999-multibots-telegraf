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
  NeuroPhoto = 'neuro_photo',
  ImageToPrompt = 'image_to_prompt',
  ImageToVideo = 'image_to_video',
  TextToVideo = 'text_to_video',
  Speech = 'speech',
  TextToSpeech = 'text_to_speech',
  TextToImage = 'text_to_image',
  Voice = 'voice',
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

// Определяем стоимость для каждого режима
export const modeCosts: Record<ModeEnum, number> = {
  [ModeEnum.NeuroPhoto]: calculateCostInStars(0.12),
  [ModeEnum.ImageToPrompt]: calculateCostInStars(0.03),
  [ModeEnum.ImageToVideo]: calculateCostInStars(0.99),
  [ModeEnum.TextToVideo]: calculateCostInStars(0.99),
  [ModeEnum.Speech]: calculateCostInStars(0.12),
  [ModeEnum.TextToSpeech]: calculateCostInStars(0.12),
  [ModeEnum.TextToImage]: calculateCostInStars(0.048),
  [ModeEnum.Voice]: calculateCostInStars(0.12),
}

// Найдите минимальную и максимальную стоимость среди всех моделей
export const minCost = Math.min(...Object.values(modeCosts))
export const maxCost = Math.max(...Object.values(modeCosts))
export const promptGenerationCost = modeCosts[ModeEnum.ImageToPrompt]
export const imageNeuroGenerationCost = modeCosts[ModeEnum.NeuroPhoto]
export const textToVideoCost = modeCosts[ModeEnum.TextToVideo]
export const speechGenerationCost = modeCosts[ModeEnum.Speech]
export const textToSpeechCost = modeCosts[ModeEnum.TextToSpeech]
export const imageToVideoCost = modeCosts[ModeEnum.ImageToVideo]

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

  await sendBalanceMessage(ctx, currentBalance, cost, isRu)

  if (currentBalance < cost) {
    await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
    return ctx.scene.leave()
  }

  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case ModeEnum.NeuroPhoto:
      return ctx.scene.enter('neuroPhotoWizard')
    case ModeEnum.TextToImage:
      return ctx.scene.enter('textToImageWizard')
    case ModeEnum.Voice:
      return ctx.scene.enter('voiceAvatarWizard')
    case ModeEnum.TextToVideo:
      return ctx.scene.enter('textToVideoWizard')
    case ModeEnum.ImageToVideo:
      return ctx.scene.enter('imageToVideoWizard')
    case ModeEnum.ImageToPrompt:
      return ctx.scene.enter('imageToPromptWizard')
    case ModeEnum.Speech:
      return ctx.scene.enter('speechWizard')
    case ModeEnum.TextToSpeech:
      return ctx.scene.enter('textToSpeechWizard')
    default:
      return ctx.scene.leave()
  }
})
