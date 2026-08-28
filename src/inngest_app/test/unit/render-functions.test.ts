/**
 * UNIT TESTS: Render Functions
 *
 * Тестируем функции render категории:
 * - render
 * - renderAvatarVideo
 * - renderRiddle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  renderData,
  renderExpectedResults,
  renderErrors,
} from '../fixtures/render-fixtures'
import {
  setupInngestMocks,
  createMockLogger,
  expectSuccessResponse,
} from '../utils/test-helpers'

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

vi.mock('../../core/render-client', () => ({
  renderClient: {
    render: vi.fn(),
    getRenderStatus: vi.fn(),
  },
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { render } from '../../functions/render/render'
import { renderAvatarVideo } from '../../functions/render/renderAvatarVideo'
import { renderRiddle } from '../../functions/render/renderRiddle'
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
describe.skip('Render Functions', () => {
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

  describe('render', () => {
    it('должен запускать рендер с валидными данными', async () => {
      const event = {
        name: 'render',
        data: renderData.valid_simple,
      }

      const result = await getHandler(render)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('job_id')
      expect(result).toHaveProperty('status', 'queued')

      // Проверяем основные шаги
      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-input',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'prepare-template',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'start-render',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🎬 [RENDER] Starting render'),
        expect.any(Object)
      )
    })

    it('должен отклонять невалидные данные', async () => {
      const event = {
        name: 'render',
        data: renderData.invalid_missing_data,
      }

      await expect(
        getHandler(render)({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('template_id is required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [RENDER] Invalid render data'),
        expect.any(Object)
      )
    })

    it('должен обрабатывать ошибку рендера', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'start-render') {
          throw new Error('Render service unavailable')
        }
        return handler()
      })

      const event = {
        name: 'render',
        data: renderData.valid_simple,
      }

      await expect(
        getHandler(render)({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Render service unavailable')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [RENDER] Render failed'),
        expect.objectContaining({
          error: 'Render service unavailable',
        })
      )
    })

    it('должен очищать временные файлы при ошибке', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'start-render') {
          throw new Error('Render failed')
        }
        return handler()
      })

      const event = {
        name: 'render',
        data: renderData.valid_simple,
      }

      try {
        await getHandler(render)({ event, step: mockStep, logger: mockLogger })
      } catch (error) {
        // Ожидаемая ошибка
      }

      expect(mockStep.run).toHaveBeenCalledWith(
        'cleanup-temp-files',
        expect.any(Function)
      )
    })
  })

  describe('renderAvatarVideo', () => {
    it('должен рендерить аватарное видео', async () => {
      const event = {
        name: 'render-avatar-video',
        data: renderData.valid_avatar_video,
      }

      const result = await getHandler(renderAvatarVideo)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('video_url')

      // Проверяем специфичные для аватара шаги
      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-avatar',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'process-voice',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'generate-avatar-video',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('👤 [AVATAR] Starting avatar video render'),
        expect.any(Object)
      )
    })

    it('должен обрабатывать отсутствующий аватар', async () => {
      const event = {
        name: 'render-avatar-video',
        data: {
          ...renderData.valid_avatar_video,
          avatar_id: 'nonexistent',
        },
      }

      await expect(
        getHandler(renderAvatarVideo)({
          event,
          step: mockStep,
          logger: mockLogger,
        })
      ).rejects.toThrow('Avatar not found')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [AVATAR] Avatar not found'),
        expect.any(Object)
      )
    })

    it('должен обрабатывать длинные скрипты', async () => {
      const event = {
        name: 'render-avatar-video',
        data: {
          ...renderData.valid_avatar_video,
          script: 'A'.repeat(2000), // Длинный скрипт
        },
      }

      const result = await getHandler(renderAvatarVideo)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'split-long-script',
        expect.any(Function)
      )
    })
  })

  describe('renderRiddle', () => {
    it('должен рендерить загадку', async () => {
      const event = {
        name: 'render-riddle',
        data: renderData.valid_riddle,
      }

      const result = await getHandler(renderRiddle)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('riddle_url')

      // Проверяем шаги для загадки
      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-riddle-data',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'generate-riddle-visual',
        expect.any(Function)
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-answer-overlay',
        expect.any(Function)
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🧩 [RIDDLE] Starting riddle render'),
        expect.any(Object)
      )
    })

    it('должен валидировать тему загадки', async () => {
      const event = {
        name: 'render-riddle',
        data: {
          ...renderData.valid_riddle,
          theme: 'invalid_theme',
        },
      }

      await expect(
        getHandler(renderRiddle)({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Invalid riddle theme')
    })

    it('должен генерировать разные стили', async () => {
      const styles = ['funny', 'mysterious', 'educational', 'kids']

      for (const style of styles) {
        const event = {
          name: 'render-riddle',
          data: {
            ...renderData.valid_riddle,
            style,
          },
        }

        const result = await getHandler(renderRiddle)({
          event,
          step: mockStep,
          logger: mockLogger,
        })

        expectSuccessResponse(result)
        expect(mockStep.run).toHaveBeenCalledWith(
          `apply-${style}-style`,
          expect.any(Function)
        )
      }
    })

    it('должен обрабатывать короткие загадки', async () => {
      const event = {
        name: 'render-riddle',
        data: {
          ...renderData.valid_riddle,
          duration: 5, // Очень короткая
        },
      }

      const result = await getHandler(renderRiddle)({
        event,
        step: mockStep,
        logger: mockLogger,
      })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'optimize-for-short-duration',
        expect.any(Function)
      )
    })
  })

  describe('Shared functionality', () => {
    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'render',
        data: renderData.valid_simple,
      }

      await getHandler(render)({ event, step: mockStep, logger: mockLogger })

      const durationLog = mockLogger.info.mock.calls.find(call =>
        call[0].includes('duration_ms')
      )

      if (durationLog) {
        expect(durationLog[1].duration_ms).toBeGreaterThan(0)
        expect(durationLog[1].duration_ms).toBeLessThan(Date.now() - startTime)
      }
    })

    it('должен генерировать уникальные job_id', async () => {
      const event1 = {
        name: 'render',
        data: renderData.valid_simple,
      }

      const event2 = {
        name: 'render',
        data: renderData.valid_simple,
      }

      const result1 = await getHandler(render)({
        event: event1,
        step: mockStep,
        logger: mockLogger,
      })
      const result2 = await getHandler(render)({
        event: event2,
        step: mockStep,
        logger: mockLogger,
      })

      expect(result1.job_id).not.toBe(result2.job_id)
    })

    it('должен отслеживать прогресс рендера', async () => {
      const event = {
        name: 'render',
        data: renderData.valid_simple,
      }

      await getHandler(render)({ event, step: mockStep, logger: mockLogger })

      const progressSteps = mockStep.run.mock.calls
        .filter(call => call[0].includes('progress'))
        .map(call => call[0])

      expect(progressSteps.length).toBeGreaterThan(0)
    })
  })
})
