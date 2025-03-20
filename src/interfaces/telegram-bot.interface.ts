import { Context, NarrowedContext, Scenes } from 'telegraf'
import { ModelUrl, Subscription, UserModel } from './index'
import type { Update, Message } from 'telegraf/typings/core/types/typegram'
import { Buffer } from 'buffer'
import { Mode } from './cost.interface'

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
  mode: Mode
  videoModel: string
  imageUrl: string
  paymentAmount: number
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

export interface MySession extends Scenes.WizardSession<MyWizardSession> {
  email: string
  selectedModel: string
  prompt: string
  selectedSize: string
  userModel: UserModel
  numImages: number
  telegram_id: number
  mode: Mode
  attempts: number
  videoModel: string
  imageUrl: string
  videoUrl: string
  audioUrl: string
  paymentAmount: number
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
  selectedPayment: {
    amount: number
    stars: string
    subscription: Subscription
  }
}

export interface MyContext extends Context {
  session: MySession
  attempts: number
  scene: Scenes.SceneContextScene<MyContext, MyWizardSession>
  wizard: Scenes.WizardContextWizard<MyContext>
}

// Создайте новый тип, объединяющий MyContext и WizardContext
export type MyWizardContext = MyContext & Scenes.WizardContext<MyWizardSession>

export type MyTextMessageContext = NarrowedContext<
  MyContext,
  Update.MessageUpdate<Message.TextMessage>
>
