import type { ModeEnum } from '@/interfaces/modes'
import type { TelegramId } from './telegram.interface'
import type { SubscriptionType } from './subscription.interface'

export interface SelectedPayment {
  amount: number
  stars: number
  subscription: SubscriptionType | null
  type?: PaymentType
}

/**
 * Результат операции с балансом
 */
export interface BalanceOperationResult {
  newBalance: number
  paymentAmount: number
  success: boolean
  error?: string
  currentBalance?: number
}
/**
 * Платежные системы
 */
export type PaymentMethod =
  | 'Telegram'
  | 'Robokassa'
  | 'System'
  | 'Unknown'
  | 'Manual'

/**
 * Статусы платежей
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentType {
  MONEY_INCOME = 'MONEY_INCOME',
  MONEY_OUTCOME = 'MONEY_OUTCOME',
  BONUS = 'BONUS',
  REFUND = 'REFUND',
}

export interface BasePayment {
  telegram_id: TelegramId
  amount: number
  stars?: number
  type: PaymentType
  description: string
  bot_name: string
  service_type: ModeEnum
  payment_method?: string
  operation_id?: string
  inv_id?: string
  status: PaymentStatus
  metadata?: Record<string, any>
  subscription: SubscriptionType | null
}

export interface Payment extends BasePayment {
  id: string
  payment_id: number
  created_at: string
  updated_at: string
}

export interface PaymentCreateParams extends Omit<BasePayment, 'status'> {
  telegram_id: TelegramId
  amount: number
  stars?: number
  type: PaymentType
  description: string
  bot_name: string
  service_type: ModeEnum
  payment_method?: string
  operation_id?: string
  inv_id?: string
  metadata?: Record<string, any>
  currency: Currency
}

export interface PaymentProcessResult {
  success: boolean
  message: string
  payment?: Payment
  error?: string
}

export const PAYMENT_ERROR_MESSAGES = {
  INVALID_AMOUNT: 'Invalid payment amount',
  DUPLICATE_PAYMENT: 'Duplicate payment detected',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
  SYSTEM_ERROR: 'System error occurred',
  INVALID_PAYMENT_TYPE: 'Invalid payment type',
  PAYMENT_NOT_FOUND: 'Payment not found',
} as const

export const PAYMENT_SUCCESS_MESSAGES = {
  PAYMENT_CREATED: 'Payment created successfully',
  PAYMENT_COMPLETED: 'Payment completed successfully',
  PAYMENT_CANCELLED: 'Payment cancelled successfully',
  BALANCE_UPDATED: 'Balance updated successfully',
} as const

/**
 * Преобразует тип транзакции из enum с заглавными буквами
 * в нижний регистр для совместимости с БД
 *
 * ПРИМЕЧАНИЕ: Эта функция остается для обратной совместимости,
 * теперь значения PaymentType уже в нижнем регистре
 */
export function normalizeTransactionType(type: PaymentType | string): string {
  // Простое приведение к строке и нижнему регистру
  return (type as string).toLowerCase()
}

/**
 * Параметры для события обработки платежа
 * Используется для строгой типизации входных данных платежного процессора
 */
export interface PaymentProcessParams {
  /** ID пользователя в Telegram (обязательно) */
  telegram_id: string

  /** Сумма операции (ВСЕГДА положительное число) */
  amount: number

  /** Количество звезд (ВСЕГДА положительное число, если указано) */
  stars?: number

  /** Тип транзакции из PaymentType */
  type: PaymentType | string

  /** Описание транзакции */
  description: string

  /** Название бота, который инициировал транзакцию */
  bot_name: string

  /** ID инвойса (используется для предотвращения дублирования платежей) */
  inv_id?: string

  /** Дополнительные метаданные платежа */
  metadata?: Record<string, any>

  /** Тип сервиса из ModeEnum */
  service_type: ModeEnum

  /** Тип подписки */
  subscription: SubscriptionType | null
}

/**
 * Результат операции с балансом
 */
export interface BalanceOperationResult {
  /** Успешность операции */
  success: boolean
  /** Ошибка, если операция не удалась */
  error?: string
  /** Новый баланс после операции */
  newBalance: number
  /** Стоимость операции */
  modePrice: number
  /** Текущий баланс до операции */
  currentBalance?: number
}

export interface SessionPayment {
  amount: number
  stars: number
  subscription: SubscriptionType | null
  type?: PaymentType
}

export enum Currency {
  XTR = 'XTR', // Telegram Stars
  RUB = 'RUB', // Russian Ruble
}
