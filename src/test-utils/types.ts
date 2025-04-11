/**
 * Интерфейс результата выполнения теста
 */
export interface TestResult {
  /** Успешность выполнения теста */
  success: boolean

  /** Название теста */
  name: string

  /** Сообщение о результате выполнения */
  message: string

  /** Дополнительные детали теста */
  details?: any
}

/**
 * Типы для тестовых моков
 */
export interface MockFunction<Args = any, ReturnValue = any> {
  (...args: Args[]): ReturnValue
  calls: Args[][]
  returnValue: ReturnValue
  mockReturnValue: (value: ReturnValue) => MockFunction<Args, ReturnValue>
  mockClear: () => MockFunction<Args, ReturnValue>
}

/**
 * Функция тестирования
 */
export type TestFunction = () => Promise<TestResult>

/**
 * Параметры запуска тестов
 */
export interface TestRunOptions {
  /** Категория тестов для запуска */
  category?: string

  /** Обнаружить и запустить все доступные тесты */
  discover?: boolean

  /** Запустить тесты в параллельном режиме */
  parallel?: boolean

  /** Таймаут выполнения теста в миллисекундах */
  timeout?: number
}

/**
 * Результаты выполнения группы тестов
 */
export interface TestRunResults {
  /** Общее количество тестов */
  total: number

  /** Количество успешных тестов */
  passed: number

  /** Количество неуспешных тестов */
  failed: number

  /** Полные результаты тестов */
  results: TestResult[]

  /** Время выполнения в миллисекундах */
  duration: number
}

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
