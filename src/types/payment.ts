import { ModeEnum } from './modes'
import { TelegramId } from './common'

export type TransactionType =
  | 'money_income' // Пополнение баланса
  | 'money_expense' // Списание средств
  | 'subscription_purchase' // Покупка подписки
  | 'subscription_renewal' // Продление подписки
  | 'refund' // Возврат средств
  | 'bonus' // Начисление бонуса
  | 'referral' // Реферальное начисление
  | 'system' // Системная операция

export type PaymentStatus =
  | 'PENDING' // Ожидает обработки
  | 'COMPLETED' // Успешно завершен
  | 'FAILED' // Ошибка при обработке
  | 'CANCELLED' // Отменен
  | 'REFUNDED' // Возвращен

export type PaymentMethod =
  | 'card' // Оплата картой
  | 'crypto' // Криптовалюта
  | 'balance' // Списание с баланса
  | 'system' // Системная операция
  | 'bonus' // Бонусное начисление
  | 'referral' // Реферальное начисление

export interface PaymentBase {
  telegram_id: TelegramId
  amount: number // Всегда положительное число
  stars?: number // Всегда положительное число (если указано)
  type: TransactionType // Тип транзакции
  description: string // Описание транзакции
  bot_name: string // Имя бота
  service_type: ModeEnum // Тип сервиса из ModeEnum
}

export interface Payment extends PaymentBase {
  id: string // Уникальный ID платежа
  created_at: Date // Дата создания
  updated_at: Date // Дата обновления
  status: PaymentStatus // Статус платежа
  payment_method: PaymentMethod // Метод оплаты
  operation_id?: string // ID операции (для внешних платежей)
  inv_id?: string // ID инвойса (для внешних платежей)
  error?: string // Описание ошибки (если есть)
}

export interface CreatePaymentDTO extends PaymentBase {
  payment_method: PaymentMethod
  operation_id?: string
  inv_id?: string
}

export interface UpdatePaymentDTO {
  status?: PaymentStatus
  error?: string
  stars?: number
}

export interface PaymentQuery {
  telegram_id?: TelegramId
  type?: TransactionType
  status?: PaymentStatus
  payment_method?: PaymentMethod
  service_type?: ModeEnum
  from_date?: Date
  to_date?: Date
  limit?: number
  offset?: number
}

export interface PaymentStats {
  total_income: number // Общая сумма пополнений
  total_expense: number // Общая сумма списаний
  current_balance: number // Текущий баланс
  total_transactions: number // Общее количество транзакций
  successful_transactions: number // Успешные транзакции
  failed_transactions: number // Неуспешные транзакции
  average_transaction: number // Средняя сумма транзакции
  most_used_service: ModeEnum // Самый используемый сервис
}

export interface PaymentProcessParams {
  telegram_id: string
  amount: number // ALWAYS positive number
  stars?: number // ALWAYS positive number (if specified)
  type: TransactionType
  description: string
  bot_name: string
  service_type: ModeEnum
}
