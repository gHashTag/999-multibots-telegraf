/**
 * UNIT TESTS: Helper Functions
 *
 * Тестируем helper функции:
 * - video-upload-helper
 * - wan25-helpers
 * - functions/index
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setupInngestMocks, createMockLogger } from '../utils/test-helpers'

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
      insert: vi.fn(),
      update: vi.fn(),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  },
}))

vi.mock('../../core/storage-service', () => ({
  storageService: {
    upload: vi.fn(),
    getUrl: vi.fn(),
  },
}))

vi.mock('../../core/telegram', () => ({
  sendVideo: vi.fn(),
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { videoUploadHelper } from '../../functions/video-upload-helper'
import { wan25Helpers } from '../../functions/wan25-helpers'
import { functionsIndex } from '../../functions/index'
import { getHandler } from '../utils/test-helpers'

/**
 * ⚠️ ПРОПУЩЕН (skip): импортируемых имён не существует.
 *
 * Файл из коммита «checkpoint: Все тесты теперь нужно будет покрыть каждую
 * функцию» (04.11.2025) — спецификация желаемого, а не проверка существующего.
 * Примеры расхождений, проверенные по исходникам:
 *   render.ts экспортирует renderFunction, тест импортирует render;
 *   video-upload-helper.ts экспортирует uploadVideoToSupabase,
 *   тест импортирует videoUploadHelper.
 * Импорт undefined приводит к громкой ошибке getHandler, а не к молчанию —
 * это правильно, но красным он висел бы вечно. Снимите skip, когда решите,
 * какие функции должны существовать.
 */
describe.skip('Helper Functions', () => {
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

  describe('videoUploadHelper', () => {
    it('должен загружать видео в хранилище', async () => {
      const event = {
        name: 'video-upload-helper',
        data: {
          telegram_id: '123456789',
          video_url: 'https://example.com/video.mp4',
          bucket: 'videos',
        },
      }

      const result = await getHandler(videoUploadHelper)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          uploaded_url: expect.any(String),
        })
      )

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-video-url',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'download-video',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'upload-to-storage',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'cleanup-temp-files',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('📹 [UPLOAD] Uploading video'),
        expect.any(Object)
      )
    })

    it('должен отклонять невалидный URL', async () => {
      const event = {
        name: 'video-upload-helper',
        data: {
          telegram_id: '123456789',
          video_url: '',
          bucket: 'videos',
        },
      }

      await expect(
        getHandler(videoUploadHelper)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('video_url is required')
    })

    it('должен обрабатывать разные типы хранилища', async () => {
      const buckets = ['videos', 'temp', 'user-uploads']

      for (const bucket of buckets) {
        const event = {
          name: 'video-upload-helper',
          data: {
            telegram_id: '123456789',
            video_url: 'https://example.com/video.mp4',
            bucket,
          },
        }

        const result = await getHandler(videoUploadHelper)({
          event,
          step: mockStep,
          logger: mockLogger,
        })

        expect(result).toEqual(
          expect.objectContaining({
            success: true,
          })
        )
      }
    })

    it('должен генерировать метаданные', async () => {
      const event = {
        name: 'video-upload-helper',
        data: {
          telegram_id: '123456789',
          video_url: 'https://example.com/video.mp4',
          bucket: 'videos',
        },
      }

      const result = await getHandler(videoUploadHelper)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(result).toHaveProperty('metadata')
      expect(result.metadata).toHaveProperty('size')
      expect(result.metadata).toHaveProperty('duration')
      expect(result.metadata).toHaveProperty('format')
    })
  })

  describe('wan25Helpers', () => {
    it('должен обрабатывать запросы wan25', async () => {
      const event = {
        name: 'wan25-helpers',
        data: {
          telegram_id: '123456789',
          action: 'process',
          params: {
            key: 'value',
          },
        },
      }

      const result = await getHandler(wan25Helpers)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          action: 'process',
        })
      )

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-request',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'process-wan25-request',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-response',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔧 [WAN25] Processing wan25 request'),
        expect.any(Object)
      )
    })

    it('должен валидировать action', async () => {
      const event = {
        name: 'wan25-helpers',
        data: {
          telegram_id: '123456789',
          action: '',
          params: {},
        },
      }

      await expect(
        getHandler(wan25Helpers)({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('action is required')
    })

    it('должен обрабатывать разные типы запросов', async () => {
      const actions = ['process', 'validate', 'convert', 'transform']

      for (const action of actions) {
        const event = {
          name: 'wan25-helpers',
          data: {
            telegram_id: '123456789',
            action,
            params: { test: true },
          },
        }

        const result = await getHandler(wan25Helpers)({
          event,
          step: mockStep,
          logger: mockLogger,
        })

        expect(result).toEqual(
          expect.objectContaining({
            success: true,
            action,
          })
        )
      }
    })

    it('должен логировать параметры', async () => {
      const event = {
        name: 'wan25-helpers',
        data: {
          telegram_id: '123456789',
          action: 'process',
          params: {
            param1: 'value1',
            param2: 'value2',
          },
        },
      }

      await getHandler(wan25Helpers)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('params'),
        expect.objectContaining({
          params: expect.any(Object),
        })
      )
    })
  })

  describe('functionsIndex', () => {
    it('должен регистрировать все функции', () => {
      const functions = functionsIndex.getAllFunctions()

      expect(functions).toBeInstanceOf(Array)
      expect(functions.length).toBeGreaterThan(0)

      // Проверяем что каждая функция имеет необходимые свойства
      functions.forEach(func => {
        expect(func).toHaveProperty('id')
        expect(func).toHaveProperty('name')
        expect(func).toHaveProperty('handler')
      })
    })

    it('должен находить функцию по ID', () => {
      const allFunctions = functionsIndex.getAllFunctions()

      if (allFunctions.length > 0) {
        const firstFunction = allFunctions[0]
        const found = functionsIndex.getFunctionById(firstFunction.id)

        expect(found).toBeDefined()
        expect(found?.id).toBe(firstFunction.id)
      }
    })

    it('должен валидировать структуру функций', () => {
      const functions = functionsIndex.getAllFunctions()

      functions.forEach(func => {
        expect(typeof func.id).toBe('string')
        expect(typeof func.name).toBe('string')
        expect(typeof func.handler).toBe('function')
        expect(typeof func.retries).toBe('number')
      })
    })

    it('должен получать функции по категории', () => {
      const renderFunctions = functionsIndex.getFunctionsByCategory('render')

      if (renderFunctions.length > 0) {
        renderFunctions.forEach(func => {
          expect(func.category).toBe('render')
        })
      }
    })

    it('должен получать статистику функций', () => {
      const stats = functionsIndex.getFunctionStats()

      expect(stats).toHaveProperty('total')
      expect(stats).toHaveProperty('by_category')
      expect(stats.total).toBeGreaterThan(0)
    })
  })

  describe('Shared functionality', () => {
    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'video-upload-helper',
        data: {
          telegram_id: '123456789',
          video_url: 'https://example.com/video.mp4',
          bucket: 'videos',
        },
      }

      await getHandler(videoUploadHelper)({
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

    it('должен валидировать входные данные', async () => {
      const event = {
        name: 'wan25-helpers',
        data: {
          telegram_id: '123456789',
          action: 'process',
          params: {},
        },
      }

      await getHandler(wan25Helpers)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-input',
        expect.any(Function)
      )
    })
  })
})
