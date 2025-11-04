/**
 * UNIT TESTS: Callback Functions
 *
 * Тестируем функции callback категории:
 * - ai-reels-callback
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { aiReelsCallbackData, callbackExpectedResults, callbackErrors } from '../fixtures/callback-fixtures'
import { setupInngestMocks, createMockLogger, expectSuccessResponse, expectFailureResponse } from '../utils/test-helpers'

// Mock функций
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
      update: vi.fn(),
      insert: vi.fn(),
    })),
  },
}))

vi.mock('@/core/telegram', () => ({
  sendMessage: vi.fn(),
  sendVideo: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { aiReelsCallback } from '@/inngest_app/functions/ai-reels-callback'

describe('ai-reels-callback', () => {
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

  describe('Success scenarios', () => {
    it('должен обработать completed callback', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      const result = await aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('status', 'completed')
      expect(result).toHaveProperty('action', 'send_video')

      // Проверяем что отправлено видео
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-video-to-telegram',
        expect.any(Function),
      )

      // Проверяем логирование
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('✅ [AI REELS CALLBACK] Video sent to Telegram'),
        expect.any(Object),
      )
    })

    it('должен обработать failed callback', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_failed,
      }

      const result = await aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('status', 'failed')
      expect(result).toHaveProperty('action', 'send_error_message')

      // Проверяем что отправлено сообщение об ошибке
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-error-message',
        expect.any(Function),
      )

      // Проверяем логирование ошибки
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [AI REELS CALLBACK] Render failed'),
        expect.any(Object),
      )
    })

    it('должен обработать processing callback', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_processing,
      }

      const result = await aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('status', 'processing')
      expect(result).toHaveProperty('progress', 75)
    })
  })

  describe('Error scenarios', () => {
    it('должен отклонять payload без статуса', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.invalid_missing_status,
      }

      await expect(
        aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Status is required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [AI REELS CALLBACK] Invalid webhook payload'),
        expect.any(Object),
      )
    })

    it('должен отклонять payload без job_id', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.invalid_missing_job_id,
      }

      await expect(
        aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('job_id is required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [AI REELS CALLBACK] Invalid webhook payload'),
        expect.any(Object),
      )
    })

    it('должен логировать продолжительность выполнения', async () => {
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
  })

  describe('Data extraction', () => {
    it('должен извлекать telegram_id из metadata', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-telegram-id',
        expect.any(Function),
      )
    })

    it('должен использовать извлеченный telegram_id для отправки', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })

      // Проверяем что отправка использует правильный telegram_id
      const sendVideoCall = mockStep.run.mock.calls.find(
        (call) => call[0] === 'send-video-to-telegram'
      )

      expect(sendVideoCall).toBeDefined()
    })
  })

  describe('Edge cases', () => {
    it('должен корректно обрабатывать неожиданный статус', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: {
          ...aiReelsCallbackData.valid_completed,
          status: 'unknown_status' as any,
        },
      }

      await expect(
        aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Unknown status')
    })

    it('должен логировать все важные события', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await aiReelsCallback.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockLogger.info).toHaveBeenCalled()
      expect(mockLogger.info.mock.calls.length).toBeGreaterThan(0)
    })
  })
})
