/**
 * Перечисление всех возможных режимов работы бота
 */
export enum ModeEnum {
  Subscribe = 'subscribe',
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  ImageToPrompt = 'image_to_prompt',
  Avatar = 'avatar',
  ChatWithAvatar = 'chat_with_avatar',
  SelectModel = 'select_model',
  SelectModelWizard = 'select_model_wizard',
  Voice = 'voice',
  TextToSpeech = 'text_to_speech',
  ImageToVideo = 'image_to_video',
  TextToVideo = 'text_to_video',
  TextToImage = 'text_to_image',
  LipSync = 'lip_sync',
  SelectNeuroPhoto = 'select_neuro_photo',
  ChangeSize = 'change_size',
  Invite = 'invite',
  Help = 'help',
  MainMenu = 'main_menu',
  Balance = 'balance',
  ImprovePrompt = 'improve_prompt',
  TopUpBalance = 'top_up_balance',
  VideoInUrl = 'video_in_url',
  Tech = 'tech',
  Stats = 'stats',
  BroadcastWizard = 'broadcast_wizard',
  SubscriptionCheckScene = 'subscription_check_scene',
  ImprovePromptWizard = 'improve_prompt_wizard',
  SizeWizard = 'size_wizard',
  PaymentScene = 'payment_scene',
  InviteScene = 'invite_scene',
  BalanceScene = 'balance_scene',
  Step0 = 'step0',
  NeuroCoderScene = 'neuro_coder_scene',
  CheckBalanceScene = 'check_balance_scene',
  HelpScene = 'help_scene',
  CancelPredictionsWizard = 'cancel_predictions_wizard',
  EmailWizard = 'email_wizard',
  CreateUserScene = 'create_user_scene',
  NeuroBase = 'neuro_base',
}

/**
 * Группировка режимов по категориям
 */
export const MODE_CATEGORIES = {
  GENERATION: [
    ModeEnum.NeuroPhoto,
    ModeEnum.NeuroPhotoV2,
    ModeEnum.TextToImage,
    ModeEnum.ImageToPrompt,
  ],
  AVATAR: [
    ModeEnum.DigitalAvatarBody,
    ModeEnum.DigitalAvatarBodyV2,
    ModeEnum.Avatar,
    ModeEnum.ChatWithAvatar,
  ],
  VIDEO: [
    ModeEnum.ImageToVideo,
    ModeEnum.TextToVideo,
    ModeEnum.LipSync,
  ],
  AUDIO: [
    ModeEnum.Voice,
    ModeEnum.TextToSpeech,
  ],
  SYSTEM: [
    ModeEnum.Subscribe,
    ModeEnum.Help,
    ModeEnum.MainMenu,
    ModeEnum.Balance,
    ModeEnum.TopUpBalance,
    ModeEnum.Tech,
    ModeEnum.Stats,
  ],
  SCENES: [
    ModeEnum.SelectModel,
    ModeEnum.SelectModelWizard,
    ModeEnum.SelectNeuroPhoto,
    ModeEnum.PaymentScene,
    ModeEnum.InviteScene,
    ModeEnum.BalanceScene,
    ModeEnum.HelpScene,
    ModeEnum.EmailWizard,
    ModeEnum.CreateUserScene,
  ],
} as const;

/**
 * Проверка, является ли режим платным
 */
export const isPaidMode = (mode: ModeEnum): boolean => {
  return [
    ModeEnum.NeuroPhoto,
    ModeEnum.NeuroPhotoV2,
    ModeEnum.TextToImage,
    ModeEnum.ImageToPrompt,
    ModeEnum.DigitalAvatarBody,
    ModeEnum.DigitalAvatarBodyV2,
    ModeEnum.ChatWithAvatar,
    ModeEnum.ImageToVideo,
    ModeEnum.TextToVideo,
    ModeEnum.LipSync,
    ModeEnum.Voice,
    ModeEnum.TextToSpeech,
  ].includes(mode);
};

/**
 * Проверка, является ли режим сценой
 */
export const isSceneMode = (mode: ModeEnum): boolean => {
  return (MODE_CATEGORIES.SCENES as unknown as ModeEnum[]).includes(mode);
};

/**
 * Получение категории режима
 */
export const getModeCategory = (mode: ModeEnum): keyof typeof MODE_CATEGORIES | undefined => {
  for (const [category, modes] of Object.entries(MODE_CATEGORIES)) {
    if ((modes as unknown as ModeEnum[]).includes(mode)) {
      return category as keyof typeof MODE_CATEGORIES;
    }
  }
  return undefined;
}; 