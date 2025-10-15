import { PaidServiceEnum } from './paidServices'

export enum ModeEnum {
  // 💰 ПЛАТНЫЕ СЕРВИСЫ (наследуем из PaidServiceEnum)
  NeuroPhoto = PaidServiceEnum.NeuroPhoto,
  NeuroPhotoV2 = PaidServiceEnum.NeuroPhotoV2,
  ImageToPrompt = PaidServiceEnum.ImageToPrompt,
  ImageUpscaler = PaidServiceEnum.ImageUpscaler,
  KlingVideo = PaidServiceEnum.KlingVideo,
  HaiperVideo = PaidServiceEnum.HaiperVideo,
  VideoGenerationOther = PaidServiceEnum.VideoGenerationOther,
  MinimaxVideo = PaidServiceEnum.MinimaxVideo,
  TextToSpeech = PaidServiceEnum.TextToSpeech,
  Voice = PaidServiceEnum.Voice,
  VoiceToText = PaidServiceEnum.VoiceToText,
  LipSync = PaidServiceEnum.LipSync,
  VideoTranscription = PaidServiceEnum.VideoTranscription,
  ImageToVideo = PaidServiceEnum.ImageToVideo,
  TextToVideo = PaidServiceEnum.TextToVideo,
  DigitalAvatarBody = PaidServiceEnum.DigitalAvatarBody,
  DigitalAvatarBodyV2 = PaidServiceEnum.DigitalAvatarBodyV2,

  // 🔧 СИСТЕМНЫЕ ОПЕРАЦИИ
  AvatarTransform = 'avatar_transform',
  AIHeroes = 'ai_heroes',
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
  InstagramParserWizard = 'instagram_parser_wizard',
  MorphingWizard = 'morphing_wizard',
  AiPhotoshop = 'ai_photoshop',

  // ⚠️ УСТАРЕВШИЕ/НЕИСПОЛЬЗУЕМЫЕ (оставляем для совместимости)
  /** @deprecated Не используется */
  NeuroAudio = 'neuro_audio',
  /** @deprecated Не используется, есть NeuroPhoto */
  TextToImage = 'text_to_image',
  FluxKontext = 'flux_kontext',
}

// Определяем интерфейсы прямо здесь для предотвращения циклических зависимостей
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
