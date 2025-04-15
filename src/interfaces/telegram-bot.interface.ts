import { Context, NarrowedContext, Scenes } from 'telegraf'
import { ModelUrl } from './index'
import type { Update, Message } from 'telegraf/typings/core/types/typegram'
import { Buffer } from 'buffer'
import { BroadcastContentType } from '@/scenes/broadcastWizard'
import { TelegramId } from '@/types/common'
import { PaymentSubscription } from './payments.interface'

export type BufferType = { buffer: Buffer; filename: string }[]

export interface MySessionData extends Scenes.WizardSessionData {
  cursor: number
  email?: string
  selectedModel?: string
  prompt?: string
  selectedSize?: string
  selectedPayment?: {
    amount: number
    stars: number
    subscription?: PaymentSubscription
  }
  subscription?: PaymentSubscription
  buttons?: Array<{
    text: string
    callback_data: string
    stars_price?: number
  }>
  text?: string
  model_type?: ModelUrl
  broadcast?: {
    type: BroadcastContentType
    content: string
  }
  __scenes: Record<string, unknown>
}

export interface MySession extends Scenes.WizardSession<MySessionData> {
  cursor: number
  state: MySessionData
  subscription?: PaymentSubscription
  selectedPayment?: {
    amount: number
    stars: number
    subscription?: PaymentSubscription
  }
}

export interface MyContext extends Context<Update> {
  session: MySession
  scene: Scenes.SceneContextScene<MyContext, MySessionData>
  wizard: Scenes.WizardContextWizard<MyContext>
  attempts: number
  amount: number
  user: {
    id: TelegramId
    username?: string
  }
}

export type MyWizardContext = MyContext & Scenes.WizardContext<MySession>

export type MyTextMessageContext = NarrowedContext<
  MyContext,
  Update.MessageUpdate<Message.TextMessage>
>
