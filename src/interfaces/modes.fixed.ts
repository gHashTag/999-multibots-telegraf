/**
 * 🔧 ИСПРАВЛЕННАЯ СИСТЕМА РЕЖИМОВ
 * Без computed values в enum - решает проблемы TypeScript
 */

// Сначала определяем платные сервисы как const объект
export const PAID_SERVICES = {
  // 🖼️ ГЕНЕРАЦИЯ ИЗОБРАЖЕНИЙ
  NeuroPhoto: 'neuro_photo',
  NeuroPhotoV2: 'neuro_photo_v2',
  ImageToPrompt: 'image_to_prompt',
  ImageUpscaler: 'image_upscaler',
  
  // 🎬 ГЕНЕРАЦИЯ ВИДЕО  
  KlingVideo: 'kling_video',
  HaiperVideo: 'haiper_video',
  VideoGenerationOther: 'video_generation_other',
  MinimaxVideo: 'minimax_video',
  
  // 🎵 АУДИО СЕРВИСЫ
  TextToSpeech: 'text_to_speech',
  Voice: 'voice',
  VoiceToText: 'voice_to_text',
  LipSync: 'lip_sync',
  VideoTranscription: 'video_transcription',
  
  // 🎬 ДОПОЛНИТЕЛЬНЫЕ ВИДЕО СЕРВИСЫ
  ImageToVideo: 'image_to_video',
  TextToVideo: 'text_to_video',
  
  // 🎭 АВАТАРЫ
  DigitalAvatarBody: 'digital_avatar_body',
  DigitalAvatarBodyV2: 'digital_avatar_body_v2',
} as const

// Теперь создаем enum со статическими строковыми значениями
export enum ModeEnum {
  // 💰 ПЛАТНЫЕ СЕРВИСЫ (статические значения)
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  ImageToPrompt = 'image_to_prompt',
  ImageUpscaler = 'image_upscaler',
  KlingVideo = 'kling_video',
  HaiperVideo = 'haiper_video',
  VideoGenerationOther = 'video_generation_other',
  MinimaxVideo = 'minimax_video',
  TextToSpeech = 'text_to_speech',
  Voice = 'voice',
  VoiceToText = 'voice_to_text',
  LipSync = 'lip_sync',
  VideoTranscription = 'video_transcription',
  ImageToVideo = 'image_to_video',
  TextToVideo = 'text_to_video',
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',

  // 🔧 СИСТЕМНЫЕ ОПЕРАЦИИ
  AvatarTransform = 'avatar_transform',
  Subscribe = 'subscribe',
  TopUpBalance = 'top_up_balance',
  Avatar = 'avatar',
  ChatWithAvatar = 'chat_with_avatar',
  VideoInUrl = 'video_in_url',

  // 📱 МЕНЮ И НАВИГАЦИЯ
  Help = 'helpScene',
  MainMenu = 'main_menu',
  Balance = 'balance',
  Invite = 'invite',
  Support = 'support',
  Stats = 'stats',
  Price = 'price',
  StartScene = 'start_scene',
  MenuScene = 'menuScene',
  BalanceScene = 'balance_scene',
  InviteScene = 'invite_scene',
  PaymentScene = 'payment_scene',
  RublePaymentScene = 'rublePaymentScene',
  StarPaymentScene = 'starPaymentScene',

  // 🧙‍♂️ МАСТЕРА И ПОМОЩНИКИ
  SelectModel = 'select_model',
  SelectAiTextModel = 'select_ai_text_model',
  SelectModelWizard = 'select_model_wizard',
  SelectNeuroPhoto = 'select_neuro_photo',
  ChangeSize = 'change_size',
  ImprovePrompt = 'improve_prompt',
  BroadcastWizard = 'broadcast_wizard',
  SubscriptionCheckScene = 'subscription_check_scene',
  ImprovePromptWizard = 'improve_prompt_wizard',
  SizeWizard = 'size_wizard',
  Step0 = 'step0',
  NeuroCoderScene = 'neuro_coder_scene',
  CheckBalanceScene = 'check_balance_scene',
  CancelPredictionsWizard = 'cancel_predictions_wizard',
  EmailWizard = 'email_wizard',
  GetRuBillWizard = 'get_ru_bill_wizard',
  SubscriptionScene = 'subscription_scene',
  CreateUserScene = 'create_user_scene',
  InstagramScrapingWizard = 'instagram_scraping_wizard',
  InstagramParserScene = 'instagram_parser_scene',
  MorphingWizard = 'morphing_wizard',
  AiPhotoshop = 'ai_photoshop',

  // ⚠️ УСТАРЕВШИЕ/НЕИСПОЛЬЗУЕМЫЕ
  /** @deprecated Не используется */
  NeuroAudio = 'neuro_audio',
  /** @deprecated Не используется, есть NeuroPhoto */
  TextToImage = 'text_to_image',
  FluxKontext = 'flux_kontext',
}

// Type guards для проверки типов
export function isPaidService(mode: string): mode is keyof typeof PAID_SERVICES {
  return Object.values(PAID_SERVICES).includes(mode as any)
}

export function isSystemOperation(mode: ModeEnum): boolean {
  const systemOperations = [
    ModeEnum.AvatarTransform,
    ModeEnum.Subscribe,
    ModeEnum.TopUpBalance,
    ModeEnum.Avatar,
    ModeEnum.ChatWithAvatar,
    ModeEnum.VideoInUrl,
  ]
  return systemOperations.includes(mode)
}

export function isNavigationMode(mode: ModeEnum): boolean {
  const navigationModes = [
    ModeEnum.Help,
    ModeEnum.MainMenu,
    ModeEnum.Balance,
    ModeEnum.Invite,
    ModeEnum.Support,
    ModeEnum.Stats,
    ModeEnum.Price,
    ModeEnum.StartScene,
    ModeEnum.MenuScene,
    ModeEnum.BalanceScene,
    ModeEnum.InviteScene,
    ModeEnum.PaymentScene,
    ModeEnum.RublePaymentScene,
    ModeEnum.StarPaymentScene,
  ]
  return navigationModes.includes(mode)
}

// Интерфейсы
export interface CostCalculationParams {
  mode: ModeEnum | string
  steps?: number
  numImages?: number
  modelId?: string
}

export interface CostCalculationResult {
  stars: number
  rubles: number
  dollars: number
}

export type Mode = ModeEnum | string

export type BaseCosts = {
  [key in ModeEnum | 'neuro_photo_2']?: number
}

export type ModeCosts = Required<Record<Mode, number>>