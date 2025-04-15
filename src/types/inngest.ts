import { ModeEnum } from './modes'

export interface InngestEvent<T = any> {
  name: string
  data: T
  ts?: number
  id?: string
  'voice/to-text'?: {
    fileUrl: string
    telegram_id: string
    service_type: string
  }
}

export interface PaymentEventData {
  telegram_id: string
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
}

export interface ProcessedEvent extends InngestEvent {
  processed: boolean
  error?: string
}

export interface TestEngineState {
  events: InngestEvent[]
  processedEvents: ProcessedEvent[]
}
