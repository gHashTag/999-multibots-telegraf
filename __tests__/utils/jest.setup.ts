import dotenv from 'dotenv'

// Убираем установку process.env
// process.env.SUPABASE_URL = 'MOCK_URL'
// process.env.SUPABASE_SERVICE_KEY = 'MOCK_KEY'

// Загружаем переменные окружения ДО импорта других модулей
dotenv.config({ path: '.env.test' })

// --- Глобальный мок Supabase Client ---
jest.mock('@supabase/supabase-js', () => {
  const mockSupabaseClient = {
    from: jest.fn(() => mockSupabaseClient), // Chainable
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
    single: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    maybeSingle: jest.fn(() => Promise.resolve({ data: {}, error: null })),
    // Мок для возврата данных/ошибок (можно переопределять в тестах при необходимости)
    // Добавим __mockSetResult для удобства установки результата в тестах
    __mockSetResult: function (result: { data?: any; error?: any }) {
      this.single.mockResolvedValue(result)
      this.maybeSingle.mockResolvedValue(result)
      // Добавь другие методы, если нужно мокать их результат
      this.select.mockReturnValue({
        ...this, // Сохраняем chainability
        single: jest.fn().mockResolvedValue(result),
        maybeSingle: jest.fn().mockResolvedValue(result),
        // Добавь eq, order и т.д., если нужно их мокать после select
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue(result),
          maybeSingle: jest.fn().mockResolvedValue(result),
        }),
      })
      this.update.mockResolvedValue(result) // Мокаем результат update
      this.insert.mockResolvedValue(result) // Мокаем результат insert
      this.delete.mockResolvedValue(result) // Мокаем результат delete
      return this
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
jest.spyOn(console, 'log').mockImplementation(() => {
  /* suppressed in tests */
})
jest.spyOn(console, 'info').mockImplementation(() => {
  /* suppressed in tests */
})
jest.spyOn(console, 'warn').mockImplementation(() => {
  /* suppressed in tests */
})
jest.spyOn(console, 'error').mockImplementation(() => {
  /* suppressed in tests */
})
// Suppress logger output
jest.spyOn(logger, 'info').mockImplementation(() => logger)
jest.spyOn(logger, 'warn').mockImplementation(() => logger)
jest.spyOn(logger, 'error').mockImplementation(() => logger)
jest.spyOn(logger, 'debug').mockImplementation(() => logger)
// Suppress botLogger output
jest.spyOn(botLogger, 'info').mockImplementation(() => botLogger)
jest.spyOn(botLogger, 'warn').mockImplementation(() => botLogger)
jest.spyOn(botLogger, 'error').mockImplementation(() => botLogger)
jest.spyOn(botLogger, 'debug').mockImplementation(() => botLogger)
// Suppress securityLogger output
jest.spyOn(securityLogger, 'info').mockImplementation(() => securityLogger)
jest.spyOn(securityLogger, 'warn').mockImplementation(() => securityLogger)
jest.spyOn(securityLogger, 'error').mockImplementation(() => securityLogger)

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
