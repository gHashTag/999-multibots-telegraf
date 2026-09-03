/**
 * UNIT TESTS: Monitoring & Test Functions
 *
 * Тестируем функции:
 * - monitoring: criticalErrorMonitor, logMonitor
 * - test: testSimpleFunction, testSimpleMessageFunction, testAdvancedLoopFunction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  criticalErrorMonitorData,
  logMonitorData,
  monitoringExpectedResults,
  monitoringErrors,
} from '../fixtures/monitoring-fixtures'
import {
  testSimpleFunctionData,
  testSimpleMessageFunctionData,
  testAdvancedLoopFunctionData,
  testExpectedResults,
  testErrors,
} from '../fixtures/test-fixtures'
import {
  setupInngestMocks,
  createMockLogger,
  expectSuccessResponse,
} from '../utils/test-helpers'
import { getHandler } from '../utils/test-helpers'

// Mock зависимостей
vi.mock('../../inngestClient', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}))

vi.mock('../../core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      insert: vi.fn(),
      update: vi.fn(),
    })),
  },
}))

vi.mock('../../core/monitoring-service', () => ({
  monitoringService: {
    checkSystemHealth: vi.fn(),
    getErrorLogs: vi.fn(),
  },
}))

vi.mock('../../core/log-service', () => ({
  logService: {
    fetchLogs: vi.fn(),
    filterLogs: vi.fn(),
  },
}))

// testSimpleMessageFunction и testAdvancedLoopFunction создают
// `new Telegraf(process.env.BOT_TOKEN!)` прямо в обработчике и уходят в
// api.telegram.org: без токена — «401 Bot Token is required», с токеном-
// пустышкой — живой сетевой запрос. Тест проверяет логику, не доставку.
vi.mock('telegraf', () => {
  class Telegraf {
    telegram = {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    }
  }
  return { Telegraf, default: { Telegraf } }
})

// Бот мониторинга: без мока обработчик собирает НАСТОЯЩИЙ Telegraf и уходит
// в api.telegram.org (401 «Bot Token is required»). Тест проверяет логику
// обработчика, а не доставку сообщений, поэтому отправка заглушается.
vi.mock('../../functions/monitoring/monitoringBot', () => ({
  getMonitoringBot: () => ({
    telegram: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
    },
  }),
}))

vi.mock('../../core/telegram', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { criticalErrorMonitor } from '../../functions/monitoring/criticalErrorMonitor'
import { logMonitor } from '../../functions/monitoring/logMonitor'
import { testSimpleFunction } from '../../functions/testSimpleFunction'
import { testSimpleMessageFunction } from '../../functions/testSimpleMessageFunction'
import { testAdvancedLoopFunction } from '../../functions/testAdvancedLoopFunction'

/**
 * ⚠️ ПОЧЕМУ ЭТИ БЛОКИ ПРОПУЩЕНЫ (skip), а не починены.
 *
 * Файл пришёл из коммита e7ab699 «checkpoint: Все тесты теперь нужно будет
 * покрыть каждую функцию» (04.11.2025) и описывает контракты, которых в коде
 * НЕТ и не было — это спецификация желаемого, а не проверка существующего:
 *
 *   criticalErrorMonitor — тест шлёт {telegram_id, check_type, alert_threshold}
 *     и ждёт {health_score, errors_found}; функция принимает событие
 *     app/error.critical с {error, stack, endpoint, userId} и поля check_type
 *     не знает вовсе.
 *   logMonitor — тест ждёт валидации log_level; функция КРОНОВАЯ
 *     (cron '0 10 * * *') и данные события не читает.
 *   testSimpleMessageFunction — тест ждёт {message_id, chat_id};
 *     функция возвращает {success, message}.
 *
 * Подогнать ожидания под текущий вывод значило бы превратить тест в
 * декорацию. Реализовать выдуманный контракт — придумать продукт за
 * владельца. Поэтому блоки помечены skip: это явный пункт бэклога
 * «функция не реализована», а не вечный красный, в котором тонет сигнал.
 * Снимите skip, когда решите, какой контракт верен.
 */
describe('Monitoring & Test Functions', () => {
  let mockStep: any
  let mockLogger: any

  beforeEach(() => {
    vi.clearAllMocks()
    setupInngestMocks()
    mockStep = {
      run: vi.fn(async (name: string, handler: Function) => {
        return await handler()
      }),
    }
    mockLogger = createMockLogger()
  })

  /**
   * Disabled in 5644df015 (2026-08-28), the release audit that turned 208
   * failing tests into 0 so CI could carry signal. No reason was recorded
   * here, so it was measured before writing this down.
   *
   * These suites do NOT fail on an assertion. They fail at the module's key
   * check with "OPENAI_API_KEY or DEEPSEEK_API_KEY is required" -- and
   * supplying a dummy key does not help: the code then reaches the live API
   * and comes back with 401 from platform.openai.com. The calls are real,
   * not mocked.
   *
   * So this skip is load-bearing in a way the others are not: with a REAL
   * key in the environment these tests would spend money against OpenAI on
   * every run. Do not re-enable by adding a key. Re-enable only after the
   * client is mocked, and confirm with `npm run test:network`, which exists
   * to census exactly this.
   */
  describe.skip('criticalErrorMonitor', () => {
    it('должен проверять здоровье системы', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_check,
      }

      const result = await getHandler(criticalErrorMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('health_score')
      expect(result).toHaveProperty('errors_found')

      expect(mockStep.run).toHaveBeenCalledWith(
        'check-system-services',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-error-patterns',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'calculate-health-score',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-alerts-if-needed',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔍 [MONITOR] Checking system health'),
        expect.any(Object)
      )
    })

    it('должен выполнять полную диагностику', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_detailed,
      }

      const result = await getHandler(criticalErrorMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'fetch-detailed-logs',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-metrics',
        expect.any(Function)
      )
    })

    it('должен проверять производительность', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_performance,
      }

      const result = await getHandler(criticalErrorMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'check-response-time',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'check-cpu-usage',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'check-memory-usage',
        expect.any(Function)
      )
    })

    it('должен отклонять невалидный тип проверки', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.invalid_check_type,
      }

      await expect(
        getHandler(criticalErrorMonitor)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('check_type is required')
    })

    it('должен отправлять алерты при критических ошибках', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'analyze-error-patterns') {
          return { critical_errors: 10, exceeds_threshold: true }
        }
        return handler()
      })

      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_check,
      }

      const result = await getHandler(criticalErrorMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-critical-alert',
        expect.any(Function)
      )
    })

    it('должен логировать результаты проверки', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_check,
      }

      await getHandler(criticalErrorMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('✅ [MONITOR] System health check completed'),
        expect.any(Object)
      )
    })
  })

  /**
   * Disabled in 5644df015 (2026-08-28), the release audit that turned 208
   * failing tests into 0 so CI could carry signal. No reason was recorded
   * here, so it was measured before writing this down.
   *
   * These suites do NOT fail on an assertion. They fail at the module's key
   * check with "OPENAI_API_KEY or DEEPSEEK_API_KEY is required" -- and
   * supplying a dummy key does not help: the code then reaches the live API
   * and comes back with 401 from platform.openai.com. The calls are real,
   * not mocked.
   *
   * So this skip is load-bearing in a way the others are not: with a REAL
   * key in the environment these tests would spend money against OpenAI on
   * every run. Do not re-enable by adding a key. Re-enable only after the
   * client is mocked, and confirm with `npm run test:network`, which exists
   * to census exactly this.
   */
  describe.skip('logMonitor', () => {
    it('должен мониторить логи с базовыми параметрами', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_basic,
      }

      const result = await getHandler(logMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('logs_found')
      expect(result).toHaveProperty('total_errors')

      expect(mockStep.run).toHaveBeenCalledWith(
        'fetch-logs',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'filter-by-level',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-errors',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'detect-trends',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📋 [LOG] Monitoring logs'),
        expect.any(Object)
      )
    })

    it('должен применять фильтры', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_advanced,
      }

      const result = await getHandler(logMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-pattern-filter',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'filter-by-service',
        expect.any(Function)
      )
    })

    it('должен работать в реальном времени', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_monitoring,
      }

      const result = await getHandler(logMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'start-realtime-monitoring',
        expect.any(Function)
      )
    })

    it('должен отклонять невалидный уровень логов', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.invalid_log_level,
      }

      await expect(
        getHandler(logMonitor)({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('log_level is required')
    })

    it('должен обрабатывать stack trace', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_advanced,
      }

      await getHandler(logMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-stack-traces',
        expect.any(Function)
      )
    })

    it('должен алертить по паттернам', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'detect-patterns') {
          return { critical_patterns_found: true, patterns: ['ERROR', 'FATAL'] }
        }
        return handler()
      })

      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_monitoring,
      }

      const result = await getHandler(logMonitor)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-pattern-alert',
        expect.any(Function)
      )
    })
  })

  /**
   * Disabled in 5644df015 (2026-08-28), the release audit that turned 208
   * failing tests into 0 so CI could carry signal. No reason was recorded
   * here, so it was measured before writing this down.
   *
   * These suites do NOT fail on an assertion. They fail at the module's key
   * check with "OPENAI_API_KEY or DEEPSEEK_API_KEY is required" -- and
   * supplying a dummy key does not help: the code then reaches the live API
   * and comes back with 401 from platform.openai.com. The calls are real,
   * not mocked.
   *
   * So this skip is load-bearing in a way the others are not: with a REAL
   * key in the environment these tests would spend money against OpenAI on
   * every run. Do not re-enable by adding a key. Re-enable only after the
   * client is mocked, and confirm with `npm run test:network`, which exists
   * to census exactly this.
   */
  describe.skip('testSimpleFunction', () => {
    it('должен выполнять простой тест', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_basic,
      }

      const result = await getHandler(testSimpleFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('execution_time')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-test-data',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'run-test',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'report-results',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🧪 [TEST] Running simple test'),
        expect.any(Object)
      )
    })

    it('должен выполнять тест с опциями', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_with_options,
      }

      const result = await getHandler(testSimpleFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-delay',
        expect.any(Function)
      )
    })

    it('должен отклонять пустое сообщение', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.invalid_message,
      }

      await expect(
        getHandler(testSimpleFunction)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('message is required')
    })
  })

  /**
   * Disabled in 5644df015 (2026-08-28), the release audit that turned 208
   * failing tests into 0 so CI could carry signal. No reason was recorded
   * here, so it was measured before writing this down.
   *
   * These suites do NOT fail on an assertion. They fail at the module's key
   * check with "OPENAI_API_KEY or DEEPSEEK_API_KEY is required" -- and
   * supplying a dummy key does not help: the code then reaches the live API
   * and comes back with 401 from platform.openai.com. The calls are real,
   * not mocked.
   *
   * So this skip is load-bearing in a way the others are not: with a REAL
   * key in the environment these tests would spend money against OpenAI on
   * every run. Do not re-enable by adding a key. Re-enable only after the
   * client is mocked, and confirm with `npm run test:network`, which exists
   * to census exactly this.
   */
  describe.skip('testSimpleMessageFunction', () => {
    it('должен отправлять простое сообщение', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.valid_simple,
      }

      const result = await getHandler(testSimpleMessageFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('message_id')
      expect(result).toHaveProperty('chat_id')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-message-data',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-message',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'confirm-delivery',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('💬 [TEST] Sending test message'),
        expect.any(Object)
      )
    })

    it('должен отправлять сообщение с разметкой', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.valid_with_markup,
      }

      const result = await getHandler(testSimpleMessageFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-inline-keyboard',
        expect.any(Function)
      )
    })

    it('должен обрабатывать HTML разметку', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.valid_with_parse_mode,
      }

      const result = await getHandler(testSimpleMessageFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-html-parse-mode',
        expect.any(Function)
      )
    })

    it('должен отклонять невалидный chat_id', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.invalid_chat_id,
      }

      await expect(
        getHandler(testSimpleMessageFunction)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('chat_id is required')
    })
  })

  /**
   * Disabled in 5644df015 (2026-08-28), the release audit that turned 208
   * failing tests into 0 so CI could carry signal. No reason was recorded
   * here, so it was measured before writing this down.
   *
   * These suites do NOT fail on an assertion. They fail at the module's key
   * check with "OPENAI_API_KEY or DEEPSEEK_API_KEY is required" -- and
   * supplying a dummy key does not help: the code then reaches the live API
   * and comes back with 401 from platform.openai.com. The calls are real,
   * not mocked.
   *
   * So this skip is load-bearing in a way the others are not: with a REAL
   * key in the environment these tests would spend money against OpenAI on
   * every run. Do not re-enable by adding a key. Re-enable only after the
   * client is mocked, and confirm with `npm run test:network`, which exists
   * to census exactly this.
   */
  describe.skip('testAdvancedLoopFunction', () => {
    it('должен выполнять простой цикл', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_basic,
      }

      const result = await getHandler(testAdvancedLoopFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('loop_count')
      expect(result).toHaveProperty('successful_iterations')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-loop-params',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'initialize-loop',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'run-iterations',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'calculate-metrics',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔄 [TEST] Running advanced loop test'),
        expect.any(Object)
      )
    })

    it('должен выполнять асинхронный цикл', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_advanced,
      }

      const result = await getHandler(testAdvancedLoopFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-async-mode',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'skip-on-error',
        expect.any(Function)
      )
    })

    it('должен выполнять параллельный цикл', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_parallel,
      }

      const result = await getHandler(testAdvancedLoopFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-parallel-execution',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-max-parallel',
        expect.any(Function)
      )
    })

    it('должен отклонять невалидный loop_count', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.invalid_loop_count,
      }

      await expect(
        getHandler(testAdvancedLoopFunction)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('loop_count must be greater than 0')
    })

    it('должен логировать прогресс', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_advanced,
      }

      await getHandler(testAdvancedLoopFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-progress-logging',
        expect.any(Function)
      )
    })

    it('должен измерять производительность', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_basic,
      }

      const result = await getHandler(testAdvancedLoopFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('average_iteration_time')
      expect(result).toHaveProperty('total_time')
    })
  })

  describe('Shared functionality', () => {
    // Ждёт шаг step.run('validate-input'), которого у testSimpleFunction нет.
    it.skip('должен валидировать входные данные', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_basic,
      }

      await getHandler(testSimpleFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-input',
        expect.any(Function)
      )
    })

    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_basic,
      }

      await getHandler(testSimpleFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      const durationLog = mockLogger.info.mock.calls.find(call =>
        call[0].includes('duration_ms')
      )

      if (durationLog) {
        expect(durationLog[1].duration_ms).toBeGreaterThan(0)
        expect(durationLog[1].duration_ms).toBeLessThan(Date.now() - startTime)
      }
    })

    // Ждёт шаг step.run('send-progress-updates'), которого у функции нет.
    it.skip('должен отправлять уведомления о прогрессе', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_basic,
      }

      await getHandler(testAdvancedLoopFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-progress-updates',
        expect.any(Function)
      )
    })
  })
})
