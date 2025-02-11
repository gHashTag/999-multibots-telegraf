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
enum Mode {
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
const modeCosts: Record<Mode, number> = {
  [Mode.NeuroPhoto]: calculateCostInStars(0.12),
  [Mode.ImageToPrompt]: calculateCostInStars(0.03),
  [Mode.ImageToVideo]: calculateCostInStars(0.99),
  [Mode.TextToVideo]: calculateCostInStars(0.99),
  [Mode.Speech]: calculateCostInStars(0.12),
  [Mode.TextToSpeech]: calculateCostInStars(0.12),
  [Mode.TextToImage]: calculateCostInStars(0.048),
  [Mode.Voice]: calculateCostInStars(0.12),
}

export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  'checkBalanceScene'
)

checkBalanceScene.enter(async ctx => {
  console.log('💵 CASE: checkBalanceScene')
  const isRu = ctx.from?.language_code === 'ru'
  const { userId } = getUserInfo(ctx)
  const currentBalance = await getUserBalance(userId)
  const mode = ctx.session.mode as Mode
  const cost = modeCosts[mode] || 0 // Получаем стоимость для текущего режима
  console.log('⭐️ cost:', cost)

  await sendBalanceMessage(ctx, currentBalance, cost, isRu)

  if (currentBalance < cost) {
    await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
    return ctx.scene.leave()
  }

  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case Mode.NeuroPhoto:
      return ctx.scene.enter('neuroPhotoWizard')
    case Mode.TextToImage:
      return ctx.scene.enter('textToImageWizard')
    case Mode.Voice:
      return ctx.scene.enter('voiceAvatarWizard')
    // Добавьте другие случаи для других режимов
    default:
      return ctx.scene.leave()
  }
})
