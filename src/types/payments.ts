import { ModeEnum } from './enums'

export enum TransactionType {
  MONEY_INCOME = 'money_income',
  MONEY_EXPENSE = 'money_expense',
  SUBSCRIPTION_PURCHASE = 'subscription_purchase',
  SUBSCRIPTION_RENEWAL = 'subscription_renewal',
  REFUND = 'refund',
  BONUS = 'bonus',
  REFERRAL = 'referral',
  SYSTEM = 'system',
}

export interface PaymentProcessParams {
  telegram_id: string
  amount: number
  stars?: number
  type: TransactionType
  description: string
  bot_name: string
  service_type: ModeEnum
}

export interface TestPayment {
  telegram_id: string
  amount: number
  type: TransactionType
  description: string
  bot_name: string
  service_type: ModeEnum
}

export interface PaymentConfig {
  TEST_USER_ID: string
  TEST_AMOUNT: number
  TEST_DESCRIPTION: string
  TEST_BOT_NAME: string
}
