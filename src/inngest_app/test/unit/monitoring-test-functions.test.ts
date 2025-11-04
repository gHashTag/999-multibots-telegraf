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
import { setupInngestMocks, createMockLogger, expectSuccessResponse } from '../utils/test-helpers'

// Mock зависимостей
vi.mock('@/inngest_app/inngestClient', () => ({
  inngest: {
    send: vi.fn(),
    createFunction: vi.fn(),
  },
}))

vi.mock('@/core/supabase', () => ({
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

vi.mock('@/core/monitoring-service', () => ({
  monitoringService: {
    checkSystemHealth: vi.fn(),
    getErrorLogs: vi.fn(),
  },
}))

vi.mock('@/core/log-service', () => ({
  logService: {
    fetchLogs: vi.fn(),
    filterLogs: vi.fn(),
  },
}))

vi.mock('@/core/telegram', () => ({
  sendMessage: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { criticalErrorMonitor } from '@/inngest_app/functions/monitoring/criticalErrorMonitor'
import { logMonitor } from '@/inngest_app/functions/monitoring/logMonitor'
import { testSimpleFunction } from '@/inngest_app/functions/testSimpleFunction'
import { testSimpleMessageFunction } from '@/inngest_app/functions/testSimpleMessageFunction'
import { testAdvancedLoopFunction } from '@/inngest_app/functions/testAdvancedLoopFunction'

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

  describe('criticalErrorMonitor', () => {
    it('должен проверять здоровье системы', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_check,
      }

      const result = await criticalErrorMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('status')
      expect(result).toHaveProperty('health_score')
      expect(result).toHaveProperty('errors_found')

      expect(mockStep.run).toHaveBeenCalledWith(
        'check-system-services',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-error-patterns',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'calculate-health-score',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-alerts-if-needed',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔍 [MONITOR] Checking system health'),
        expect.any(Object),
      )
    })

    it('должен выполнять полную диагностику', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_detailed,
      }

      const result = await criticalErrorMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'fetch-detailed-logs',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-metrics',
        expect.any(Function),
      )
    })

    it('должен проверять производительность', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_performance,
      }

      const result = await criticalErrorMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'check-response-time',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'check-cpu-usage',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'check-memory-usage',
        expect.any(Function),
      )
    })

    it('должен отклонять невалидный тип проверки', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.invalid_check_type,
      }

      await expect(
        criticalErrorMonitor.handler({ event, step: mockStep, logger: mockLogger })
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

      const result = await criticalErrorMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-critical-alert',
        expect.any(Function),
      )
    })

    it('должен логировать результаты проверки', async () => {
      const event = {
        name: 'critical-error-monitor',
        data: criticalErrorMonitorData.valid_check,
      }

      await criticalErrorMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('✅ [MONITOR] System health check completed'),
        expect.any(Object),
      )
    })
  })

  describe('logMonitor', () => {
    it('должен мониторить логи с базовыми параметрами', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_basic,
      }

      const result = await logMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('logs_found')
      expect(result).toHaveProperty('total_errors')

      expect(mockStep.run).toHaveBeenCalledWith(
        'fetch-logs',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'filter-by-level',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-errors',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'detect-trends',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📋 [LOG] Monitoring logs'),
        expect.any(Object),
      )
    })

    it('должен применять фильтры', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_advanced,
      }

      const result = await logMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-pattern-filter',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'filter-by-service',
        expect.any(Function),
      )
    })

    it('должен работать в реальном времени', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_monitoring,
      }

      const result = await logMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'start-realtime-monitoring',
        expect.any(Function),
      )
    })

    it('должен отклонять невалидный уровень логов', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.invalid_log_level,
      }

      await expect(
        logMonitor.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('log_level is required')
    })

    it('должен обрабатывать stack trace', async () => {
      const event = {
        name: 'log-monitor',
        data: logMonitorData.valid_advanced,
      }

      await logMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-stack-traces',
        expect.any(Function),
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

      const result = await logMonitor.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-pattern-alert',
        expect.any(Function),
      )
    })
  })

  describe('testSimpleFunction', () => {
    it('должен выполнять простой тест', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_basic,
      }

      const result = await testSimpleFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('execution_time')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-test-data',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'run-test',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'report-results',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🧪 [TEST] Running simple test'),
        expect.any(Object),
      )
    })

    it('должен выполнять тест с опциями', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_with_options,
      }

      const result = await testSimpleFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-delay',
        expect.any(Function),
      )
    })

    it('должен отклонять пустое сообщение', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.invalid_message,
      }

      await expect(
        testSimpleFunction.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('message is required')
    })
  })

  describe('testSimpleMessageFunction', () => {
    it('должен отправлять простое сообщение', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.valid_simple,
      }

      const result = await testSimpleMessageFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('message_id')
      expect(result).toHaveProperty('chat_id')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-message-data',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-message',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'confirm-delivery',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('💬 [TEST] Sending test message'),
        expect.any(Object),
      )
    })

    it('должен отправлять сообщение с разметкой', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.valid_with_markup,
      }

      const result = await testSimpleMessageFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-inline-keyboard',
        expect.any(Function),
      )
    })

    it('должен обрабатывать HTML разметку', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.valid_with_parse_mode,
      }

      const result = await testSimpleMessageFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-html-parse-mode',
        expect.any(Function),
      )
    })

    it('должен отклонять невалидный chat_id', async () => {
      const event = {
        name: 'test-simple-message',
        data: testSimpleMessageFunctionData.invalid_chat_id,
      }

      await expect(
        testSimpleMessageFunction.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('chat_id is required')
    })
  })

  describe('testAdvancedLoopFunction', () => {
    it('должен выполнять простой цикл', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_basic,
      }

      const result = await testAdvancedLoopFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('loop_count')
      expect(result).toHaveProperty('successful_iterations')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-loop-params',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'initialize-loop',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'run-iterations',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'calculate-metrics',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔄 [TEST] Running advanced loop test'),
        expect.any(Object),
      )
    })

    it('должен выполнять асинхронный цикл', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_advanced,
      }

      const result = await testAdvancedLoopFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-async-mode',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'skip-on-error',
        expect.any(Function),
      )
    })

    it('должен выполнять параллельный цикл', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_parallel,
      }

      const result = await testAdvancedLoopFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-parallel-execution',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-max-parallel',
        expect.any(Function),
      )
    })

    it('должен отклонять невалидный loop_count', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.invalid_loop_count,
      }

      await expect(
        testAdvancedLoopFunction.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('loop_count must be greater than 0')
    })

    it('должен логировать прогресс', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_advanced,
      }

      await testAdvancedLoopFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-progress-logging',
        expect.any(Function),
      )
    })

    it('должен измерять производительность', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_basic,
      }

      const result = await testAdvancedLoopFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('average_iteration_time')
      expect(result).toHaveProperty('total_time')
    })
  })

  describe('Shared functionality', () => {
    it('должен валидировать входные данные', async () => {
      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_basic,
      }

      await testSimpleFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-input',
        expect.any(Function),
      )
    })

    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'test-simple',
        data: testSimpleFunctionData.valid_basic,
      }

      await testSimpleFunction.handler({ event, step: mockStep, logger: mockLogger })

      const durationLog = mockLogger.info.mock.calls.find((call) =>
        call[0].includes('duration_ms')
      )

      if (durationLog) {
        expect(durationLog[1].duration_ms).toBeGreaterThan(0)
        expect(durationLog[1].duration_ms).toBeLessThan(Date.now() - startTime)
      }
    })

    it('должен отправлять уведомления о прогрессе', async () => {
      const event = {
        name: 'test-advanced-loop',
        data: testAdvancedLoopFunctionData.valid_basic,
      }

      await testAdvancedLoopFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-progress-updates',
        expect.any(Function),
      )
    })
  })
})
