// import { PaymentType } from '@/interfaces/payments.interface' // This line was causing the conflict

/**
 * Определение для данных события Inngest, используемых в modelTraining.worker.ts
 * На основе event.data в modelTraining.worker.ts
 */
export interface ModelTrainingInngestEventData {
  telegram_id: string // Inngest часто работает со строками
  bot_name: string
  model_name: string
  trigger_word?: string
  zipUrl: string
  cost_for_refund?: number // Используем cost_for_refund для ясности
  calculatedCost: number // <--- ДОБАВЛЕНО: Рассчитанная стоимость
  operation_type_for_refund: PaymentType // Тип операции для возврата
  is_ru: boolean
  // Опциональные поля, передаваемые из сервиса или сцены
  steps?: number
  gender?: string // <--- ДОБАВЛЕНО
  user_api: string // Добавлено для передачи в Inngest
  user_replicate_username: string // Добавлено для передачи в Inngest
  trainingDbIdFromEvent?: string // ADDED: ID записи из БД, если она уже создана
  // paymentType?: PaymentType // Удаляем, так как есть operation_type_for_refund
}

// --- Типы для проверки активных тренировок (оставляем без изменений) ---
export type ActiveCheckResult =
  | ErrorActiveCheck
  | ActiveCheckFromDB
  | ActiveCheckFromCache
  | NoActiveCheck

export interface ErrorActiveCheck {
  status: 'error'
  message: string
}

export interface ActiveCheckFromDB {
  status: 'active_db'
  replicate_id: string | null
  db_status: string | null // Добавляем статус из БД
  created_at?: string // Делаем опциональным
  model_name?: string // Делаем опциональным
}

export interface ActiveCheckFromCache {
  status: 'active_cache'
  cache_status: 'starting' | 'running'
}

export interface NoActiveCheck {
  status: 'inactive'
}

// Тип для вебхука (если он будет использоваться)
export enum WebhookEventType {
  Completed = 'completed',
  Failed = 'failed',
  // Другие статусы по необходимости
}

export interface DigitalAvatarBodyDependencies {
  // ... existing code ...
}

// Определение типа для результата initiateDigitalAvatarModelTraining
export interface InitiateModelTrainingResult {
  success: boolean
  message: string
  data?: {
    plan: 'A' | 'B'
    replicate_id?: string
    db_id: string | number
  }
}

// Новый тип для входных данных функции-диспетчера (восстанавливаем для uploadTrainFluxModelScene)
export interface InitiateModelTrainingPayload {
  telegram_id: string
  is_ru: boolean
  bot_name: string
  model_name: string
  localZipPath: string
  steps?: number
  trigger_word?: string
  gender?: 'male' | 'female' | 'other' | undefined
  calculatedCost: number
  operation_type_for_refund: PaymentType
  publicUrl?: string
  stepsAmount?: number
  user_replicate_username: string | null
}

// Copied from @/interfaces/payments.interface.ts
export enum PaymentType {
  MONEY_INCOME = 'MONEY_INCOME',
  MONEY_OUTCOME = 'MONEY_OUTCOME',
  REFUND = 'REFUND',
}

// Local ReplicateTrainingResponse (subset of replicate.Training)
export interface ReplicateTrainingResponse {
  id: string
  version?: string // model version ID
  status: string // e.g., "starting", "processing", "succeeded", "failed", "canceled"
  input?: any
  output?: any // Contains version on success: { version: "username/modelname:versionid" }
  error?: any
  logs?: string
  webhook?: string
  created_at?: string
  started_at?: string | null
  completed_at?: string | null
  urls?: {
    get: string
    cancel: string
  }
}

// Copied from @/interfaces/modes.ts
export enum ModeEnum {
  Subscribe = 'subscribe',
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  NeuroAudio = 'neuro_audio',
  ImageToPrompt = 'image_to_prompt',
  Avatar = 'avatar',
  ChatWithAvatar = 'chat_with_avatar',
  SelectModel = 'select_model',
  SelectAiTextModel = 'select_ai_text_model',
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
  Help = 'helpScene',
  MainMenu = 'main_menu',
  Balance = 'balance',
  ImprovePrompt = 'improve_prompt',
  TopUpBalance = 'top_up_balance',
  VideoInUrl = 'video_in_url',
  Support = 'support',
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
  CancelPredictionsWizard = 'cancel_predictions_wizard',
  EmailWizard = 'email_wizard',
  GetRuBillWizard = 'get_ru_bill_wizard',
  SubscriptionScene = 'subscription_scene',
  CreateUserScene = 'create_user_scene',
  VoiceToText = 'voice_to_text',
  StartScene = 'start_scene',
  Price = 'price',
  RublePaymentScene = 'rublePaymentScene',
  StarPaymentScene = 'starPaymentScene',
  MenuScene = 'menuScene',
  UPLOAD_TRAIN_FLUX_MODEL_SCENE = 'upload_train_flux_model_scene',
}

// ADDING TrainingStatus definition
export type TrainingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'FAILED'
  | 'CANCELED'
  | 'SUCCEEDED'
  | 'PENDING_INNGST' // Added the status used in index.ts
