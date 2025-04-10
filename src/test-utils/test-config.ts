import { Inngest } from 'inngest'
import fetch from 'node-fetch'

/**
 * Конфигурация для тестов
 */
export const TEST_CONFIG = {
  /**
   * Таймауты для тестов (в миллисекундах)
   */
  TIMEOUTS: {
    /** Стандартный таймаут для теста */
    DEFAULT: 5000,
    /** Таймаут для операций с базой данных */
    DATABASE: 3000,
    /** Таймаут для операций с API */
    API: 2000,
    /** Таймаут для асинхронных операций */
    ASYNC: 1000,
  },

  /**
   * Настройки для тестовых данных
   */
  TEST_DATA: {
    /** Тестовый Telegram ID пользователя */
    TEST_USER_TELEGRAM_ID: '123456789',
    /** Тестовая сумма для операций с балансом */
    TEST_AMOUNT: 100,
    /** Тестовое количество звезд для операций с балансом */
    TEST_STARS: 50,
    /** Имя тестового бота */
    TEST_BOT_NAME: 'test_bot',
    /** Тестовое описание для платежей */
    TEST_DESCRIPTION: 'Test payment description',
  },

  /**
   * Флаги для настройки поведения тестов
   */
  FLAGS: {
    /** Показывать подробные логи */
    VERBOSE_LOGGING: true,
    /** Очищать тестовые данные после выполнения */
    CLEANUP_AFTER_TEST: true,
    /** Использовать моки для внешних сервисов */
    USE_MOCKS: true,
  },
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
 * Тестовый движок Inngest для тестирования событий
 */
export class InngestTestEngineMock {
  async sendEvent(eventName: string, data: any): Promise<any> {
    console.log(
      `🚀 [TEST_ENGINE_MOCK]: Имитация отправки события "${eventName}" с данными:`,
      data
    )
    return Promise.resolve({ success: true })
  }

  registerHandler(eventName: string, _handler: any): void {
    console.log(
      `ℹ️ [TEST_ENGINE_MOCK]: Имитация регистрации обработчика для события "${eventName}"`
    )
  }

  wasEventSent(): boolean {
    return true
  }

  getEventData(): any[] {
    return []
  }

  clear(): void {
    console.log('🧹 [TEST_ENGINE_MOCK]: Очистка данных тестового движка')
  }
}

/**
 * Тестовый движок Inngest для тестирования событий
 */
export const inngestTestEngine = new InngestTestEngineMock()

/**
 * Тестовый клиент Inngest
 */
export const testInngestClient = new Inngest({
  id: 'test-app',
  eventKey: 'test-key',
  fetch: fetch as any,
})
