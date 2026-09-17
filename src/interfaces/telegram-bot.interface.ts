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
import type { AvatarModelId } from '@/scenes/avatarTransformScene/models'

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
  | 'helper_999_bot'
  | 'Kaya_easy_art_bot'
  | 'AI_STARS_bot'
  | 'TestNeurocoder_bot'
  | 'HaimGroupMedia_bot'
  | 'OM_AI_Digital_studio_bot'
  | 't27ai_bot'

export interface MySession extends Scenes.WizardSession<MyWizardSession> {
  cursor: number
  mode: ModeEnum | SceneId | null
  /** История переходов между сценами для кнопки "Назад" */
  navigationHistory?: string[]
  neuroPhotoInitialized?: boolean
  subscription?: SubscriptionType
  selectedSize?: string
  bypass_payment_check?: boolean
  modelSelectionShown?: boolean
  cancelHandled?: boolean
  language_code?: string
  wizardData?: any // ✅ Данные для wizard'а (шаги, фото и т.д.)
  availableModels?: any[] // ✅ Список доступных моделей для выбора
  images: BufferType
  morphingImages?: {
    buffer: Buffer
    url?: string // ✅ Оригинальный URL от Telegram для API вызовов
    filename: string
    timestamp?: number // ✅ Для правильной сортировки
    originalOrder?: number // ✅ Исходный порядок добавления
  }[] // Массив изображений для морфинга с именами файлов
  morphingButtonsMessageId?: number // ✅ ID сообщения с кнопками морфинга для обновления
  morphingProgressMessageId?: number // ✅ ID сообщения с прогрессом загрузки изображений для морфинга
  morphingProgressCreating?: boolean // reject-before-set: only one concurrent album photo creates the progress card
  morphingRestarting?: boolean // ✅ Флаг для предотвращения спама кнопки "Начать заново"
  modelName?: string
  targetUserId: number
  username?: string
  triggerWord?: string
  steps?: number
  videoUrl?: string
  audioUrl?: string
  selectedLipSyncModel?: string // ID выбранной модели lip-sync
  veedFabric?: {
    // Данные для Veed Fabric wizard
    step?: 'image' | 'text' | 'processing' | 'confirm'
    imageUrl?: string
    text?: string
    audioUrl?: string // URL голосового сообщения из Supabase
    duration?: number // Длительность в секундах
    cost?: number // Стоимость генерации в звездах
    startTime?: number
    resolution?: '480p' | '720p' // Разрешение видео
    needsVoiceCreation?: boolean // Флаг необходимости создания голоса
  }
  returnToVeedFabricAfterVoice?: boolean // Флаг возврата в Veed Fabric после создания голоса
  ttsTextToConvert?: string
  pendingTtsText?: string
  voiceMode?: 'avatar' | 'transcribe'
  lastTranscribedText?: string
  avatarPhoto?: {
    file_id: string
    unique_id: string
  }

  aiReels?: {
    // Данные для AI Reels wizard (lip-sync + WAN v2.2-5b + merging)
    step?:
      | 'image'
      | 'text'
      | 'lipsync_generation'
      | 'wan_generation'
      | 'merging'
    imageUrl?: string
    text?: string
    audioUrl?: string
    startTime?: number
    needsVoiceCreation?: boolean // Флаг необходимости создания голоса
    resolution?: '720p' | '1080p' // Разрешение видео
    useInngest?: boolean
    aspectRatio?: '16:9' | '9:16' | '1:1' // Соотношение сторон видео (по умолчанию 9:16 для соцсетей)
    firstVideoUrl?: string // URL первого видео (lip-sync)
    secondVideoUrl?: string // URL второго видео (WAN v2.2-5b)
    finalVideoUrl?: string // URL финального склеенного видео
    wan25Prompt?: string // Промпт для WAN v2.2-5b (генерируется из текста пользователя)
    wan25TaskId?: string // ID задачи WAN v2.2-5b для отслеживания
  }
  returnToAIReelsAfterVoice?: boolean // Флаг возврата в AI Reels после создания голоса

  aiReelsRender?: {
    // Данные для AI Reels Render wizard (генерация через render-server с Hedra/HeyGen/Fal)
    step?:
      | 'image'
      | 'text'
      | 'intro_text'
      | 'intro_text_2'
      | 'avatar_service'
      | 'avatar_set_selection'
      | 'processing'
      | 'cover'
    imageUrl?: string
    text?: string
    audioUrl?: string
    introText1?: string // Текст для первого поля интро
    introText2?: string // Текст для второго поля интро
    upperIntroText?: string // Верхний текст интро
    coverUrl?: string // URL обложки для видео
    avatarService?: 'hedra' | 'heygen' | 'fal' // Выбранный сервис генерации аватара
    heygenAvatarSet?: string // Выбранный набор аватаров HeyGen (cocoage/haim)
    heygenAvatarId?: string // ID выбранного аватара HeyGen
    heygenApiKey?: string // API ключ для выбранного набора аватаров HeyGen
    falApiKey?: string // API ключ для Fal
    falResolution?: '720p' | '1080p' // Разрешение для Fal
    startTime?: number
    eventId?: string // ID события Inngest для отслеживания
    estimatedDuration?: number // Оценка длительности для расчета стоимости
  }
  email?: string
  inviteCode?: string
  /** Deep-link t.me/t27ai_bot?start=foundry: показать клуб после регистрации */
  foundryDeepLink?: boolean
  /**
   * How this person said they want to pay, in the mini app's paywall, before
   * they were sent here. It may only NARROW what the bot offers -- see
   * helpers/railsForThisPerson.
   */
  payMethod?: 'robokassa' | 'stars' | 'ton'
  inviter?: string
  paymentAmount?: number
  botName?: string
  selectedImageModel?: string
  numImages?: number // Number of images to generate (1-4)
  imageGenerationPrice?: number // Price for image generation
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
  textToSpeechInProgress?: boolean
  musicGenerationInProgress?: boolean
  videoTranscriptionInProgress?: boolean
  aiPhotoshopInProgress?: boolean
  aiPhotoshopUpscaleInProgress?: boolean
  imageUpscalerInProgress?: boolean
  lipSyncInProgress?: boolean
  aiReelsInProgress?: boolean
  veedFabricInProgress?: boolean
  hedraRenderInProgress?: boolean
  heygenRenderInProgress?: boolean
  improvePromptInProgress?: boolean
  aiReelsRenderInProgress?: boolean
  instagramParserInProgress?: boolean
  instagramParserSceneInProgress?: boolean
  faceSwapInProgress?: boolean
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
  lastUpscaledImageUrl?: string // URL image already consumed by the paid upscale (replay guard)
  lastGeneratedPrompt?: string // Промпт последнего сгенерированного изображения

  // Neurophoto upscaling fields
  lastNeuroPhotoImageUrl?: string // URL последнего нейрофото
  lastNeuroPhotoPrompt?: string // Промпт последнего нейрофото

  // Competitor monitoring fields
  competitorMonitoring?: {
    waitingForUsername?: boolean // Ожидается ли ввод username конкурента
  }

  // Avatar transformation fields
  // The model list lives in one place now: scenes/avatarTransformScene/models.ts.
  // This union used to be written out by hand here as well, and it was already
  // one model behind the keyboard the person was looking at.
  selectedModel?: AvatarModelId // Выбранная AI модель для трансформации
  selectedGender?: 'male' | 'female' // Выбранный пол для адаптации промпта трансформации
  selectedHero?: string // Выбранный герой Marvel для трансформации

  // ИИ Герои transformation fields
  aiHeroGender?: 'male' | 'female' // Выбранный пол для ИИ Герои трансформации
  aiHeroImageUrl?: string // URL фото пользователя для ИИ Герои трансформации

  // Morphing fields
  morphingType?: 'loop' | 'linear' // Тип морфинга
  morphingCustomPrompt?: string // Кастомный промпт для переходов морфинга
  morphingAwaitingCustomPrompt?: boolean // Флаг ожидания ввода кастомного промпта
  // In-flight guard: set while a morphing generation is being charged/started.
  // Six buttons reach startMorphingGeneration and the charge happens inside it,
  // so without this a fast double-tap charged twice and started two jobs.
  morphingGenerationInProgress?: boolean
  // In-flight guard for the AI Cover confirm button: a double-tap otherwise
  // charged twice and generated two covers (same shape as morphing above).
  aiCoverGenerationInProgress?: boolean
  // In-flight guard for the voice-avatar wizard: step 2 runs createVoiceAvatar
  // (levels the user up, creates an ElevenLabs voice, writes voice_id) and does
  // not advance until it resolves, so a second voice message during that window
  // ran it again — double level-up and a second, orphaned ElevenLabs voice.
  voiceAvatarInProgress?: boolean
  // In-flight guard for the AI chat wizard: conversationStep calls the paid
  // chatWithAI (a Replicate prediction, ~30s) once per message with no
  // serialization, so a user sending several messages in quick succession
  // fired several concurrent paid predictions on the platform token.
  aiChatInProgress?: boolean
  // In-flight guard for the chat-with-avatar wizard: processUserMessage calls
  // answerAi (which charges the user via processBalanceOperation on the Nano
  // Banana image path) plus paid voice generation, and step 2 stays active
  // until it resolves, so a second message during that window double-charged
  // the image path and ran a second paid voice.
  chatWithAvatarInProgress?: boolean
  // In-flight guard for the image-to-prompt wizard: step 2 runs
  // generateImageToPrompt, which charges the user (MONEY_OUTCOME) and runs the
  // full caption pipeline, and only leaves after it resolves. A second photo
  // sent during that window ran it again — a double charge and two results.
  imageToPromptInProgress?: boolean
  // In-flight guard for the text-to-image wizard. Both the prompt step and the
  // repeat-generation button step call generateTextToImageDirect, which charges
  // the user (processBalanceOperation). The button step deliberately stays put
  // for repeat taps, so a second tap during a generation charged twice and
  // produced two batches. Same shape as the sibling guards.
  textToImageInProgress?: boolean
  imageToVideoInProgress?: boolean
  textToVideoInProgress?: boolean

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
  aiPhotoshopModel?:
    | 'seedream'
    | 'nano_banana'
    | 'nano_banana_pro'
    | 'seedream_45'
    | 'flux_multi_kontext'
    | 'qwen_edit_plus'
    | 'flux_kontext_pro'
    | 'flux_kontext_max'
    | 'seededit_3'
    | 'qwen_image_edit'
    | 'all_models'
  aiPhotoshopStyle?:
    | 'portrait'
    | 'artistic'
    | 'photorealistic'
    | 'fantasy'
    | 'cyberpunk'
    | 'vintage'
    | 'custom'
  aiPhotoshopImage?: string
  aiPhotoshopPrompt?: string
  aiPhotoshopSize?: '1K' | '2K' | '4K' | 'custom'
  aiPhotoshopAspectRatio?:
    | '1:1'
    | '16:9'
    | '9:16'
    | '4:3'
    | '3:4'
    | '21:9'
    | '9:21'
  aiPhotoshopVariationsCount?: number
  awaitingAiPhotoshopImage?: boolean
  awaitingAiPhotoshopPrompt?: boolean
  aiPhotoshopStep?:
    | 'model_select'
    | 'style_select'
    | 'size_ratio_select'
    | 'image_upload'
    | 'custom_prompt'
    | 'processing'
    | 'quality_selection'

  // 🎬 AI Photoshop camera control fields (transferred from FLUX Kontext)
  aiPhotoshopCameraAngle?:
    | 'medium_shot'
    | 'close_up'
    | 'extreme_close_up'
    | 'wide_shot'
    | 'high_angle'
    | 'low_angle'
    | 'dutch_angle'
    | 'over_shoulder'
    | 'profile_shot'
    | 'three_quarter'
    | 'bird_eye'
    | 'macro_beauty'
  aiPhotoshopLighting?:
    | 'soft_natural'
    | 'dramatic'
    | 'golden_hour'
    | 'studio'
    | 'rembrandt'
    | 'butterfly'
    | 'split'
    | 'rim'
    | 'candlelight'
    | 'neon_noir'
    | 'morning'
    | 'sunset'
  aiPhotoshopComposition?:
    | 'center_weighted'
    | 'rule_thirds'
    | 'golden_ratio'
    | 'symmetrical'
    | 'negative_space'
    | 'leading_lines'

  // URL of the saved photo already consumed by the paid "upscale last" button
  // (replay guard: a stale re-tap must not re-charge the same deterministic op)
  lastUpscaledPhotoUrl?: string
  // ✅ NEW: Dialog mode support for AI Photoshop
  savedAiPhotoshopResults?: Array<{
    url: string
    imageUrl: string // ✅ Compatibility field for dialog mode logic
    model: string
    prompt: string
    timestamp: string
    id: string
    wasAllModels?: boolean // ✅ Track if generated in all_models mode
    additionalInfo?: {
      size?: '1K' | '2K' | '4K' | 'custom'
      originalImage?: string
      isImprovement?: boolean
      fullPrompt?: string
    }
  }>
  dialogMode?: boolean
  lastPhotoTimestamp?: number // ✅ For sequential photo detection in AI Photoshop
  sessionId?: string // ✅ Session ID for Zod validation

  // Multi-photo neurophoto fields
  multiPhotoUrls?: string[] // URLs of multiple input photos for neurophoto series
  multiPhotoCount?: number // Number of photos in multi-photo session
  awaitingMultiPhotoConfirmation?: boolean // Waiting for user confirmation to process multi-photos
  multiPhotoProcessingIndex?: number // Current index being processed in multi-photo series

  // Global navigation pending scene (for deferring navigation before stage.middleware)
  pendingScene?: string | null

  // 🎯 Two-phase navigation: marked before stage, processed after stage
  __pendingNavigation?: string
}

export interface MyContext extends Context {
  match?: RegExpExecArray
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
