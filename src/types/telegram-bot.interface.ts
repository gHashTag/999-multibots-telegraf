import { Context, Scenes } from 'telegraf'
import { Update, CallbackQuery } from 'telegraf/typings/core/types/typegram'
import { LocalSubscription } from './subscription'

export interface SubscriptionButton {
  text: string
  callback_data: string
  row: number
  stars_price: number
  en_price: number
  ru_price: number
  description: string
}

interface SceneSession extends Scenes.SceneSessionData {
  isRu?: boolean
  buttons?: Array<{
    text: string
    callback_data: LocalSubscription
  }>
  subscription?: LocalSubscription
  selectedPayment?: {
    amount: number
    stars: number
    subscription?: LocalSubscription
    type: string
  }
}

interface SceneContext extends Context<Update> {
  session: SceneSession
  scene: Scenes.SceneContextScene<SceneContext>
  match?: RegExpExecArray
  callbackQuery?: CallbackQuery.DataQuery
}

export { SceneContext, SceneSession }
