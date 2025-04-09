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
  logger.info('💵 Проверка баланса', {
    description: 'Entering balance check scene',
    telegram_id: ctx.from?.id,
    mode: ctx.session.mode,
    selected_model: ctx.session.selected_model,
    current_scene: ctx.scene.current?.id,
    full_session_state: {
      mode: ctx.session?.mode,
      selectedModel: ctx.session?.selected_model,
      targetScene: ctx.session?.targetScene,
      memory: ctx.session?.memory,
      email: ctx.session?.email,
      prompt: ctx.session?.prompt,
      selectedSize: ctx.session?.selectedSize,
      userModel: ctx.session?.userModel,
      numImages: ctx.session?.numImages,
      attempts: ctx.session?.attempts,
      videoModel: ctx.session?.videoModel,
      imageUrl: ctx.session?.imageUrl,
      videoUrl: ctx.session?.videoUrl,
      audioUrl: ctx.session?.audioUrl,
      amount: ctx.session?.amount,
      subscription: ctx.session?.subscription,
    },
  })

  const isRu = ctx.from?.language_code === 'ru'
  const { telegramId } = getUserInfo(ctx)
  const currentBalance = await getUserBalance(telegramId, ctx.botInfo.username)
  const mode = ctx.session.mode as ModeEnum

  logger.info('🔍 Состояние перед проверкой баланса:', {
    description: 'State before balance check',
    telegram_id: ctx.from?.id,
    mode: mode,
    selected_model: ctx.session.selected_model,
    current_balance: currentBalance,
    session_trace: {
      previous_mode: ctx.session?.mode,
      previous_model: ctx.session?.selected_model,
      previous_scene: ctx.scene?.current?.id,
      target_scene: ctx.session?.targetScene,
    },
  })

  // Нормализуем режим для обратной совместимости
  const normalizedMode = mode

  logger.info('💰 Расчет стоимости операции', {
    description: 'Calculating operation cost',
    telegram_id: ctx.from?.id,
    mode: mode,
    normalized_mode: normalizedMode,
    action: 'calculate_cost',
  })

  // Используем единую функцию расчета стоимости
  const costResult = calculateModeCost({ mode })
  const cost = costResult.stars

  logger.info('💰 Результат расчета стоимости', {
    description: 'Cost calculation result',
    telegram_id: ctx.from?.id,
    mode: mode,
    cost: cost,
    current_balance: currentBalance,
    action: 'cost_calculated',
  })

  // Отправляем сообщение о балансе только если стоимость определена и не равна 0
  if (cost !== 0 && !isNaN(cost)) {
    if (!ctx.from?.id) {
      logger.error('❌ Отсутствует ID пользователя', {
        description: 'User ID not found',
        telegram_id: ctx.from?.id,
        action: 'user_id_missing',
      })
      throw new Error('User ID not found')
    }

    logger.info('💬 Отправка сообщения о балансе', {
      description: 'Sending balance message',
      telegram_id: ctx.from?.id,
      current_balance: currentBalance,
      cost: cost,
      action: 'send_balance_message',
    })

    await sendBalanceMessage(
      ctx.from.id.toString(),
      currentBalance,
      cost,
      isRu,
      ctx.telegram
    )
  }

  if (currentBalance < cost) {
    logger.warn('⚠️ Недостаточно средств', {
      description: 'Insufficient funds',
      telegram_id: ctx.from?.id,
      current_balance: currentBalance,
      cost: cost,
      session_state: {
        mode: ctx.session?.mode,
        selectedModel: ctx.session?.selected_model,
        targetScene: ctx.session?.targetScene,
      },
    })

    await sendInsufficientStarsMessage(ctx, currentBalance, cost)

    logger.info('🔄 Переход к сцене оплаты', {
      description: 'Switching to payment scene',
      telegram_id: ctx.from?.id,
      action: 'enter_payment_scene',
    })

    return ctx.scene.enter('payment_scene')
  }

  // Переход к соответствующей сцене в зависимости от режима
  logger.info('🔄 Определение следующей сцены', {
    description: 'Determining next scene',
    telegram_id: ctx.from?.id,
    current_mode: mode,
    session_state: {
      mode: ctx.session?.mode,
      selectedModel: ctx.session?.selected_model,
      targetScene: ctx.session?.targetScene,
    },
  })

  // Переход к соответствующей сцене в зависимости от режима
  switch (mode) {
    case ModeEnum.SelectModel:
      logger.info('✅ Проверка баланса завершена', {
        description: 'Balance check completed',
        telegram_id: ctx.from?.id,
        previous_mode: mode,
        selected_model: ctx.session.selected_model,
        action: 'balance_check_completed',
      })
      return ctx.scene.leave()
    case ModeEnum.DigitalAvatarBody:
      logger.info('🔄 Переход к сцене digital_avatar_body', {
        description: 'Switching to digital_avatar_body scene',
        telegram_id: ctx.from?.id,
        previous_mode: mode,
        selected_model: ctx.session.selected_model,
        action: 'enter_digital_avatar_body',
      })
      return ctx.scene.enter('digital_avatar_body')
    case ModeEnum.DigitalAvatarBodyV2:
      logger.info('🔄 Переход к сцене digital_avatar_body_v2', {
        description: 'Switching to digital_avatar_body_v2 scene',
        telegram_id: ctx.from?.id,
        previous_mode: mode,
        selected_model: ctx.session.selected_model,
        action: 'enter_digital_avatar_body_v2',
      })
      return ctx.scene.enter('digital_avatar_body_v2')
    case ModeEnum.ImageToPrompt:
      logger.info({
        message: '🔄 Переход к сцене image_to_prompt_wizard',
        description: 'Switching to image_to_prompt_wizard scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('image_to_prompt_wizard')
    case ModeEnum.ImprovePrompt:
      logger.info({
        message: '🔄 Переход к сцене improve_prompt_wizard',
        description: 'Switching to improve_prompt_wizard scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('improve_prompt_wizard')
    case ModeEnum.TextToImage:
      logger.info({
        message: '🔄 Переход к сцене text_to_image',
        description: 'Switching to text_to_image scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('text_to_image')
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
    case ModeEnum.AvatarBrainWizard:
      logger.info({
        message: '🔄 Переход к сцене avatarBrainWizard',
        description: 'Switching to avatarBrainWizard scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter(ModeEnum.AvatarBrainWizard)
    case ModeEnum.ChatWithAvatar:
      logger.info({
        message: '🔄 Переход к сцене chat_with_avatar',
        description: 'Switching to chat_with_avatar scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter(ModeEnum.ChatWithAvatar)
    case ModeEnum.Voice:
      logger.info({
        message: '🔄 Переход к сцене voice',
        description: 'Switching to voice scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter('voice')
    case ModeEnum.TextToSpeech:
      logger.info({
        message: '🔄 Переход к сцене TextToSpeech',
        description: 'Switching to TextToSpeech scene',
        telegram_id: ctx.from?.id,
      })
      return ctx.scene.enter(ModeEnum.TextToSpeech)
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
