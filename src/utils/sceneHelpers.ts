import { logger } from '@/utils/logger'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/price/helpers/modelsCost'

export const sceneMap: Record<ModeEnum, string> = {
  [ModeEnum.MainMenu]: ModeEnum.MenuScene,
  [ModeEnum.CreateUserScene]: 'create_user_scene',
  [ModeEnum.SubscriptionCheckScene]: 'subscription_check_scene',
  [ModeEnum.CheckBalanceScene]: 'check_balance_scene',
  [ModeEnum.ChatWithAvatar]: 'chat_with_avatar',
  [ModeEnum.DigitalAvatarBody]: 'digital_avatar_body',
  [ModeEnum.DigitalAvatarBodyV2]: 'digital_avatar_body_v2',
  [ModeEnum.NeuroPhoto]: 'neuro_photo',
  [ModeEnum.NeuroPhotoV2]: 'neuro_photo_v2',
  [ModeEnum.SelectModel]: 'select_model',
  [ModeEnum.SelectModelWizard]: 'select_model_wizard',
  [ModeEnum.Voice]: 'voice',
  [ModeEnum.TextToSpeech]: 'text_to_speech',
  [ModeEnum.ImageToVideo]: 'image_to_video',
  [ModeEnum.TextToVideo]: 'text_to_video',
  [ModeEnum.TextToImage]: 'text_to_image',
  [ModeEnum.SelectNeuroPhoto]: 'select_neuro_photo',
  [ModeEnum.ChangeSize]: 'change_size',
  [ModeEnum.InviteScene]: 'invite_scene',
  [ModeEnum.HelpScene]: 'help_scene',
  [ModeEnum.BalanceScene]: 'balance_scene',
  [ModeEnum.ImprovePromptWizard]: 'improve_prompt_wizard',
  [ModeEnum.PaymentScene]: 'payment_scene',
  [ModeEnum.NeuroCoderScene]: 'neuro_coder_scene',
  [ModeEnum.CancelPredictionsWizard]: 'cancel_predictions_wizard',
  [ModeEnum.EmailWizard]: 'email_wizard',
  [ModeEnum.GetRuBillWizard]: 'get_ru_bill_wizard',
  [ModeEnum.SubscriptionScene]: 'subscription_scene',
  [ModeEnum.VoiceToText]: 'voice_to_text',
  [ModeEnum.MenuScene]: 'menu_scene',
  [ModeEnum.StartScene]: 'start_scene',
  [ModeEnum.Subscribe]: 'subscribe',
  [ModeEnum.ImageToPrompt]: 'image_to_prompt',
  [ModeEnum.Avatar]: 'avatar',
  [ModeEnum.LipSync]: 'lip_sync',
  [ModeEnum.Tech]: 'tech',
  [ModeEnum.Stats]: 'stats',
  [ModeEnum.BroadcastWizard]: 'broadcast_wizard',
  [ModeEnum.ImprovePrompt]: 'improve_prompt',
  [ModeEnum.TopUpBalance]: 'top_up_balance',
  [ModeEnum.VideoInUrl]: 'video_in_url',
  [ModeEnum.Step0]: 'step0',
  [ModeEnum.Invite]: 'invite',
  [ModeEnum.Help]: 'help',
  [ModeEnum.Balance]: 'balance',
  [ModeEnum.SizeWizard]: 'size_wizard'
}

export async function enterScene(ctx: MyContext, scene: ModeEnum, telegramId?: string | number) {
  const sceneName = sceneMap[scene] || scene
  if (!sceneName) {
    logger.error('❌ Unknown scene for transition', {
      scene,
      telegramId: telegramId || ctx.from?.id
    })
    return
  }

  await ctx.scene.enter(sceneName)
} 