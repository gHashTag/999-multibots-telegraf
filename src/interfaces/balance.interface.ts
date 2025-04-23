import { PaymentType } from './payments.interface'
import { ModeEnum } from './modes'

export interface BalanceOperation {
  telegram_id: string
  amount: number
  stars?: number
  type: PaymentType
  description: string
  bot_name: string
  service_type: ModeEnum
}

export interface BalanceOperationResult {
  success: boolean
  message: string
  balance?: number
  error?: any
}

export interface BalanceCheck {
  telegram_id: string
  required_amount: number
  service_type: ModeEnum
}

export interface BalanceCheckResult {
  success: boolean
  message: string
  current_balance: number
  required_amount: number
  has_sufficient_funds: boolean
}

export interface BalanceUpdateParams {
  telegram_id: string
  amount: number
  type: PaymentType
  description: string
  service_type: ModeEnum
}

export interface BalanceUpdateResult {
  success: boolean
  message: string
  new_balance: number
  previous_balance: number
  amount_changed: number
}

// Константы для сообщений об ошибках баланса
export const BALANCE_ERROR_MESSAGES = {
  INSUFFICIENT_FUNDS: 'Недостаточно средств на балансе',
  INVALID_AMOUNT: 'Некорректная сумма операции',
  USER_NOT_FOUND: 'Пользователь не найден',
  OPERATION_FAILED: 'Ошибка при выполнении операции с балансом',
  SYSTEM_ERROR: 'Системная ошибка при работе с балансом',
}

// Константы для успешных сообщений
export const BALANCE_SUCCESS_MESSAGES = {
  BALANCE_UPDATED: 'Баланс успешно обновлен',
  BALANCE_CHECKED: 'Проверка баланса выполнена успешно',
  SUFFICIENT_FUNDS: 'Достаточно средств для операции',
  OPERATION_COMPLETED: 'Операция с балансом выполнена успешно',
}
