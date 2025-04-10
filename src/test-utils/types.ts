/**
 * Интерфейс результата теста
 */
export interface TestResult {
  /** Успешно ли выполнен тест */
  success: boolean
  /** Имя теста */
  name: string
  /** Сообщение о результате теста */
  message: string
  /** Подробности выполнения теста (опционально) */
  details?: any
}

/**
 * Тип функции для запуска теста
 */
export type TestFunction = () => Promise<TestResult>

/**
 * Интерфейс для события платежа
 */
export interface PaymentProcessEvent {
  name: 'payment/process'
  data: {
    /** Telegram ID пользователя */
    telegram_id: string
    /** Сумма платежа (всегда положительное число) */
    amount: number
    /** Количество звезд (всегда положительное число, если указано) */
    stars?: number
    /** Тип транзакции */
    type: TransactionType
    /** Описание транзакции */
    description: string
    /** Имя бота */
    bot_name: string
    /** Тип сервиса из ModeEnum */
    service_type?: string
  }
}

/**
 * Типы транзакций
 */
export type TransactionType =
  | 'money_expense'
  | 'money_income'
  | 'subscription_purchase'
  | 'subscription_renewal'
  | 'refund'
  | 'bonus'
  | 'referral'
  | 'system'

/**
 * Интерфейс для мока функции
 */
export type MockFunction<T = any, R = any> = (...args: T[]) => R
