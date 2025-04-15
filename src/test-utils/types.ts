import { ModeEnum } from '@/interfaces/modes'
import { TransactionType } from '@/interfaces/payments.interface'

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

  /** Категория теста */
  category?: string

  /** Сообщение об ошибке (если тест не пройден) */
  error?: string

  /** Дополнительные детали теста */
  details?: Record<string, unknown>

  /** Дополнительные данные (опционально) */
  data?: any
}

/**
 * Типы для тестовых моков
 */
export interface MockFunction<T = unknown, R = unknown> {
  (...args: T[]): R
  mock: {
    calls: T[][]
    results: R[]
    instances: unknown[]
  }
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
export interface PaymentProcessEvent extends TestEvent {
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
    service_type?: ModeEnum
  }
}

/**
 * Тестовое событие
 */
export interface TestEvent {
  /** Название события */
  name: string

  /** Данные события */
  data: {
    /** ID пользователя в Telegram */
    telegram_id?: string

    /** Сумма транзакции */
    amount?: number

    /** Количество звезд */
    stars?: number

    /** Тип транзакции */
    type?: TransactionType

    /** Описание */
    description?: string

    /** Название бота */
    bot_name?: string

    /** Тип сервиса */
    service_type?: ModeEnum

    /** Дополнительные данные */
    [key: string]: any
  }

  /** Временная метка */
  timestamp?: number
}

/**
 * Конфигурация тестового окружения
 */
export interface TestConfig {
  /** Тестовые суммы */
  amounts: {
    small: number
    medium: number
    large: number
  }

  /** Конвертация в звезды */
  starConversion: {
    rate: number
  }

  /** Тестовые сервисы */
  services: ModeEnum[]

  /** Тестовые статусы */
  statuses: string[]

  /** Тестовые методы оплаты */
  paymentMethods: string[]

  /** Типы транзакций */
  transactionTypes: TransactionType[]

  /** Тестовый пользователь */
  testUser: {
    initialBalance: number
    language: string
    botName: string
  }

  /** Настройки уведомлений */
  notifications: {
    adminChannelId: string
    templates: {
      ru: {
        success: string
        failed: string
      }
      en: {
        success: string
        failed: string
      }
    }
  }
}

export interface TestState {
  events: TestEvent[]
  lastEventId: number
}

export interface InngestTestEngine {
  clearEvents(): Promise<void>
  sendEvent(event: TestEvent): Promise<void>
  getEventsByName(name: string): TestEvent[]
  waitForEvent(name: string, timeout: number): Promise<TestEvent | null>
  executeQuery(query: string): Promise<unknown>
  cleanup(): Promise<void>
}
