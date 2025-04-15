import { ModeEnum } from './modes'

interface BaseEventData {
  telegram_id: string
  service_type: string | ModeEnum
}

interface VoiceToTextData extends BaseEventData {
  fileUrl: string
}

export interface PaymentEventData extends BaseEventData {
  amount: number
  stars?: number
  type:
    | 'money_income'
    | 'money_expense'
    | 'subscription_purchase'
    | 'subscription_renewal'
    | 'refund'
    | 'bonus'
    | 'referral'
    | 'system'
  description: string
  bot_name: string
  service_type: ModeEnum
  invoice_id?: string
}

export interface InngestEvent<T = any> {
  name: string
  data: T extends void ? PaymentEventData | VoiceToTextData : T
  id?: string
  ts?: number
}

export interface ProcessedEvent extends InngestEvent {
  processed: boolean
  error?: string
}

export interface TestEngineState {
  events: InngestEvent[]
  processedEvents: ProcessedEvent[]
}
