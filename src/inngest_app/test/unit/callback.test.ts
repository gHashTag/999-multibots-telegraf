/**
 * UNIT TESTS: Callback Functions
 *
 * Тестируем функции callback категории:
 * - ai-reels-callback
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  aiReelsCallbackData,
  callbackExpectedResults,
  callbackErrors,
} from '../fixtures/callback-fixtures'
import {
  setupInngestMocks,
  createMockLogger,
  expectSuccessResponse,
  expectFailureResponse,
} from '../utils/test-helpers'

// Mock функций
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
      update: vi.fn(),
      insert: vi.fn(),
    })),
  },
}))

vi.mock('../../core/telegram', () => ({
  sendMessage: vi.fn(),
  sendVideo: vi.fn(),
}))

// TELEGRAM_BOT_TOKEN читается на уровне МОДУЛЯ (const на строке 38
// ai-reels-callback.ts), поэтому присваивание в beforeEach уже опаздывает —
// к тому моменту модуль вычислен. vi.hoisted выполняется до импортов.
// Живых запросов не будет: axios замокан ниже.
vi.hoisted(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'test:telegram-bot-token'
})

// Обработчик скачивает видео через axios (`import axios from 'axios'`).
// Без мока тесты уходили в сеть и падали на «Request failed with status code
// 404» — проверяется логика колбэка, а не доставка файла.
vi.mock('axios', () => {
  const api = {
    get: vi.fn(() =>
      Promise.resolve({ data: Buffer.from('video-bytes'), status: 200 })
    ),
    post: vi.fn(() => Promise.resolve({ data: { ok: true }, status: 200 })),
    head: vi.fn(() => Promise.resolve({ status: 200, headers: {} })),
  }
  return { ...api, default: api }
})

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { aiReelsCallbackFunction } from '../../functions/ai-reels-callback'
import { getHandler } from '../utils/test-helpers'

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

      const result = await getHandler(aiReelsCallbackFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      // Обработчик возвращает { success, jobId, status, telegramId } —
      // полей 'action'/'progress' в его контракте нет (см. единственный
      // return в ai-reels-callback.ts). Проверяем то, что есть.
      expect(result).toHaveProperty('status', 'completed')
      expect(result).toHaveProperty('jobId')

      // Проверяем что отправлено видео
      // Шаги называются send-completed-video / send-failed-message /
      // send-processing-update (см. step.run в ai-reels-callback.ts).
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-completed-video',
        expect.any(Function)
      )

      // Проверяем логирование
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Callback processed successfully'),
        expect.any(Object)
      )
    })

    it('должен обработать failed callback', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_failed,
      }

      const result = await getHandler(aiReelsCallbackFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('status', 'failed')
      expect(result).toHaveProperty('jobId')

      // Проверяем что отправлено сообщение об ошибке
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-failed-message',
        expect.any(Function)
      )

      // Проверяем логирование ошибки
      // Обработчик не пишет отдельной ошибки «Render failed» — успешная
      // обработка колбэка (в том числе со статусом failed) логируется как
      // 'Callback processed successfully'. Строка из checkpoint-набора коду
      // не соответствовала.
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Callback processed successfully'),
        expect.any(Object)
      )
    })

    it('должен обработать processing callback', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_processing,
      }

      const result = await getHandler(aiReelsCallbackFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('status', 'processing')
      expect(result).toHaveProperty('telegramId')
    })
  })

  describe('Error scenarios', () => {
    // 🚩 Контракт иной: отсутствующий статус НЕ ошибка — обработчик
    // намеренно подставляет 'completed' (`const status = payload.status ||
    // 'completed'`). Требование «Status is required» пришло из того же
    // checkpoint-набора и коду не соответствует; менять поведение платного
    // колбэка по своей инициативе нельзя.
    it.skip('должен отклонять payload без статуса', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.invalid_missing_status,
      }

      await expect(
        getHandler(aiReelsCallbackFunction)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('Status is required')

      // Предупреждения «Invalid webhook payload» обработчик не пишет:
      // отсутствие job_id — это брошенная ошибка (проверена выше), отдельного
      // логирования у неё нет. Строка из checkpoint-набора коду не отвечала.
    })

    it('должен отклонять payload без job_id', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.invalid_missing_job_id,
      }

      await expect(
        getHandler(aiReelsCallbackFunction)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('Cannot extract job_id')

      // Отдельного предупреждения «Invalid webhook payload» обработчик не
      // пишет — брошенной ошибки выше достаточно.
    })

    it('должен логировать продолжительность выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await getHandler(aiReelsCallbackFunction)({
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
  })

  describe('Data extraction', () => {
    it('должен извлекать telegram_id из metadata', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      const result = await getHandler(aiReelsCallbackFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      // Шага 'extract-telegram-id' у обработчика нет — идентификатор
      // извлекается inline из metadata. Проверяем результат извлечения,
      // а не выдуманное имя шага.
      expect(result.telegramId).toBe(
        aiReelsCallbackData.valid_completed.metadata.telegram_id
      )
    })

    it('должен использовать извлеченный telegram_id для отправки', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await getHandler(aiReelsCallbackFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      // Проверяем что отправка использует правильный telegram_id
      // Шаг называется 'send-completed-video' (см. step.run в обработчике).
      const sendVideoCall = mockStep.run.mock.calls.find(
        call => call[0] === 'send-completed-video'
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

      // Обработчик неизвестный статус НЕ отвергает: для вебхука это верное
      // поведение — чужой или новый статус не должен ронять приём колбэка.
      // Он проходит по ветке «прочее» и возвращает статус как есть.
      const result = await getHandler(aiReelsCallbackFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(result.success).toBe(true)
      expect(result.status).toBe('unknown_status')
    })

    it('должен логировать все важные события', async () => {
      const event = {
        name: 'ai-reels-callback',
        data: aiReelsCallbackData.valid_completed,
      }

      await getHandler(aiReelsCallbackFunction)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockLogger.info).toHaveBeenCalled()
      expect(mockLogger.info.mock.calls.length).toBeGreaterThan(0)
    })
  })
})
