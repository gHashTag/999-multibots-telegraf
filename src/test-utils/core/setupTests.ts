/**
 * Настройка тестового окружения
 *
 * Этот файл содержит функции для настройки тестового окружения,
 * включая моки общих функций и настройку глобальных переменных.
 */

import { loggerTest as logger } from '@/utils/logger'
import mockApi from './mock'

/**
 * Инициализирует тестовое окружение
 */
export function setupTestEnvironment(): void {
  logger.info('🔧 Настройка тестового окружения...')

  // Установка переменных окружения для тестов
  process.env.NODE_ENV = 'test'

  // Отключение вывода ошибок в консоль
  const originalConsoleError = console.error
  console.error = (...args) => {
    // В тестовом режиме логируем только важные ошибки
    if (process.env.TEST_VERBOSE === 'true') {
      originalConsoleError(...args)
    }
  }

  // Настройка моков для глобальных объектов
  setupGlobalMocks()

  logger.info('✅ Тестовое окружение настроено')
}

/**
 * Настраивает глобальные моки для тестов
 */
function setupGlobalMocks(): void {
  // Мокируем setTimeout для ускорения тестов, но сохраняя типизацию
  const originalSetTimeout = global.setTimeout

  // Заменяем только функциональность, сохраняя типизацию
  const mockedSetTimeout = function (
    callback: (...args: any[]) => void,
    timeout?: number,
    ...args: any[]
  ): NodeJS.Timeout {
    // В тестах выполняем таймауты мгновенно
    if (process.env.TEST_FAST_TIMERS === 'true') {
      return originalSetTimeout(callback, 0, ...args)
    }
    return originalSetTimeout(callback, timeout, ...args)
  }

  // Сохраняем promisify и другие свойства setTimeout
  Object.defineProperties(
    mockedSetTimeout,
    Object.getOwnPropertyDescriptors(originalSetTimeout)
  )

  // Устанавливаем мок сохраняя все свойства оригинала
  global.setTimeout = mockedSetTimeout as typeof global.setTimeout

  // Настраиваем моки для других глобальных функций, если нужно
  global.fetch = mockApi.create().mockImplementation(() => {
    throw new Error('fetch должен быть мокирован в тестах явно')
  }) as any
}

/**
 * Очищает тестовое окружение и возвращает исходные значения
 */
export function cleanupTestEnvironment(): void {
  logger.info('🧹 Очистка тестового окружения...')

  // Восстановление переменных окружения
  delete process.env.TEST_VERBOSE
  delete process.env.TEST_FAST_TIMERS

  // Восстановление консоли
  // (При необходимости)

  logger.info('✅ Тестовое окружение очищено')
}
