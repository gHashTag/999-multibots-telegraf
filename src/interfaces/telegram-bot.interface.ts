import { Context, NarrowedContext, Scenes } from 'telegraf'
import type { ModelUrl, UserModel } from './index'
import type { Update, Message } from 'telegraf/types'
import type { User } from 'telegraf/typings/core/types/typegram'
import { Buffer } from 'buffer'

import { BroadcastContentType } from './broadcast.interface'
import { SubscriptionType } from './subscription.interface'
import type { TranslationButton } from './supabase.interface'
import type { SessionPayment } from './payments.interface'
import type {
  SceneContextScene,
  WizardContextWizard,
} from 'telegraf/typings/scenes'
import { ModeEnum, type Mode } from './modes'
import type { Translation } from './translations.interface'

type SceneId = string
type TranslationEntry = Translation

export type BufferType = { buffer: Buffer; filename: string }[]
export interface Level {
  title_ru: string
  title_en: string
}

export interface SubscriptionButton {
  text: string
  callback_data: string
  row: number
  stars_price: number
  en_price: number
  ru_price: number
  description: string
}

export interface SessionData {
  selectedModel: string
  text: string
  model_type: ModelUrl
  selectedSize: string
  userModel: UserModel
  mode: Mode
  videoModel: string
  imageUrl: string
  amount: number
  images: BufferType
  modelName: string
  targetUserId: number
  username: string
  triggerWord: string
  steps: number
  selectedPayment: string
}

export interface MyWizardSession extends Scenes.WizardSessionData {
  data: string
  cursor: number
  severity: number
  imageUrl?: string
  text?: string
  textRu?: string
  textEn?: string
  textInputStep?: string
  ownerTelegramId?: string
  broadcastId?: string
  broadcastImageUrl?: string
  broadcastText?: string
  broadcastFileId?: string
  broadcastContentType?: BroadcastContentType
  broadcastPostLink?: string
  broadcastVideoUrl?: string
  broadcastAudioUrl?: string
  broadcastPhotoUrl?: string
  contentType?: BroadcastContentType
  mediaFileId?: string
  photoFileId?: string
  videoFileId?: string
  postLink?: string
  botName?: string
  subscriptionType?: SubscriptionType
  __scenes: Record<string, unknown>
  selectedPayment?: SessionPayment
  subscription: SubscriptionType | null
  step: number
  cost?: number
}

export interface Button {
  text: string
  callback_data: string
  row: number
  en_price: number
  ru_price: number
  stars_price: number
  description: string
}

export interface Memory {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp?: number
  }>
}

export interface MySessionData extends Scenes.WizardSessionData {
  cursor: number
  email?: string
  selectedModel?: string
  prompt?: string
  ownerTelegramId?: string
  textInputStep?: string
  textRu?: string
  textEn?: string
  contentType?: BroadcastContentType
  photoFileId?: string
  videoFileId?: string
  postLink?: string
  promoProcessed?: boolean

  selectedSize?: string
  selectedPayment?: {
    amount: number
    stars: number
    subscription: SubscriptionType | null
  }
  subscription: SubscriptionType | null
  text?: string
  model_type?: ModelUrl
  userModel?: UserModel
  mode?: Mode
  videoModel?: string
  imageUrl?: string
  amount?: number
  images?: BufferType
  modelName?: string
  targetUserId?: number
  username?: string
  triggerWord?: string
  steps?: number
  memory?: Memory
  lastStartCommand?: number // Timestamp of last /start command to prevent spam

  __scenes: Record<string, unknown>
}

export interface WizardSessionData extends Scenes.WizardSessionData {
  cursor: number
  ownerTelegramId?: string
  textInputStep?: string
  textRu?: string
  textEn?: string
  contentType?: BroadcastContentType
  photoFileId?: string
  videoFileId?: string
  postLink?: string
  state: {
    step: number
  }
}

export type BotName =
  | 'neuro_blogger_bot'
  | 'MetaMuse_Manifest_bot'
  | 'ZavaraBot'
  | 'LeeSolarbot'
  | 'NeuroLenaAssistant_bot'
  | 'NeurostylistShtogrina_bot'
  | 'Gaia_Kamskaia_bot'
  | 'ai_koshey_bot'
  | 'clip_maker_neuro_bot'
  | 'Kaya_easy_art_bot'
  | 'AI_STARS_bot'
  | 'TestNeurocoder_bot'
  | 'HaimGroupMedia_bot'

export interface MySession extends Scenes.WizardSession<MyWizardSession> {
  cursor: number
  mode: ModeEnum | SceneId | null
  neuroPhotoInitialized?: boolean
  subscription?: SubscriptionType
  selectedSize?: string
  bypass_payment_check?: boolean
  modelSelectionShown?: boolean
  images: BufferType
  morphingImages?: {
    buffer: Buffer
    filename: string
    timestamp?: number // ✅ Для правильной сортировки
    originalOrder?: number // ✅ Исходный порядок добавления
  }[] // Массив изображений для морфинга с именами файлов
  morphingButtonsMessageId?: number // ✅ ID сообщения с кнопками морфинга для обновления
  morphingProgressMessageId?: number // ✅ ID сообщения с прогрессом загрузки изображений для морфинга
  morphingRestarting?: boolean // ✅ Флаг для предотвращения спама кнопки "Начать заново"
  modelName?: string
  targetUserId: number
  username?: string
  triggerWord?: string
  steps?: number
  videoUrl?: string
  audioUrl?: string
  email?: string
  inviteCode?: string
  inviter?: string
  paymentAmount?: number
  botName?: string
  selectedImageModel?: string
  promoProcessed?: boolean
  subscriptionStep?:
    | 'LOADING_TRANSLATIONS'
    | 'LOADING_MODELS'
    | 'LOADING_SUBSCRIPTION'
    | 'LOADING_PAYMENT'
    | 'LOADING_PAYMENT_LINK'
    | 'LOADING_PAYMENT_STATUS'
    | 'LOADING_PAYMENT_CONFIRMATION'
    | 'LOADING_PAYMENT_SUCCESS'
    | 'LOADING_PAYMENT_FAILURE'
    | 'SHOWING_OPTIONS'
    | 'SUBSCRIPTION_SELECTED'
  imageUrl?: string
  image_a_file_id?: string
  image_b_file_id?: string
  prompt?: string | null
  current_action?: string
  is_morphing?: boolean
  payment_method?: string // 'telegram_stars' | 'robokassa'
  payment_amount?: number // Amount for the current operation
  imageAUrl?: string // For morphing - Image A
  imageBUrl?: string // For morphing - Image B
  imageToVideoModel?: string // Модель, выбранная в imageToVideoWizard
  language?: string // 'ru' или 'en'
  aspect_ratio?: string // <-- Добавлено соотношение сторон
  translationCache?: Record<string, TranslationEntry[]> | null
  neuroPhotoInProgress?: boolean
  userModel: UserModel
  videoModel?: string
  translations?: Translation[]
  buttons?: TranslationButton[]
  selectedPayment?: SessionPayment
  memory?: Memory
  attempts?: number
  amount?: number
  ru?: string
  en?: string
  lastCompletedVideoScene?: ModeEnum | null | undefined
  gender?: string
  isAdminTest?: boolean
  isSizeFresh?: boolean
  selectedResolution?: string // Добавлено для выбора разрешения Seedance (480p/1080p)
  userLanguage?: 'ru' | 'en'

  // FLUX Kontext fields
  awaitingFluxKontextImage?: boolean
  awaitingFluxKontextModel?: boolean
  awaitingFluxKontextPrompt?: boolean
  kontextImageUrl?: string
  kontextModelType?: 'pro' | 'max'
  kontextSelectedModel?: 'pro' | 'max' // Для предварительного выбора модели в сцене
  fluxKontextCameraAngle?: string // Выбранный угол камеры для профессиональной съёмки
  fluxKontextCameraSettings?: string // Расширенные настройки камеры для FLUX Kontext

  // Advanced FLUX Kontext fields
  fluxKontextMode?:
    | 'quick'
    | 'single'
    | 'multi'
    | 'portrait_series'
    | 'haircut'
    | 'landmarks'
    | 'headshot'
  fluxKontextImageA?: string // Первое изображение
  fluxKontextImageB?: string // Второе изображение для multi-image режима
  awaitingFluxKontextImageA?: boolean
  awaitingFluxKontextImageB?: boolean
  fluxKontextStep?:
    | 'mode_select'
    | 'image_a'
    | 'image_b'
    | 'prompt'
    | 'processing'

  // Upscaling fields
  lastGeneratedImageUrl?: string // URL последнего сгенерированного изображения
  lastGeneratedPrompt?: string // Промпт последнего сгенерированного изображения

  // Neurophoto upscaling fields
  lastNeuroPhotoImageUrl?: string // URL последнего нейрофото
  lastNeuroPhotoPrompt?: string // Промпт последнего нейрофото

  // Competitor monitoring fields
  competitorMonitoring?: {
    waitingForUsername?: boolean // Ожидается ли ввод username конкурента
  }

  // Avatar transformation fields
  selectedModel?: 'flux-kontext' | 'seedream4' | 'nano-banana' // Выбранная AI модель для трансформации
  selectedGender?: 'male' | 'female' // Выбранный пол для адаптации промпта трансформации
  selectedHero?: string // Выбранный герой Marvel для трансформации

  // ИИ Герои transformation fields
  aiHeroGender?: 'male' | 'female' // Выбранный пол для ИИ Герои трансформации
  aiHeroImageUrl?: string // URL фото пользователя для ИИ Герои трансформации

  // Morphing fields
  morphingType?: 'loop' | 'linear' // Тип морфинга

  // Text-to-video direct generation fields
  videoJobId?: string // ID задачи генерации видео для отслеживания статуса
  videoPrompt?: string // Промпт для генерации видео
  videoModelId?: string // ID выбранной модели (дублирует videoModel для совместимости)
  videoDuration?: number // Длительность видео в секундах (для VEO моделей)
  videoMessageId?: number // ID сообщения с прогрессом генерации
  selectedVideoModel?: string // ID выбранной модели для генерации видео (для сцены выбора длительности)
  selectedDuration?: number // Выбранная длительность для Veo 3 Fast модели
  selectedAspectRatio?: string // Выбранное соотношение сторон для Kie.ai VEO моделей
  selectedVideoCost?: number // Стоимость выбранной модели в звездах

  // LipSync specific fields
  step?: 'video' | 'audio' | 'processing'
  startTime?: number
  requestId?: string

  // AI Photoshop scene fields
  aiPhotoshopModel?: 'seedream' | 'nano_banana' | 'flux_max' | 'seedance'
  aiPhotoshopStyle?: 'portrait' | 'artistic' | 'photorealistic' | 'fantasy' | 'cyberpunk' | 'vintage' | 'custom'
  aiPhotoshopImage?: string
  aiPhotoshopPrompt?: string
  awaitingAiPhotoshopImage?: boolean
  awaitingAiPhotoshopPrompt?: boolean
  aiPhotoshopStep?: 'model_select' | 'style_select' | 'image_upload' | 'custom_prompt' | 'processing'

  // Multi-photo neurophoto fields
  multiPhotoUrls?: string[] // URLs of multiple input photos for neurophoto series
  multiPhotoCount?: number // Number of photos in multi-photo session
  awaitingMultiPhotoConfirmation?: boolean // Waiting for user confirmation to process multi-photos
  multiPhotoProcessingIndex?: number // Current index being processed in multi-photo series
}

export interface MyContext extends Context {
  match?: RegExpExecArray;
  session: MySession
  scene: Scenes.SceneContextScene<MyContext, MyWizardSession>
  wizard: Scenes.WizardContextWizard<MyContext>
  update: Update
  botInfo: any
  reply: (text: string, extra?: any) => Promise<any>
  chat: any
  from: any
  state: {
    userLanguage?: 'ru' | 'en'
    [key: string]: any
  }
}

export type MyWizardContext = MyContext & Scenes.WizardContext<MyWizardSession>

export type MyTextMessageContext = NarrowedContext<
  MyContext,
  Update.MessageUpdate<Message.TextMessage>
>

export interface ExtendedTranslationButton extends TranslationButton {
  subscription: SubscriptionType
}
