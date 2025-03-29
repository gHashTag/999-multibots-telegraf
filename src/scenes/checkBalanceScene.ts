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
    await sendInsufficientStarsMessage(ctx, currentBalance, isRu)
    return ctx.scene.leave()
  }

  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case 'digital_avatar_body':
      return ctx.scene.enter('digital_avatar_body')
    case 'digital_avatar_body_2':
      return ctx.scene.enter('digital_avatar_body_v2')
    case 'neuro_photo':
      return ctx.scene.enter('neuro_photo')
    case 'neuro_photo_v2':
      return ctx.scene.enter('neuro_photo_v2')
    case 'image_to_prompt':
      return ctx.scene.enter('image_to_prompt')
    case 'avatar_brain':
      return ctx.scene.enter('avatar')
    case 'chat_with_avatar':
      return ctx.scene.enter('chat_with_avatar')
    case 'select_model':
      return ctx.scene.enter('select_model')
    case 'voice':
      return ctx.scene.enter('voice')
    case 'text_to_speech':
      return ctx.scene.enter('text_to_speech')
    case 'image_to_video':
      return ctx.scene.enter('image_to_video')
    case 'text_to_video':
      return ctx.scene.enter('text_to_video')
    case 'text_to_image':
      return ctx.scene.enter('text_to_image')
    case 'lip_sync':
      return ctx.scene.enter('lip_sync')
    case 'select_model_wizard':
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
