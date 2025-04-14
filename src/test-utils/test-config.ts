// import { Inngest } from 'inngest'
// import fetch from 'node-fetch'
import { ModeEnum } from '../interfaces/modes'
import { logger } from '../utils/logger'
import { MockTelegraf } from './mocks/botMock'
import { MyContext } from '../interfaces'
import { Telegraf } from 'telegraf'
import { TestConfig, TestRunnerConfig } from '../types/test'

/**
 * Константы для конфигурации тестов
 *
 * @module src/test-utils/test-config
 */

/**
 * Класс для эмуляции Inngest тестового движка в тестах
 */
export class InngestTestEngineMock {
  /**
   * Список отправленных событий для мониторинга
   */
  public sentEvents: { name: string; data: any; timestamp: number }[] = []

  /**
   * Отправляет событие в Inngest (мок)
   *
   * @param eventName - Имя события
   * @param data - Данные события
   * @returns Promise<boolean> - Результат отправки
   */
  async sendEvent(eventName: string, data: any): Promise<boolean> {
    console.log(
      `🚀 [TEST_ENGINE_MOCK]: Отправка события "${eventName}" с данными:`,
      data
    )

    // Проверка обязательных полей для платежных операций
    if (eventName === 'payment/process') {
      if (!data.telegram_id) {
        console.log(
          '❌ [TEST_ENGINE_MOCK]: Отсутствует обязательное поле telegram_id'
        )
        throw new Error('Отсутствует обязательное поле telegram_id')
      }

      if (!data.amount && data.amount !== 0) {
        console.log(
          '❌ [TEST_ENGINE_MOCK]: Отсутствует обязательное поле amount'
        )
        throw new Error('Отсутствует обязательное поле amount')
      }

      if (!data.type) {
        console.log('❌ [TEST_ENGINE_MOCK]: Отсутствует обязательное поле type')
        throw new Error('Отсутствует обязательное поле type')
      }

      if (data.amount < 0) {
        console.log(
          '❌ [TEST_ENGINE_MOCK]: Сумма платежа должна быть положительной'
        )
        throw new Error('Сумма платежа должна быть положительной')
      }

      if (data.stars < 0) {
        console.log(
          '❌ [TEST_ENGINE_MOCK]: Количество звезд должно быть положительным'
        )
        throw new Error('Количество звезд должно быть положительным')
      }

      console.log(
        `✅ [TEST_ENGINE_MOCK]: Платежное событие "${eventName}" успешно создано для пользователя ${data.telegram_id}, сумма: ${data.amount} звезд, тип: ${data.type}`
      )
    }

    // Добавляем событие в список отправленных
    this.sentEvents.push({
      name: eventName,
      data,
      timestamp: Date.now(),
    })

    return true
  }

  /**
   * Получает все отправленные события указанного типа
   *
   * @param eventName - Имя события
   * @returns Array - Массив отправленных событий
   */
  getEventsByName(
    eventName: string
  ): { name: string; data: any; timestamp: number }[] {
    return this.sentEvents.filter(event => event.name === eventName)
  }

  /**
   * Очищает историю отправленных событий
   */
  clearEvents(): void {
    this.sentEvents = []
    console.log('🧹 [TEST_ENGINE_MOCK]: История событий очищена')
  }
}

/**
 * Конфигурация тестов
 */
export const TEST_CONFIG: TestRunnerConfig = {
  parallel: false,
  stopOnFirstFailure: false,
  timeouts: {
    default: 5000, // 5 seconds
    long: 30000,   // 30 seconds
    short: 1000    // 1 second
  },
  retries: {
    default: 2,
    max: 5,
    min: 0
  },
  logging: {
    level: 'info',
    emoji: true
  }
}

// Тестовые константы
export const TEST_CONSTANTS = {
  // Тестовые данные пользователя
  USER: {
    telegram_id: '123456789',
    username: 'test_user',
    first_name: 'Test',
    last_name: 'User'
  },
  
  // Тестовые данные для платежей
  PAYMENT: {
    amount: 100,
    stars: 1000,
    type: 'money_income',
    description: 'Test payment',
    bot_name: 'test_bot',
    service_type: 'TopUpBalance'
  },
  
  // Тестовые данные для задач
  TASK: {
    id: 'test-task-id',
    type: 'test',
    data: {
      prompt: 'Test prompt',
      model: 'gpt-3.5-turbo'
    }
  },
  
  // Тестовые данные для агентов
  AGENT: {
    id: 'test-agent-id',
    name: 'TestAgent',
    type: 'test',
    status: 'ready'
  }
}

// Вспомогательные функции для тестов
export const TEST_UTILS = {
  // Генерация случайного ID
  generateId: () => Math.random().toString(36).substring(7),
  
  // Задержка выполнения
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Создание мок-функции
  createMockFn: () => {
    const fn = () => {}
    fn.calls = [] as any[]
    fn.mockImplementation = (impl: Function) => {
      fn.implementation = impl
      return fn
    }
    fn.mockReset = () => {
      fn.calls = []
      fn.implementation = undefined
    }
    return fn
  }
}

// Test runner configuration
export const TEST_RUNNER_CONFIG = {
  parallel: true, // Run tests in parallel
  stopOnFirstFailure: false,
  timeout: TEST_CONFIG.timeouts.default,
  retries: TEST_CONFIG.retries.default
}

// Test environment configuration
export const TEST_ENV = {
  isCI: process.env.CI === 'true',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
}

// Создаем и экспортируем тестовый движок Inngest
export const inngestTestEngine = {
  events: [] as any[],
  clearEvents: () => {
    inngestTestEngine.events = []
    logger.info('🧹 [TEST_ENGINE_MOCK]: История событий очищена')
  },
  sendEvent: async (name: string, data: any) => {
    const event = { name, data }
    inngestTestEngine.events.push(event)

    // Вывод информации о событии
    if (name === 'payment/process') {
      logger.info(
        `🚀 [TEST_ENGINE_MOCK]: Отправка события "${name}" с данными:`,
        data
      )
      logger.info(
        `✅ [TEST_ENGINE_MOCK]: Платежное событие "${name}" успешно создано для пользователя ${data.telegram_id}, сумма: ${data.stars} звезд, тип: ${data.type}`
      )
    } else {
      logger.info(
        `🚀 [TEST_ENGINE_MOCK]: Отправка события "${name}" с данными:`,
        data
      )
    }

    return { success: true, event }
  },
  getEventsByName: (name: string) => {
    return inngestTestEngine.events.filter(event => event.name === name)
  },
  getEventsForTelegramId: (telegramId: string) => {
    return inngestTestEngine.events.filter(
      event => event.data?.telegram_id === telegramId
    )
  },
  getAllEvents: () => {
    return inngestTestEngine.events
  },
  printEvents: (message: string = 'Текущие события в тестовом движке:') => {
    logger.info(`📋 ${message}`)
    logger.info(`💾 Всего событий: ${inngestTestEngine.events.length}`)
    inngestTestEngine.events.forEach((event, index) => {
      logger.info(`📝 Событие #${index + 1}: ${event.name}`, {
        data: event.data,
      })
    })
  },
}

// Настройка логирования для тестов
export const configureTestLogging = () => {
  // Устанавливаем уровень логирования для тестов
  process.env.LOG_LEVEL = 'info'

  // Можно настроить специальное форматирование для тестов
  logger.info('🧪 Настройка логирования для тестов', {
    description: 'Setting up logging for tests',
  })
}

/**
 * Создает функцию-мок
 */
export const createMockFn = <T = any, R = any>() => {
  const mockFn = (...args: T[]): R => {
    mockFn.calls.push(args)
    return mockFn.returnValue as R
  }

  mockFn.calls = [] as T[][]
  mockFn.returnValue = undefined as unknown as R

  mockFn.mockReturnValue = (value: R) => {
    mockFn.returnValue = value
    return mockFn
  }

  mockFn.mockClear = () => {
    mockFn.calls = []
    return mockFn
  }

  return mockFn
}

/**
 * Тестовый клиент Inngest
 */
export const testInngestClient = {
  id: 'test-app',
  eventKey: 'test-key',
  send: async (event: any) => {
    logger.info('📤 [TEST_INNGEST_CLIENT]: Отправка события', event)
    return { success: true, event }
  },
  // Добавляем мок метода createFunction для тестирования
  createFunction: (
    options: any,
    trigger: any,
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars */ _handler: any
  ) => {
    return {
      id: options.id || 'test-function',
      event: trigger.event || 'test-event',
    }
  },
}

/**
 * Константы для тестирования аватар-ботов
 */
export const AVATAR_BOT_DEFAULTS = {
  /** Имя бота для тестирования */
  botName: 'test_avatar_bot',
  /** ID амбассадора для тестирования */
  ambassadorId: 12345,
  /** URL аватара для тестирования */
  avatarUrl: 'https://example.com/avatar.jpg',
  /** ID пользователя для тестирования */
  userId: 67890,
}
