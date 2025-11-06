/**
 * INTEGRATION TESTS: Workflow Testing
 *
 * Интеграционные тесты для проверки взаимодействия между функциями:
 * - Полные workflow от начала до конца
 * - Передача данных между функциями
 * - Обработка ошибок в цепочке
 * - Event-driven архитектура
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  aiReelsCallbackData,
} from '../fixtures/callback-fixtures'
import {
  renderData,
} from '../fixtures/render-fixtures'
import {
  modelTrainingV2Data,
} from '../fixtures/training-fixtures'
import { setupInngestMocks, createMockLogger } from '../utils/test-helpers'

// Mock всех зависимостей
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

vi.mock('../../core/telegram', () => ({
  sendMessage: vi.fn(),
  sendVideo: vi.fn(),
}))

vi.mock('../../core/render-client', () => ({
  renderClient: {
    render: vi.fn(),
    getRenderStatus: vi.fn(),
  },
}))

vi.mock('../../core/training-client', () => ({
  trainingClient: {
    startTraining: vi.fn(),
    getTrainingStatus: vi.fn(),
  },
}))

import { aiReelsCallback } from '../../functions/ai-reels-callback'
import { render } from '../../functions/render/render'
import { modelTrainingV2 } from '../../functions/training/modelTrainingV2'

describe('Workflow Integration Tests', () => {
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

  describe('Complete Render Workflow', () => {
    it('должен выполнять полный цикл: render → callback → notification', async () => {
      // Шаг 1: Запуск рендера
      const renderEvent = {
        name: 'render',
        data: renderData.valid_simple,
      }

      const renderResult = await render.handler({ event: renderEvent, step: mockStep, logger: mockLogger })

      expect(renderResult).toEqual(
        expect.objectContaining({
          success: true,
          job_id: expect.any(String),
        })
      )

      // Шаг 2: Callback с результатом
      const callbackEvent = {
        name: 'ai-reels-callback',
        data: {
          ...aiReelsCallbackData.valid_completed,
          job_id: renderResult.job_id,
        },
      }

      const callbackResult = await aiReelsCallback.handler({ event: callbackEvent, step: mockStep, logger: mockLogger })

      expect(callbackResult).toEqual(
        expect.objectContaining({
          success: true,
          status: 'completed',
        })
      )

      // Проверяем что отправлено событие callback
      const inngest = await import('../../inngestClient')
      expect(inngest.inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ai-reels-callback',
          data: expect.objectContaining({
            job_id: renderResult.job_id,
          }),
        })
      )
    })

    it('должен обрабатывать ошибку рендера через callback', async () => {
      // Шаг 1: Запуск рендера
      const renderEvent = {
        name: 'render',
        data: renderData.valid_simple,
      }

      await render.handler({ event: renderEvent, step: mockStep, logger: mockLogger })

      // Шаг 2: Callback с ошибкой
      const callbackEvent = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_failed,
      }

      const callbackResult = await aiReelsCallback.handler({ event: callbackEvent, step: mockStep, logger: mockLogger })

      expect(callbackResult).toEqual(
        expect.objectContaining({
          success: true,
          status: 'failed',
        })
      )

      // Проверяем логирование ошибки
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [AI REELS CALLBACK] Render failed'),
        expect.any(Object),
      )
    })
  })

  describe('Training Workflow', () => {
    it('должен выполнять полный цикл тренировки', async () => {
      const trainingEvent = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      const result = await modelTrainingV2.handler({ event: trainingEvent, step: mockStep, logger: mockLogger })

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          model_id: expect.any(String),
          status: 'training_queued',
        })
      )

      // Проверяем последовательность шагов
      const stepCalls = mockStep.run.mock.calls.map((call) => call[0])

      expect(stepCalls).toContain('validate-images')
      expect(stepCalls).toContain('prepare-training-data')
      expect(stepCalls).toContain('start-training')
      expect(stepCalls).toContain('track-progress')

      // Проверяем что отправлены события о прогрессе
      const inngest = await import('../../inngestClient')
      expect(inngest.inngest.send).toHaveBeenCalled()
    })

    it('должен отслеживать прогресс обучения', async () => {
      const trainingEvent = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_advanced,
      }

      const result = await modelTrainingV2.handler({ event: trainingEvent, step: mockStep, logger: mockLogger })

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
        })
      )

      // Проверяем что есть обновления прогресса
      const progressSteps = mockStep.run.mock.calls
        .filter((call) => call[0].includes('progress'))
        .map((call) => call[0])

      expect(progressSteps.length).toBeGreaterThan(0)
    })
  })

  describe('Cross-Function Communication', () => {
    it('должен передавать данные между функциями', async () => {
      const inngest = await import('../../inngestClient')

      // Первый вызов
      const event1 = {
        name: 'render',
        data: renderData.valid_simple,
      }

      await render.handler({ event: event1, step: mockStep, logger: mockLogger })

      // Проверяем что отправлено событие для callback
      expect(inngest.inngest.send).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'ai-reels-callback',
          data: expect.objectContaining({
            job_id: expect.any(String),
          }),
        })
      )
    })

    it('должен использовать результат одной функции в другой', async () => {
      const renderEvent = {
        name: 'render',
        data: renderData.valid_simple,
      }

      const renderResult = await render.handler({ event: renderEvent, step: mockStep, logger: mockLogger })

      // Используем job_id из результата в callback
      const callbackEvent = {
        name: 'ai-reels-callback',
        data: {
          ...aiReelsCallbackData.valid_completed,
          job_id: renderResult.job_id,
        },
      }

      const callbackResult = await aiReelsCallback.handler({ event: callbackEvent, step: mockStep, logger: mockLogger })

      expect(callbackResult.job_id).toBe(renderResult.job_id)
    })
  })

  describe('Error Propagation', () => {
    it('должен корректно обрабатывать ошибки между шагами', async () => {
      const trainingEvent = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      // Мокаем ошибку на втором шаге
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'start-training') {
          throw new Error('Training server unavailable')
        }
        return handler()
      })

      await expect(
        modelTrainingV2.handler({ event: trainingEvent, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Training server unavailable')

      // Проверяем что ошибка залогирована
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [TRAIN] Model training failed'),
        expect.objectContaining({
          error: 'Training server unavailable',
        })
      )
    })

    it('должен откатывать изменения при ошибке', async () => {
      const renderEvent = {
        name: 'render',
        data: renderData.valid_simple,
      }

      // Мокаем ошибку на середине процесса
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'start-render') {
          throw new Error('Render service unavailable')
        }
        return handler()
      })

      await expect(
        render.handler({ event: renderEvent, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Render service unavailable')

      // Проверяем что вызван cleanup
      expect(mockStep.run).toHaveBeenCalledWith(
        'cleanup-temp-files',
        expect.any(Function),
      )

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [RENDER] Render failed'),
        expect.objectContaining({
          step: 'start-render',
        })
      )
    })
  })

  describe('Performance and Monitoring', () => {
    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })

      const durationLog = mockLogger.info.mock.calls.find((call) =>
        call[0].includes('duration_ms')
      )

      if (durationLog) {
        expect(durationLog[1].duration_ms).toBeGreaterThan(0)
        expect(durationLog[1].duration_ms).toBeLessThan(Date.now() - startTime)
      }
    })

    it('должен отслеживать прогресс длительных операций', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_advanced,
      }

      await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      // Проверяем что есть несколько обновлений прогресса
      const progressSteps = mockStep.run.mock.calls
        .filter((call) => call[0].includes('progress'))
        .map((call) => call[0])

      expect(progressSteps.length).toBeGreaterThan(0)
    })
  })

  describe('Data Consistency', () => {
    it('должен сохранять согласованность данных между функциями', async () => {
      const callbackEvent = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await aiReelsCallback.handler({ event: callbackEvent, step: mockStep, logger: mockLogger })

      // Проверяем что telegram_id извлечен из metadata
      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-telegram-id',
        expect.any(Function),
      )

      // Проверяем что telegram_id используется в отправке
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-video-to-telegram',
        expect.any(Function),
      )
    })

    it('должен валидировать форматы данных', async () => {
      const invalidCallback = {
        ...aiReelsCallbackData.valid_completed,
        status: 'invalid_status' as any,
      }

      const event = {
        name: 'ai-reels-callback',
        data: invalidCallback,
      }

      await expect(
        aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow()

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [AI REELS CALLBACK] Invalid webhook payload'),
        expect.any(Object),
      )
    })
  })

  describe('Event-Driven Architecture', () => {
    it('должен отправлять события в правильном порядке', async () => {
      const inngest = await import('../../inngestClient')

      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      // Проверяем что события отправлялись
      expect(inngest.inngest.send).toHaveBeenCalled()

      // Проверяем порядок событий по вызовам
      const sendCalls = inngest.inngest.send.mock.calls.map((call) => call[0])

      // Первое событие должно быть о старте
      expect(sendCalls[0]).toEqual(
        expect.objectContaining({
          name: 'model-training-started',
        })
      )
    })

    it('должен использовать correlation_id для отслеживания', async () => {
      const event = {
        name: 'render',
        data: renderData.valid_simple,
      }

      await render.handler({ event, step: mockStep, logger: mockLogger })

      // Проверяем что correlation_id передается между событиями
      const stepCalls = mockStep.run.mock.calls
      const correlationSteps = stepCalls.filter((call) =>
        call[0].includes('correlation')
      )

      expect(correlationSteps.length).toBeGreaterThan(0)
    })
  })
})
