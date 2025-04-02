import { Scenes } from 'telegraf'
import { MyContext, Mode } from '@/interfaces'
import { getUserBalance } from '@/core/supabase'
import {
  sendInsufficientStarsMessage,
  sendBalanceMessage,
  calculateModeCost,
} from '@/price/helpers'
import { getUserInfo } from '@/handlers/getUserInfo'
import { logger } from '@/utils/logger'

export const checkBalanceScene = new Scenes.BaseScene<MyContext>(
  'checkBalanceScene'
)

checkBalanceScene.enter(async ctx => {
  logger.info({
    message: '💵 Проверка баланса',
    description: 'Entering balance check scene',
    telegram_id: ctx.from?.id,
    mode: ctx.session.mode,
  })

  const isRu = ctx.from?.language_code === 'ru'
  const { userId } = getUserInfo(ctx)
  const currentBalance = await getUserBalance(userId)
  const mode = ctx.session.mode as Mode

  // Нормализуем режим для обратной совместимости
  const normalizedMode = mode

  // Используем единую функцию расчета стоимости
  const costResult = calculateModeCost({ mode })
  const cost = costResult.stars

  logger.info({
    message: '💰 Расчет стоимости операции',
    description: 'Cost calculation in balance check scene',
    mode,
    cost,
    currentBalance,
    telegram_id: ctx.from?.id,
  })

  // Отправляем сообщение о балансе только если стоимость определена и не равна 0
  if (cost !== 0 && !isNaN(cost)) {
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
    await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
    return ctx.scene.leave()
  }

  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case 'digital_avatar_body':
      logger.info({
        message: '🔄 Переход к сцене digital_avatar_body',
        description: 'Switching to digital_avatar_body scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('digital_avatar_body')
    case 'digital_avatar_body_2':
      logger.info({
        message: '🔄 Переход к сцене digital_avatar_body_v2',
        description: 'Switching to digital_avatar_body_v2 scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('digital_avatar_body_v2')
    case 'neuro_photo':
      logger.info({
        message: '🔄 Переход к сцене neuro_photo',
        description: 'Switching to neuro_photo scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('neuro_photo')
    case 'neuro_photo_v2':
      logger.info({
        message: '🔄 Переход к сцене neuro_photo_v2',
        description: 'Switching to neuro_photo_v2 scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('neuro_photo_v2')
    case 'image_to_prompt':
      logger.info({
        message: '🔄 Переход к сцене image_to_prompt',
        description: 'Switching to image_to_prompt scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('image_to_prompt')
    case 'avatar_brain':
      logger.info({
        message: '🔄 Переход к сцене avatar',
        description: 'Switching to avatar scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('avatar')
    case 'chat_with_avatar':
      logger.info({
        message: '🔄 Переход к сцене chat_with_avatar',
        description: 'Switching to chat_with_avatar scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('chat_with_avatar')
    case 'select_model':
      logger.info({
        message: '🔄 Переход к сцене select_model',
        description: 'Switching to select_model scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('select_model')
    case 'voice':
      logger.info({
        message: '🔄 Переход к сцене voice',
        description: 'Switching to voice scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('voice')
    case 'text_to_speech':
      logger.info({
        message: '🔄 Переход к сцене text_to_speech',
        description: 'Switching to text_to_speech scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('text_to_speech')
    case 'image_to_video':
      logger.info({
        message: '🔄 Переход к сцене image_to_video',
        description: 'Switching to image_to_video scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('image_to_video')
    case 'text_to_video':
      logger.info({
        message: '🔄 Переход к сцене text_to_video',
        description: 'Switching to text_to_video scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('text_to_video')
    case 'text_to_image':
      logger.info({
        message: '🔄 Переход к сцене text_to_image',
        description: 'Switching to text_to_image scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('text_to_image')
    case 'lip_sync':
      logger.info({
        message: '🔄 Переход к сцене lip_sync',
        description: 'Switching to lip_sync scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('lip_sync')
    case 'select_model_wizard':
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
