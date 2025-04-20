import dotenv from 'dotenv'

// Загружаем переменные окружения ДО импорта других модулей
dotenv.config({ path: '.env.test' })

import { jest, afterAll } from '@jest/globals'
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
afterAll(() => {
  ;[logger, botLogger, securityLogger].forEach(logInstance => {
    // Используем (logInstance as any).transports для обхода ошибки типов из-за моков
    const transportsToClose = (logInstance as any).transports || []
    transportsToClose.forEach((transport: any) => {
      if (
        transport instanceof transports.File &&
        typeof transport.close === 'function'
      ) {
        transport.close()
      }
    })
  })
})
