import { Context, NarrowedContext, Scenes } from 'telegraf'
import type { ModelUrl, UserModel } from './index'
import type { Update, Message } from 'telegraf/types'
import { Buffer } from 'buffer'

import { BroadcastContentType } from './broadcast.interface'
import { SubscriptionType } from './subscription.interface'
import type { TranslationButton } from './supabase.interface'
import type { SessionPayment } from './payments.interface'
import type { SceneContextScene, WizardContextWizard } from 'telegraf/scenes'
import { ModeEnum, type Mode } from './modes'
import type { Translation } from './translations.interface'
import type { User as TelegramUser } from '@telegraf/types'

export type BufferType = { buffer: Buffer; filename: string }[]
export interface Level {
  title_ru: string
  title_en: string
}

export interface SubscriptionButton {
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

// --- ИНТЕРФЕЙС ДЛЯ КАСТОМНЫХ ПОЛЕЙ СЕССИИ --- //
interface CustomSessionData {
  // --- Все кастомные поля --- //
  data?: string
  severity?: number
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
  botName?: BotName
  subscriptionType?: SubscriptionType
  selectedPayment?: SessionPayment
  subscription?: SubscriptionType | null
  videoUrl?: string
  email?: string
  selectedModel?: string
  prompt?: string
  selectedSize?: string
  model_type?: ModelUrl
  userModel?: UserModel
  mode?: ModeEnum
  videoModel?: string
  amount?: number
  images?: BufferType
  modelName?: string
  targetUserId?: number
  username?: string
  triggerWord?: string
  steps?: number
  memory?: Memory
  neuroPhotoInitialized?: boolean
  bypass_payment_check?: boolean
  audioUrl?: string
  inviteCode?: string
  inviter?: string
  paymentAmount?: number
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
  translations?: Translation[]
  buttons?: TranslationButton[]
  attempts?: number
  ru?: string
  en?: string
  lastCompletedVideoScene?: ModeEnum | null | undefined
  gender?: string
  imageId?: string
  imagePrompt?: string
  chatMessage?: string
  videoPrompt?: string
  videoId?: string
  currentCost?: number
  currentMode?: ModeEnum
  mySessionProp?: number
  current_action?: string
  is_morphing?: boolean
  payment_method?: string
  imageAUrl?: string
  imageBUrl?: string
}

// --- ОСНОВНОЙ ТИП СЕССИИ МАСТЕРА --- //
// Снова создаем MyWizardSession, объединяя стандартные и кастомные
interface MyWizardSession extends Scenes.WizardSessionData, CustomSessionData {}

// --- КОНТЕКСТ --- //
export interface MyContext
  extends Context,
    Scenes.SessionContext<MyWizardSession> {
  // session теперь унаследован от SessionContext<MyWizardSession>
  scene: Scenes.SceneContextScene<MyContext, MyWizardSession>
  wizard: WizardContextWizard<MyContext>
  update: Update.MessageUpdate | Update.CallbackQueryUpdate
  botName?: BotName
}

// Тип для WizardContext
export type MyWizardContext = MyContext & Scenes.WizardContext<MyWizardSession>

// Тип для текстовых сообщений (без изменений)
export type MyTextMessageContext = NarrowedContext<
  MyContext,
  Update.MessageUpdate<Message.TextMessage>
>

export interface ExtendedTranslationButton extends TranslationButton {
  subscription: SubscriptionType
}
