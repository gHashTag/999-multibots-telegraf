import { PaymentType } from '@/interfaces/payments.interface'
// import { Training } from 'replicate' // Not used here, ReplicateTrainingResponse is local

/**
 * Определение для данных события Inngest, используемых в modelTraining.worker.ts
 * На основе event.data в modelTraining.worker.ts
 */
export interface ModelTrainingInngestEventData {
  user_id: string // User's actual ID from DB
  telegram_id: string // User's telegram ID
  is_ru: boolean
  bot_name: string
  bot_token: string // Bot token for sending messages from worker
  model_name: string
  trigger_word?: string
  publicUrl: string // URL of the zip file for training
  steps?: number
  gender?: 'male' | 'female' | 'other' | undefined
  db_model_training_id: string | number // ID of the record in our DB
  calculatedCost: number
  operation_type_for_refund: PaymentType
  replicateModelDestination?: `${string}/${string}` // Optional: if pre-calculated
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

/**
 * Represents the status of a training process.
 * Used in ModelTraining and potentially other places to track progress.
 */
export type TrainingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'PENDING_INNGest' // Note: Case sensitive for 'G'

export interface DigitalAvatarUserProfile {
  id: string // UUID
  telegram_id: string
  neuro_tokens: number
  level: number
  replicate_username?: string | null
  // Add other user-specific fields relevant to this module if necessary
}

// Cost calculation specific to this module
export interface DigitalAvatarBodyCostInput {
  mode: ModeEnum // Assuming ModeEnum is defined and imported if needed, or defined locally
  steps: number
}

// Local definition for Replicate training response, if needed by types in this module
export interface ReplicateTrainingResponse {
  id: string
  version?: string
  status?: TrainingStatus // Use our local TrainingStatus
  input?: any
  output?: any
  error?: any
  logs?: string
  metrics?: any
  model?: string
  webhook_completed?: boolean
  // Add other fields from Replicate webhook or API response as needed
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

/**
 * Payload for the main entry point function `initiateDigitalAvatarModelTraining` in `index.ts`.
 */
export interface InitiateModelTrainingPayload {
  telegram_id: string
  is_ru: boolean
  bot_name: string
  bot_token: string // Added bot_token
  model_name: string
  publicUrl: string // Publicly accessible URL for the training data (zip file)
  stepsAmount?: number // Preferred over steps if both exist, clarify usage
  steps?: number // Legacy or alternative, clarify usage
  trigger_word?: string
  gender?: 'male' | 'female' | 'other' | undefined
  calculatedCost: number
  operation_type_for_refund: PaymentType // Using corrected import
}

/**
 * Result type for `initiateDigitalAvatarModelTraining`
 */
export interface InitiateModelTrainingResult {
  success: boolean
  message: string
  error_type?: string // e.g., 'USER_NOT_FOUND', 'VALIDATION_FAILED', 'DB_ERROR', 'INNGEST_ERROR', 'PLAN_B_ERROR'
  training_id?: string | number
  replicate_id?: string
  plan?: 'A' | 'B' // 'A' for Inngest, 'B' for direct/PlanB
}

// Re-export PaymentType so other files in this module can import it from here
export { PaymentType } // CORRECTED PATH
