import { TelegramId } from '@/interfaces/telegram.interface'
import { Context, NarrowedContext, Scenes } from 'telegraf'
import { ModelUrl, Subscription, UserModel } from './index'
import type { Update, Message } from 'telegraf/typings/core/types/typegram'
import { Buffer } from 'buffer'
import { Mode } from './cost.interface'
import { BroadcastContentType } from '@/scenes/broadcastWizard'
import { LocalSubscription } from '@/scenes/getRuBillWizard'

export type BufferType = { buffer: Buffer; filename: string }[]
export interface Level {
  title_ru: string
  title_en: string
}

export interface SessionData {
  selectedModel: string
  text: string
  model_type: ModelUrl
  selectedSize: string
  userModel: UserModel
  mode: Mode | null
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

export interface MySession extends Scenes.WizardSession<MyWizardSession> {
  memory?: Memory
  email: string
  selected_model: string
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
  subscription: Subscription
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
  text?: string
  language_code: string
  targetScene: Mode
  is_ru: boolean
  selectedPayment: {
    amount: number
    stars: number
    subscription?: LocalSubscription
  }
}

export interface MyContext extends Context {
  session: MySession
  attempts: number
  scene: Scenes.SceneContextScene<MyContext, MyWizardSession>
  wizard: Scenes.WizardContextWizard<MyContext>
  amount: number
  match?: RegExpMatchArray
}

// Создайте новый тип, объединяющий MyContext и WizardContext
export type MyWizardContext = MyContext & Scenes.WizardContext<MyWizardSession>

export type MyTextMessageContext = NarrowedContext<
  MyContext,
  Update.MessageUpdate<Message.TextMessage>
>
