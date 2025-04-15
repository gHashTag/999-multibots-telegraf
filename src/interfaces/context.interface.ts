import { Context, Scenes } from 'telegraf'
import { Update, Message } from 'telegraf/typings/core/types/typegram'
import { SceneContextScene } from 'telegraf/typings/scenes'
import { TranslationButton } from './supabase.interface'
import { LocalSubscription } from '@/types/subscription'
import { Payment } from './payments.interface'

interface ExtendedTranslationButton extends TranslationButton {
  subscription: LocalSubscription
}

interface MyWizardSession extends Scenes.WizardSessionData {
  selectedPayment?: Payment
  subscription?: LocalSubscription
  buttons?: ExtendedTranslationButton[]
  // ... остальные поля сессии
}

interface MySession extends Scenes.WizardSession<MyWizardSession> {
  // здесь можно добавить дополнительные поля сессии
}

export interface MyContext extends Context<Update> {
  scene: SceneContextScene<MyContext, MyWizardSession>
  session: MySession
  wizard: Scenes.WizardContextWizard<MyContext>
  update: Update.CallbackQueryUpdate | Update.MessageUpdate
  message: Update.New & Update.NonChannel & Message
}
