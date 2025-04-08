/**
 * Enum для всех возможных сцен в боте
 */
export enum SceneEnum {
  // Основные сцены
  MainMenu = ModeEnum.MenuScene,
  StartScene = 'start_scene',
  HelpScene = 'help_scene',
  BalanceScene = 'balance_scene',
  CheckBalanceScene = 'check_balance_scene',
  CreateUserScene = 'create_user_scene',
  InviteScene = 'invite_scene',
  SubscriptionScene = 'subscription_scene',
  SubscriptionCheckScene = 'subscription_check_scene',
  PaymentScene = 'payment_scene',
  
  // Сцены сервисов
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  TextToSpeech = 'text_to_speech',
  ImageToVideo = 'image_to_video',
  TextToVideo = 'text_to_video',
  TextToImage = 'text_to_image',
  ImageToPrompt = 'image_to_prompt',
  ChatWithAvatar = 'chat_with_avatar',
  Voice = 'voice',
  VoiceToText = 'voice_to_text',
  NeuroCoderScene = 'neuro_coder_scene',
  
  // Вспомогательные сцены
  SelectModel = 'select_model',
  SelectModelWizard = 'select_model_wizard',
  ImprovePrompt = 'improve_prompt',
  ImprovePromptWizard = 'improve_prompt_wizard',
  SizeWizard = 'size_wizard',
  BroadcastWizard = 'broadcast_wizard',
  EmailWizard = 'email_wizard',
  GetRuBillWizard = 'get_ru_bill_wizard',
  CancelPredictionsWizard = 'cancel_predictions_wizard'
}

/**
 * Тип для объекта с маппингом сцен
 */
export type Scenes = Record<SceneEnum, string>

/**
 * Маппинг сцен на их строковые идентификаторы
 */
export const sceneMap: Scenes = {
  [SceneEnum.MainMenu]: ModeEnum.MenuScene,
  [SceneEnum.StartScene]: 'start_scene',
  [SceneEnum.HelpScene]: 'help_scene',
  [SceneEnum.BalanceScene]: 'balance_scene',
  [SceneEnum.CheckBalanceScene]: 'check_balance_scene',
  [SceneEnum.CreateUserScene]: 'create_user_scene',
  [SceneEnum.InviteScene]: 'invite_scene',
  [SceneEnum.SubscriptionScene]: 'subscription_scene',
  [SceneEnum.SubscriptionCheckScene]: 'subscription_check_scene',
  [SceneEnum.PaymentScene]: 'payment_scene',
  
  [SceneEnum.NeuroPhoto]: 'neuro_photo',
  [SceneEnum.NeuroPhotoV2]: 'neuro_photo_v2',
  [SceneEnum.TextToSpeech]: 'text_to_speech',
  [SceneEnum.ImageToVideo]: 'image_to_video',
  [SceneEnum.TextToVideo]: 'text_to_video',
  [SceneEnum.TextToImage]: 'text_to_image',
  [SceneEnum.ImageToPrompt]: 'image_to_prompt',
  [SceneEnum.ChatWithAvatar]: 'chat_with_avatar',
  [SceneEnum.Voice]: 'voice',
  [SceneEnum.VoiceToText]: 'voice_to_text',
  [SceneEnum.NeuroCoderScene]: 'neuro_coder_scene',
  
  [SceneEnum.SelectModel]: 'select_model',
  [SceneEnum.SelectModelWizard]: 'select_model_wizard',
  [SceneEnum.ImprovePrompt]: 'improve_prompt',
  [SceneEnum.ImprovePromptWizard]: 'improve_prompt_wizard',
  [SceneEnum.SizeWizard]: 'size_wizard',
  [SceneEnum.BroadcastWizard]: 'broadcast_wizard',
  [SceneEnum.EmailWizard]: 'email_wizard',
  [SceneEnum.GetRuBillWizard]: 'get_ru_bill_wizard',
  [SceneEnum.CancelPredictionsWizard]: 'cancel_predictions_wizard'
} 