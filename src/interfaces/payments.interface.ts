import { ModeEnum } from '@/interfaces/modes'
import { TelegramId } from './telegram.interface'
import { SubscriptionType } from './subscription.interface'

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
export enum PaymentMethod {
  TELEGRAM = 'Telegram',
  ROBOKASSA = 'Robokassa',
  SYSTEM = 'System',
  UNKNOWN = 'Unknown',
  MANUAL = 'Manual',
  CRYPTOBOT = 'CryptoBot',
  X402 = 'X402',
  TON_USDT = 'TON_USDT', // USDT on TON blockchain
  TON_NATIVE = 'TON_NATIVE', // Native TON coin
}

/**
 * Статусы платежей
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Типы платежных операций.
 * ВАЖНО: Значения должны соответствовать enum `operation_type` в базе данных Supabase.
 *
 * SERVICE_PAYMENT ОТСЮДА УБРАН, и добавлять его обратно нельзя.
 *
 * Записи проверяются схемой CreatePaymentV2Schema, а её OperationTypeEnum
 * (src/interfaces/zod/payment.zod.ts) такого значения не знает. Три визарда —
 * hedra, heygen, fal — годами звали updateUserBalance с этим типом: zod бросал,
 * функция возвращала false, возвращаемое значение никто не проверял, генерация
 * шла дальше. В payments_v2 ровно 0 строк с service_type hedra_render,
 * ai_reels_heygen и fal_render — списания не было ни разу.
 *
 * Если понадобится отдельный тип для оплаты услуг, сначала заведите его в
 * OperationTypeEnum И в балансовой функции get_user_balance (она живёт внутри
 * базы, её определения в репозитории нет). Иначе новый тип попадёт в ветку
 * «всё, что не MONEY_OUTCOME» и будет НАЧИСЛЯТЬ деньги вместо списания —
 * проверено опытным путём, scripts/probe-balance-formula.cjs.
 */
export enum PaymentType {
  MONEY_INCOME = 'MONEY_INCOME',
  MONEY_OUTCOME = 'MONEY_OUTCOME',
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
  /**
   * The failure was "not enough stars", not "unknown model" or a database
   * hiccup. Callers send `error` for ANY failure, so without this they cannot
   * tell which of them deserves a top-up button -- and attaching one to
   * "unknown model" would be worse than attaching none.
   *
   * NOTE for the next reader: this interface is declared twice in this file
   * (line 15 and here) and once more in balance.interface.ts. TypeScript merges
   * same-name interfaces in one scope, so it works; it still reads like a
   * mistake. Left alone -- unifying them is a separate change.
   */
  insufficientFunds?: boolean
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
  USDC = 'USDC', // USD Coin (x402 on Base)
  USDT_TON = 'USDT_TON', // USDT on TON blockchain
  TON = 'TON', // Native TON coin
}
