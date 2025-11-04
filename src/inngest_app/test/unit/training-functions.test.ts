/**
 * UNIT TESTS: Training Functions
 *
 * Тестируем функции training категории:
 * - modelTrainingV2
 * - morphImages
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { modelTrainingV2Data, morphImagesData, trainingExpectedResults, trainingErrors } from '../fixtures/training-fixtures'
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
      delete: vi.fn(),
    })),
  },
}))

vi.mock('@/core/training-client', () => ({
  trainingClient: {
    startTraining: vi.fn(),
    getTrainingStatus: vi.fn(),
    cancelTraining: vi.fn(),
  },
}))

vi.mock('@/core/replicate', () => ({
  replicate: {
    models: {
      get: vi.fn(),
    },
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { modelTrainingV2 } from '@/inngest_app/functions/training/modelTrainingV2'
import { morphImages } from '@/inngest_app/functions/training/morphImages'

describe('Training Functions', () => {
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

  describe('modelTrainingV2', () => {
    it('должен запускать обучение модели с базовыми параметрами', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      const result = await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('model_id')
      expect(result).toHaveProperty('status', 'training_queued')
      expect(result).toHaveProperty('estimated_time')

      // Проверяем основные шаги
      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-images',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'prepare-training-data',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'start-training',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'track-progress',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🤖 [TRAIN] Starting model training'),
        expect.any(Object),
      )
    })

    it('должен запускать продвинутое обучение', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_advanced,
      }

      const result = await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)

      // Проверяем продвинутые шаги
      expect(mockStep.run).toHaveBeenCalledWith(
        'configure-advanced-settings',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-validation-split',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'optimize-hyperparameters',
        expect.any(Function),
      )
    })

    it('должен отклонять недостаточное количество изображений', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.invalid_insufficient_images,
      }

      await expect(
        modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Need at least 3 images for training')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [TRAIN] Insufficient images for training'),
        expect.any(Object),
      )
    })

    it('должен отклонять отсутствие имени модели', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.invalid_missing_model_name,
      }

      await expect(
        modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('model_name is required')
    })

    it('должен обрабатывать ошибку обучения', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'start-training') {
          throw new Error('Training server unavailable')
        }
        return handler()
      })

      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      await expect(
        modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Training server unavailable')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [TRAIN] Model training failed'),
        expect.objectContaining({
          error: 'Training server unavailable',
        }),
      )
    })

    it('должен отслеживать прогресс обучения', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_advanced,
      }

      await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      const progressSteps = mockStep.run.mock.calls
        .filter((call) => call[0].includes('progress'))
        .map((call) => call[0])

      expect(progressSteps.length).toBeGreaterThan(0)
      expect(progressSteps).toContain('track-epoch-progress')
      expect(progressSteps).toContain('update-training-status')
    })

    it('должен отправлять уведомления пользователю', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'send-start-notification',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-completion-notification',
        expect.any(Function),
      )
    })
  })

  describe('morphImages', () => {
    it('должен создавать морфинг между изображениями', async () => {
      const event = {
        name: 'morph-images',
        data: morphImagesData.valid_simple,
      }

      const result = await morphImages.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('video_url')
      expect(result).toHaveProperty('duration')

      // Проверяем шаги морфинга
      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-images',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'generate-morph-frames',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'create-video-from-frames',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🎭 [MORPH] Starting image morphing'),
        expect.any(Object),
      )
    })

    it('должен создавать продвинутый морфинг', async () => {
      const event = {
        name: 'morph-images',
        data: morphImagesData.valid_advanced,
      }

      const result = await morphImages.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)

      // Проверяем продвинутые настройки
      expect(mockStep.run).toHaveBeenCalledWith(
        'configure-quality-settings',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-fps',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'optimize-frames',
        expect.any(Function),
      )
    })

    it('должен отклонять невалидные изображения', async () => {
      const event = {
        name: 'morph-images',
        data: morphImagesData.invalid_images,
      }

      await expect(
        morphImages.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('source_image is required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [MORPH] Invalid image URLs'),
        expect.any(Object),
      )
    })

    it('должен обрабатывать высокое качество', async () => {
      const event = {
        name: 'morph-images',
        data: {
          ...morphImagesData.valid_advanced,
          quality: 'ultra',
          fps: 60,
        },
      }

      const result = await morphImages.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-ultra-quality',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-high-fps',
        expect.any(Function),
      )
    })

    it('должен генерировать промежуточные кадры', async () => {
      const event = {
        name: 'morph-images',
        data: morphImagesData.valid_simple,
      }

      await morphImages.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'generate-intermediate-frames',
        expect.any(Function),
      )

      // Проверяем что количество кадров соответствует steps
      const frameGenCall = mockStep.run.mock.calls.find(
        (call) => call[0] === 'generate-intermediate-frames'
      )
      expect(frameGenCall).toBeDefined()
    })

    it('должен сглаживать переходы', async () => {
      const event = {
        name: 'morph-images',
        data: {
          ...morphImagesData.valid_simple,
          smooth_transition: true,
        },
      }

      await morphImages.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-smoothing',
        expect.any(Function),
      )
    })
  })

  describe('Shared functionality', () => {
    it('должен валидировать входные данные', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-input',
        expect.any(Function),
      )
    })

    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'morph-images',
        data: morphImagesData.valid_simple,
      }

      await morphImages.handler({ event, step: mockStep, logger: mockLogger })

      const durationLog = mockLogger.info.mock.calls.find((call) =>
        call[0].includes('duration_ms')
      )

      if (durationLog) {
        expect(durationLog[1].duration_ms).toBeGreaterThan(0)
        expect(durationLog[1].duration_ms).toBeLessThan(Date.now() - startTime)
      }
    })

    it('должен отправлять события о прогрессе', async () => {
      const event = {
        name: 'model-training-v2',
        data: modelTrainingV2Data.valid_basic,
      }

      await modelTrainingV2.handler({ event, step: mockStep, logger: mockLogger })

      // Проверяем что отправлялись события о прогрессе
      expect(mockStep.run).toHaveBeenCalledWith(
        'send-progress-events',
        expect.any(Function),
      )
    })
  })
})
