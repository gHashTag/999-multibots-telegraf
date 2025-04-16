import { ModeEnum } from './mode'

export type TransactionType =
  | 'money_income'
  | 'money_expense'
  | 'subscription_purchase'
  | 'subscription_renewal'
  | 'refund'
  | 'bonus'
  | 'referral'
  | 'system'

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface PaymentProcessParams {
  telegram_id: string
  amount: number
  stars?: number
  type: TransactionType
  description: string
  bot_name: string
  service_type: ModeEnum
}

export interface Payment {
  id: string
  telegram_id: string
  amount: number
  stars?: number
  type: TransactionType
  status: PaymentStatus
  description: string
  bot_name: string
  service_type: ModeEnum
  created_at: Date
  updated_at: Date
  operation_id?: string
  inv_id?: string
  payment_method?: string
}
