import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  calculateModeCost,
  ModeEnum,
} from '@/price/helpers'
import { getUserInfo } from '@/handlers/getUserInfo'
import { logger } from '@/utils/logger'

export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  'checkBalanceScene'
)

checkBalanceScene.enter(async ctx => {
  logger.info('💵 Проверка баланса', {
    description: 'Entering balance check scene',
    telegram_id: ctx.from?.id,
  })

  const isRu = ctx.from?.language_code === 'ru'
  const { userId } = getUserInfo(ctx)
  const currentBalance = await getUserBalance(userId)
  const mode = ctx.session.mode as ModeEnum

  // Используем единую функцию расчета стоимости
  const costResult = calculateModeCost({ mode })
  const cost = costResult.stars

  logger.info('💰 Расчет стоимости операции', {
    description: 'Cost calculation in balance check scene',
    mode,
    cost,
    currentBalance,
    telegram_id: ctx.from?.id,
  })

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
    case ModeEnum.DigitalAvatarBodyV2:
      return ctx.scene.enter(ModeEnum.DigitalAvatarBodyV2)
    case ModeEnum.NeuroPhoto:
      return ctx.scene.enter(ModeEnum.NeuroPhoto)
    case ModeEnum.NeuroPhotoV2:
      return ctx.scene.enter(ModeEnum.NeuroPhotoV2)
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
    default:
      logger.warn('⚠️ Неизвестный режим', {
        description: 'Unknown mode in balance check scene',
        mode,
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.leave()
  }
})
