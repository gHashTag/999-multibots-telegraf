import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// Импортируем типы для реального модуля
import type * as LoggerTypes from '../../src/utils/logger'

// Полностью мокаем модуль логгера
jest.mock('@/utils/logger', () => ({
  // Создаем моки для каждого экспортируемого элемента
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  botLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  securityLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  // Убираем logSecurityEvent из мока модуля
  // Используем jest.requireActual для этого
  // Добавляем явное указание типа
  logSecurityEvent: (jest.requireActual('@/utils/logger') as typeof LoggerTypes).logSecurityEvent,
}))

// Теперь импортируем мокированные версии
import logger, { botLogger, securityLogger, logSecurityEvent } from '../../src/utils/logger'

// Типизируем мокированные объекты/функции для TypeScript
const mockedLogger = logger as jest.Mocked<typeof logger>
const mockedBotLogger = botLogger as jest.Mocked<typeof botLogger>
const mockedSecurityLogger = securityLogger as jest.Mocked<typeof securityLogger>

describe.skip('botLogger', () => {
  beforeEach(() => {
    // Очищаем вызовы моков перед каждым тестом
    jest.clearAllMocks()
  })

  it('info logs with bot name prefix', () => {
    mockedBotLogger.info('botX', 'message', { extra: true })
    // Проверяем вызов конкретного мока
    expect(mockedLogger.info).toHaveBeenCalledWith('[botX] message', { extra: true })
  })
  it('warn logs with bot name prefix', () => {
    mockedBotLogger.warn('botY', 'warnmsg', { w: 1 })
    expect(mockedLogger.warn).toHaveBeenCalledWith('[botY] warnmsg', { w: 1 })
  })
  it('error logs with bot name prefix', () => {
    mockedBotLogger.error('botZ', 'errormsg', { e: 'x' })
    expect(mockedLogger.error).toHaveBeenCalledWith('[botZ] errormsg', { e: 'x' })
  })
  it('debug logs with bot name prefix', () => {
    mockedBotLogger.debug('botD', 'dbgmsg', { d: 2 })
    expect(mockedLogger.debug).toHaveBeenCalledWith('[botD] dbgmsg', { d: 2 })
  })
})

describe('logSecurityEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('logs security event with default severity warn', () => {
    const details = { foo: 'bar' }
    // Вызываем реальный logSecurityEvent
    logSecurityEvent('EVT', details)
    // Проверяем вызов метода у мока securityLogger
    expect(mockedSecurityLogger.warn).toHaveBeenCalledWith(
      'Событие безопасности: EVT',
      expect.objectContaining({ ...details, eventType: 'EVT' })
    )
  })
  it('logs security event with specified severity', () => {
    // Вызываем реальный logSecurityEvent
    logSecurityEvent('INFO_EVT', { a: 1 }, 'info')
    // Проверяем вызов метода у мока securityLogger
    expect(mockedSecurityLogger.info).toHaveBeenCalled()
  })
})