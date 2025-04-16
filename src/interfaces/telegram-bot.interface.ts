import { Context, NarrowedContext, Scenes } from 'telegraf'
import { ModelUrl, UserModel } from './index'
import type { Update, Message } from 'telegraf/typings/core/types/typegram'
import { Buffer } from 'buffer'
import { Mode } from './cost.interface'
import { BroadcastContentType } from './broadcast.interface'
import { SubscriptionType, TransactionType } from './payments.interface'
import { TelegramId } from '@/interfaces/telegram.interface'
import { Subscription } from '@/types/subscription'
import { TranslationButton } from './supabase.interface'
import { DigitalAvatarModel } from './digital-avatar.interface'

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
    subscription: string
  }
  subscription?: string
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
export interface MySession extends Scenes.WizardSession<MyWizardSession> {
  memory?: Memory
  email: string
  selectedModel: string
  prompt: string
  selectedSize: string
  userModel: UserModel
  numImages: number
  telegram_id: TelegramId
  mode: Mode
  attempts: number
  videoModel: string
  imageUrl: string
  videoUrl: string
  audioUrl: string
  amount: number
  subscription: SubscriptionType | 'stars'
  images: BufferType
  modelName: string
  targetUserId: number
  username: string
  triggerWord: string
  steps: number
  inviter: string
  inviteCode: string
  invoiceURL: string
  buttons: Button[]
  bypass_payment_check: boolean
  text?: string
  selectedPayment: {
    amount: number
    stars: number
    subscription?: SubscriptionType | 'stars'
    type: TransactionType
  }
  is_ru: boolean
  selectedAvatarModel?: DigitalAvatarModel
}

export interface MyContext extends Context<Update> {
  session: MySession
  scene: Scenes.SceneContextScene<MyContext, MySessionData>
  wizard: Scenes.WizardContextWizard<MyContext>
  attempts: number

  user: {
    id: number
    username: string
  }
}

// Создайте новый тип, объединяющий MyContext и WizardContext
export type MyWizardContext = MyContext & Scenes.WizardContext<MyWizardSession>

export type MyTextMessageContext = NarrowedContext<
  MyContext,
  Update.MessageUpdate<Message.TextMessage>
>

export interface ExtendedTranslationButton extends TranslationButton {
  subscription: Subscription
}
