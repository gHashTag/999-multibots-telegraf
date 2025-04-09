import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  calculateModeCost,
} from '@/price/helpers'
import { getUserInfo } from '@/handlers/getUserInfo'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  'check_balance_scene'
)

checkBalanceScene.enter(async ctx => {
  logger.info({
    message: '💵 Проверка баланса',
    description: 'Entering balance check scene',
    telegram_id: ctx.from?.id,
    mode: ctx.session.mode,
  })

  const isRu = ctx.from?.language_code === 'ru'
  const { telegramId } = getUserInfo(ctx)
  const currentBalance = await getUserBalance(telegramId, ctx.botInfo.username)
  const mode = ctx.session.mode as ModeEnum

  // Нормализуем режим для обратной совместимости
  const normalizedMode = mode

  // Используем единую функцию расчета стоимости
  const costResult = calculateModeCost({ mode })
  const cost = costResult.stars

  // Отправляем сообщение о балансе только если стоимость определена и не равна 0
  if (cost !== 0 && !isNaN(cost)) {
    if (!ctx.from?.id) {
      throw new Error('User ID not found')
    }
    await sendBalanceMessage(
      ctx.from.id.toString(),
      currentBalance,
      cost,
      isRu,
      ctx.telegram
    )
  }

  if (currentBalance < cost) {
    logger.warn({
      message: '⚠️ Недостаточно средств',
      description: 'Insufficient funds',
      telegram_id: ctx.from?.id,
      currentBalance,
      cost,
    })

    await sendInsufficientStarsMessage(ctx, currentBalance, cost)
    return ctx.scene.enter('payment_scene')
  }

  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case ModeEnum.DigitalAvatarBody:
      logger.info({
        message: '🔄 Переход к сцене digital_avatar_body',
        description: 'Switching to digital_avatar_body scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('digital_avatar_body')
    case ModeEnum.DigitalAvatarBodyV2:
      logger.info({
        message: '🔄 Переход к сцене digital_avatar_body_v2',
        description: 'Switching to digital_avatar_body_v2 scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('digital_avatar_body_v2')
    case ModeEnum.NeuroPhoto:
      logger.info({
        message: '🔄 Переход к сцене neuro_photo',
        description: 'Switching to neuro_photo scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('neuro_photo')
    case ModeEnum.NeuroPhotoV2:
      logger.info({
        message: '🔄 Переход к сцене neuroPhotoWizardV2',
        description: 'Switching to neuroPhotoWizardV2 scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('neuro_photo_v2')
    case ModeEnum.ImageToPrompt:
      logger.info({
        message: '🔄 Переход к сцене image_to_prompt',
        description: 'Switching to image_to_prompt scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('image_to_prompt_wizard')
    case ModeEnum.Avatar:
      logger.info({
        message: '🔄 Переход к сцене avatar',
        description: 'Switching to avatar scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('avatar')
    case ModeEnum.ChatWithAvatar:
      logger.info({
        message: '🔄 Переход к сцене chat_with_avatar',
        description: 'Switching to chat_with_avatar scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('chat_with_avatar')
    case ModeEnum.SelectModel:
      logger.info({
        message: '🔄 Переход к сцене select_model',
        description: 'Switching to select_model scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('select_model')
    case ModeEnum.Voice:
      logger.info({
        message: '🔄 Переход к сцене voice',
        description: 'Switching to voice scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('voice')
    case ModeEnum.TextToSpeech:
      logger.info({
        message: '🔄 Переход к сцене text_to_speech',
        description: 'Switching to text_to_speech scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('text_to_speech')
    case ModeEnum.ImageToVideo:
      logger.info({
        message: '🔄 Переход к сцене image_to_video',
        description: 'Switching to image_to_video scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('image_to_video')
    case ModeEnum.TextToVideo:
      logger.info({
        message: '🔄 Переход к сцене text_to_video',
        description: 'Switching to text_to_video scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('text_to_video')
    case ModeEnum.TextToImage:
      logger.info({
        message: '🔄 Переход к сцене text_to_image',
        description: 'Switching to text_to_image scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('text_to_image')
    case ModeEnum.LipSync:
      logger.info({
        message: '🔄 Переход к сцене lip_sync',
        description: 'Switching to lip_sync scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('lip_sync')
    case ModeEnum.SelectModelWizard:
      logger.info({
        message: '🔄 Переход к сцене select_model_wizard',
        description: 'Switching to select_model_wizard scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('select_model_wizard')
    default:
      logger.warn({
        message: '⚠️ Неизвестный режим',
        description: 'Unknown mode in balance check scene',
        mode,
        normalizedMode,
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.leave()
  }
})

export default checkBalanceScene
