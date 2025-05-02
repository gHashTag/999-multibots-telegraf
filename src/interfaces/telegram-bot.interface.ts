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
export interface MySession extends Scenes.WizardSession<WizardSessionData> {
  cursor: number
  mode: ModeEnum
  neuroPhotoInitialized?: boolean
  subscription?: SubscriptionType
  selectedSize?: string
  bypass_payment_check?: boolean
  images: BufferType
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
  prompt?: string
  userModel: UserModel
  selectedModel?: string
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
}

export interface MyContext extends Context {
  session: MySession
  scene: SceneContextScene<MyContext, WizardSessionData>
  wizard: WizardContextWizard<MyContext>
  update: Update.MessageUpdate | Update.CallbackQueryUpdate
}

// Создайте новый тип, объединяющий MyContext и WizardContext
export type MyWizardContext = MyContext & Scenes.WizardContext<MyWizardSession>

export type MyTextMessageContext = NarrowedContext<
  MyContext,
  Update.MessageUpdate<Message.TextMessage>
>

export interface ExtendedTranslationButton extends TranslationButton {
  subscription: SubscriptionType
}
