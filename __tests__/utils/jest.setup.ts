// import { jest, afterAll } from '@jest/globals'
import dotenv from 'dotenv'

// Убираем установку process.env
// process.env.SUPABASE_URL = 'MOCK_URL'
// process.env.SUPABASE_SERVICE_KEY = 'MOCK_KEY'

// Загружаем переменные окружения ДО импорта других модулей
dotenv.config({ path: '.env.test' })

// --- Глобальный мок Supabase Client ---
jest.mock('@supabase/supabase-js', () => {
  // Переменная для хранения результата, устанавливаемого тестом
  let mockResult: { data?: any; error?: any } = { data: {}, error: null }

  const mockSupabaseClient = {
    from: jest.fn(() => mockSupabaseClient),
    select: jest.fn(() => mockSupabaseClient),
    update: jest.fn(() => mockSupabaseClient),
    insert: jest.fn(() => mockSupabaseClient),
    delete: jest.fn(() => mockSupabaseClient),
    eq: jest.fn(() => mockSupabaseClient),
    neq: jest.fn(() => mockSupabaseClient),
    gt: jest.fn(() => mockSupabaseClient),
    gte: jest.fn(() => mockSupabaseClient),
    lt: jest.fn(() => mockSupabaseClient),
    lte: jest.fn(() => mockSupabaseClient),
    like: jest.fn(() => mockSupabaseClient),
    ilike: jest.fn(() => mockSupabaseClient),
    in: jest.fn(() => mockSupabaseClient),
    is: jest.fn(() => mockSupabaseClient),
    contains: jest.fn(() => mockSupabaseClient),
    containedBy: jest.fn(() => mockSupabaseClient),
    range: jest.fn(() => mockSupabaseClient),
    order: jest.fn(() => mockSupabaseClient),
    limit: jest.fn(() => mockSupabaseClient),
    // single и maybeSingle теперь просто возвращают сохраненный результат
    single: jest.fn(() => Promise.resolve(mockResult)),
    maybeSingle: jest.fn(() => Promise.resolve(mockResult)),
    // Упрощенная функция для установки результата
    __mockSetResult: function (result: { data?: any; error?: any }) {
      mockResult = result // Просто сохраняем результат
      // Сбрасываем моки методов, возвращающих промис, чтобы они использовали новый mockResult
      this.single.mockResolvedValue(mockResult)
      this.maybeSingle.mockResolvedValue(mockResult)
      // Можно также сбросить .update, .insert, .delete, если они используются в тестах
      // this.update.mockResolvedValue(mockResult)
      // this.insert.mockResolvedValue(mockResult)
      // this.delete.mockResolvedValue(mockResult)
      return this // Возвращаем this для поддержки цепочки (если нужно)
    },
    auth: {
      // Моки для методов аутентификации, если они используются
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      // ... другие методы auth
    },
    storage: {
      // Моки для методов хранилища
      from: jest.fn(() => ({
        // Chainable from
        upload: jest.fn(),
        download: jest.fn(),
        list: jest.fn(),
        remove: jest.fn(),
        // ... другие методы бакета
      })),
    },
  }
  // Возвращаем конструктор мок-класса
  return { createClient: jest.fn(() => mockSupabaseClient) }
})
// --- Конец мока Supabase Client ---

import { transports } from 'winston'
import logger, { botLogger, securityLogger } from '../../src/utils/logger'

// Global test setup
// Mock core bot module to prevent actual bot initialization logs
jest.mock('@/core/bot', () => ({
  defaultBot: {},
  bots: [],
  pulseBot: {},
  getBotNameByToken: jest.fn(),
  getTokenByBotName: jest.fn(),
  createBotByName: jest.fn(),
  getBotByName: jest.fn(),
}))

// Глобальные моки и настройки для Jest

// Подавляем вывод логов приложения во время тестов

// Suppress console output during tests
jest.spyOn(console, 'log').mockImplementation(jest.fn())
jest.spyOn(console, 'info').mockImplementation(jest.fn())
jest.spyOn(console, 'warn').mockImplementation(jest.fn())
jest.spyOn(console, 'error').mockImplementation(jest.fn())
// Suppress logger output
jest.spyOn(logger, 'info').mockImplementation(jest.fn())
jest.spyOn(logger, 'warn').mockImplementation(jest.fn())
jest.spyOn(logger, 'error').mockImplementation(jest.fn())
jest.spyOn(logger, 'debug').mockImplementation(jest.fn())
// Suppress botLogger output
jest.spyOn(botLogger, 'info').mockImplementation(jest.fn())
jest.spyOn(botLogger, 'warn').mockImplementation(jest.fn())
jest.spyOn(botLogger, 'error').mockImplementation(jest.fn())
jest.spyOn(botLogger, 'debug').mockImplementation(jest.fn())
// Suppress securityLogger output
jest.spyOn(securityLogger, 'info').mockImplementation(jest.fn())
jest.spyOn(securityLogger, 'warn').mockImplementation(jest.fn())
jest.spyOn(securityLogger, 'error').mockImplementation(jest.fn())

// УДАЛЯЕМ ГЛОБАЛЬНЫЕ МОКИ ДЛЯ logger, botLogger, securityLogger
// jest.spyOn(logger, 'info').mockImplementation((_infoObject) => logger)
// jest.spyOn(logger, 'warn').mockImplementation((_infoObject) => logger)
// jest.spyOn(logger, 'error').mockImplementation((_infoObject) => logger)
// jest.spyOn(logger, 'debug').mockImplementation((_infoObject) => logger)
// jest.spyOn(botLogger, 'info').mockImplementation(() => {})
// jest.spyOn(botLogger, 'warn').mockImplementation(() => {})
// jest.spyOn(botLogger, 'error').mockImplementation(() => {})
// jest.spyOn(botLogger, 'debug').mockImplementation(() => {})
// jest.spyOn(securityLogger, 'info').mockImplementation((_infoObject) => securityLogger)
// jest.spyOn(securityLogger, 'warn').mockImplementation((_infoObject) => securityLogger)
// jest.spyOn(securityLogger, 'error').mockImplementation((_infoObject) => securityLogger)

// Ensure OPENAI_API_KEY is set for core/openai modules
process.env.OPENAI_API_KEY = 'test-key'
// Ensure REPLICATE_API_TOKEN is set for core/replicate modules
process.env.REPLICATE_API_TOKEN = 'test-token'

// Закрываем файловые транспорты логгера после всех тестов
// Делаем хук асинхронным
afterAll(async () => {
  // Используем Promise.all, чтобы дождаться завершения всех операций
  await Promise.all(
    [logger, botLogger, securityLogger].map(async logInstance => {
      // Используем (logInstance as any).transports для обхода ошибки типов из-за моков
      const transportsToClose = (logInstance as any).transports || []
      await Promise.all(
        transportsToClose.map((transport: any) => {
          return new Promise<void>(resolve => {
            if (
              transport instanceof transports.File &&
              typeof transport.close === 'function'
            ) {
              // Некоторые реализации close могут принимать callback
              // или просто завершаться синхронно. Добавим небольшую задержку
              // на всякий случай, хотя это и не идеальное решение.
              transport.close()
              // Даем небольшой таймаут для завершения I/O операций
              setTimeout(resolve, 50)
            } else {
              resolve()
            }
          })
        })
      )
    })
  )
})
