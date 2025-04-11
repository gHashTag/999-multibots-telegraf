import { Inngest } from 'inngest'
import fetch from 'node-fetch'
import { ModeEnum } from '../price/helpers/modelsCost'
import { logger } from '../utils/logger'
import { MockTelegraf } from './mocks/botMock'
import { MyContext } from '../interfaces'
import { Telegraf } from 'telegraf'

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
export const TEST_CONFIG = {
  // Общие настройки
  TIMEOUTS: {
    SHORT: 2000, // 2 секунды
    MEDIUM: 5000, // 5 секунд
    LONG: 10000, // 10 секунд
    DATABASE: 3000, // Таймаут для операций с базой данных
  },

  // Данные для тестов
  TEST_DATA: {
    TEST_USER_TELEGRAM_ID: '123456789',
    TEST_USER_USERNAME: 'testuser',
    TEST_USER_FIRST_NAME: 'Test',
    TEST_USER_LAST_NAME: 'User',
    TEST_DESCRIPTION: 'Test description',

    TEST_AMOUNT: 100, // Сумма для тестовых платежей
    TEST_STARS: 100, // Количество звезд для тестовых платежей
    TEST_OPERATION_ID: 'test-op-123', // ID операции для тестовых платежей
    TEST_BOT_NAME: 'test_bot', // Имя бота для тестов
  },

  // Настройки для тестов платежей
  PAYMENT_TESTS: {
    MODES: {
      TEXT_TO_IMAGE: ModeEnum.TextToImage,
      TEXT_TO_VIDEO: ModeEnum.TextToVideo,
      TOP_UP_BALANCE: ModeEnum.TopUpBalance,
    },

    // Ожидаемая стоимость операций
    COSTS: {
      TEXT_TO_IMAGE: 10,
      TEXT_TO_VIDEO: 20,
    },
  },

  // Моки для тестов
  mocks: {
    bot: new MockTelegraf('test-token') as unknown as Telegraf<MyContext>, // Мок объекта бота для тестов
  },
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
export const testInngestClient = new Inngest({
  id: 'test-app',
  eventKey: 'test-key',
  fetch: fetch as any,
})

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
