import { SceneEnum } from '@/types/scenes'
import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'

export async function enterScene(ctx: MyContext, scene: SceneEnum, telegramId?: string | number) {
  const sceneMap: Record<SceneEnum, string> = {
    [SceneEnum.MainMenu]: 'main_menu',
    [SceneEnum.CreateUser]: 'create_user_scene',
    [SceneEnum.SubscriptionCheck]: 'subscription_check_scene',
    [SceneEnum.CheckBalance]: 'check_balance_scene',
    [SceneEnum.ChatWithAvatar]: 'chat_with_avatar',
    [SceneEnum.DigitalAvatarBody]: 'digital_avatar_body',
    [SceneEnum.DigitalAvatarBodyV2]: 'digital_avatar_body_v2',
    [SceneEnum.NeuroPhoto]: 'neuro_photo',
    [SceneEnum.NeuroPhotoV2]: 'neuro_photo_v2',
    [SceneEnum.SelectModel]: 'select_model',
    [SceneEnum.SelectModelWizard]: 'select_model_wizard',
    [SceneEnum.Voice]: 'voice',
    [SceneEnum.TextToSpeech]: 'text_to_speech',
    [SceneEnum.ImageToVideo]: 'image_to_video',
    [SceneEnum.TextToVideo]: 'text_to_video',
    [SceneEnum.TextToImage]: 'text_to_image',
    [SceneEnum.SelectNeuroPhoto]: 'select_neuro_photo',
    [SceneEnum.ChangeSize]: 'change_size',
    [SceneEnum.Invite]: 'invite_scene',
    [SceneEnum.Help]: 'help_scene',
    [SceneEnum.Balance]: 'balance_scene',
    [SceneEnum.ImprovePrompt]: 'improve_prompt_wizard',
    [SceneEnum.Payment]: 'payment_scene',
    [SceneEnum.NeuroCoder]: 'neuro_coder_scene',
    [SceneEnum.CancelPredictions]: 'cancel_predictions_wizard',
    [SceneEnum.Email]: 'email_wizard',
    [SceneEnum.GetRuBill]: 'get_ru_bill_wizard',
    [SceneEnum.Subscription]: 'subscription_scene',
    [SceneEnum.VoiceToText]: 'voice_to_text'
  }

  const sceneName = sceneMap[scene]
  if (!sceneName) {
    logger.error('❌ Unknown scene for transition', {
      scene,
      telegram_id: telegramId
    })
    throw new Error(`Unknown scene: ${scene}`)
  }

  logger.info('🎯 Scene transition', {
    from_scene: ctx.session?.mode,
    to_scene: scene,
    scene_name: sceneName,
    telegram_id: telegramId
  })

  ctx.session.mode = scene
  return ctx.scene.enter(sceneName)
} 