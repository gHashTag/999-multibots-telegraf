/**
 * UNIT TESTS: Existing Functions
 *
 * Тестируем функции existing категории:
 * - generateAIReelsFunction
 * - generateAdvancedLoopingVideoFunction
 * - generateModelTrainingFunction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateAIReelsData,
  generateAdvancedLoopingVideoData,
  generateModelTrainingData,
  existingExpectedResults,
  existingErrors,
} from '../fixtures/existing-fixtures'
import { setupInngestMocks, createMockLogger, expectSuccessResponse } from '../utils/test-helpers'

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

vi.mock('../../core/replicate', () => ({
  replicate: {
    run: vi.fn(),
    models: {
      get: vi.fn(),
    },
  },
}))

vi.mock('../../core/video-generator', () => ({
  videoGenerator: {
    generate: vi.fn(),
    processVideo: vi.fn(),
  },
}))

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

import { generateAIReelsFunction } from '../../functions/existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideoFunction } from '../../functions/existing/generateAdvancedLoopingVideoFunction'
import { generateModelTrainingFunction } from '../../functions/existing/generateModelTrainingFunction'

describe('Existing Functions', () => {
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

  describe('generateAIReelsFunction', () => {
    it('должен генерировать reels с базовыми параметрами', async () => {
      const event = {
        name: 'generate-ai-reels',
        data: generateAIReelsData.valid_basic,
      }

      const result = await generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('video_url')
      expect(result).toHaveProperty('duration')
      expect(result).toHaveProperty('format')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-prompt',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'generate-reels-video',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'optimize-for-reels',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'upload-to-storage',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🎬 [REELS] Generating AI reels'),
        expect.any(Object),
      )
    })

    it('должен генерировать reels с кастомными параметрами', async () => {
      const event = {
        name: 'generate-ai-reels',
        data: generateAIReelsData.valid_custom,
      }

      const result = await generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-resolution',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-fps',
        expect.any(Function),
      )
    })

    it('должен отклонять пустой промпт', async () => {
      const event = {
        name: 'generate-ai-reels',
        data: generateAIReelsData.invalid_prompt,
      }

      await expect(
        generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('prompt is required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [REELS] Invalid prompt'),
        expect.any(Object),
      )
    })

    it('должен применять разные стили', async () => {
      const styles = ['realistic', 'cinematic', 'artistic', 'animated']

      for (const style of styles) {
        const event = {
          name: 'generate-ai-reels',
          data: {
            ...generateAIReelsData.valid_basic,
            style,
          },
        }

        const result = await generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })

        expectSuccessResponse(result)
        expect(mockStep.run).toHaveBeenCalledWith(
          `apply-${style}-style`,
          expect.any(Function),
        )
      }
    })

    it('должен обрабатывать ошибку генерации', async () => {
      mockStep.run.mockImplementation((name: string, handler: Function) => {
        if (name === 'generate-reels-video') {
          throw new Error('Video generation failed')
        }
        return handler()
      })

      const event = {
        name: 'generate-ai-reels',
        data: generateAIReelsData.valid_basic,
      }

      await expect(
        generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('Video generation failed')

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('❌ [REELS] Reels generation failed'),
        expect.objectContaining({
          error: 'Video generation failed',
        }),
      )
    })

    it('должен оптимизировать для Instagram', async () => {
      const event = {
        name: 'generate-ai-reels',
        data: generateAIReelsData.valid_basic,
      }

      await generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'optimize-for-instagram',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'add-watermark',
        expect.any(Function),
      )
    })
  })

  describe('generateAdvancedLoopingVideoFunction', () => {
    it('должен создавать зацикленное видео', async () => {
      const event = {
        name: 'generate-advanced-looping-video',
        data: generateAdvancedLoopingVideoData.valid_simple,
      }

      const result = await generateAdvancedLoopingVideoFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('looped_video_url')
      expect(result).toHaveProperty('loop_duration')
      expect(result).toHaveProperty('quality')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-base-video',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'analyze-loop-points',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'create-seamless-loop',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-fade-transition',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🔄 [LOOP] Creating advanced looping video'),
        expect.any(Object),
      )
    })

    it('должен создавать продвинутый loop с эффектами', async () => {
      const event = {
        name: 'generate-advanced-looping-video',
        data: generateAdvancedLoopingVideoData.valid_advanced,
      }

      const result = await generateAdvancedLoopingVideoFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-blur-effect',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'apply-fade-effect',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'configure-high-quality',
        expect.any(Function),
      )
    })

    it('должен отклонять невалидный URL видео', async () => {
      const event = {
        name: 'generate-advanced-looping-video',
        data: generateAdvancedLoopingVideoData.invalid_video_url,
      }

      await expect(
        generateAdvancedLoopingVideoFunction.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('base_video_url is required')
    })

    it('должен обрабатывать высокий FPS', async () => {
      const event = {
        name: 'generate-advanced-looping-video',
        data: {
          ...generateAdvancedLoopingVideoData.valid_simple,
          fps: 60,
        },
      }

      const result = await generateAdvancedLoopingVideoFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'enable-high-fps',
        expect.any(Function),
      )
    })

    it('должен создавать плавные переходы', async () => {
      const event = {
        name: 'generate-advanced-looping-video',
        data: generateAdvancedLoopingVideoData.valid_simple,
      }

      await generateAdvancedLoopingVideoFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'detect-best-loop-point',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'smooth-transition',
        expect.any(Function),
      )
    })

    it('должен измерять качество зацикливания', async () => {
      const event = {
        name: 'generate-advanced-looping-video',
        data: generateAdvancedLoopingVideoData.valid_simple,
      }

      const result = await generateAdvancedLoopingVideoFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('loop_quality_score')
    })
  })

  describe('generateModelTrainingFunction', () => {
    it('должен запускать обучение модели', async () => {
      const event = {
        name: 'generate-model-training',
        data: generateModelTrainingData.valid_basic,
      }

      const result = await generateModelTrainingFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(result).toHaveProperty('model_id')
      expect(result).toHaveProperty('status', 'training_queued')
      expect(result).toHaveProperty('estimated_time')

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-training-data',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'prepare-model-config',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'start-training-process',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'setup-monitoring',
        expect.any(Function),
      )

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('🤖 [MODEL] Starting model training'),
        expect.any(Object),
      )
    })

    it('должен настраивать продвинутые параметры', async () => {
      const event = {
        name: 'generate-model-training',
        data: generateModelTrainingData.valid_custom,
      }

      const result = await generateModelTrainingFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'configure-batch-size',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'set-learning-rate',
        expect.any(Function),
      )
      expect(mockStep.run).toHaveBeenCalledWith(
        'configure-validation',
        expect.any(Function),
      )
    })

    it('должен отклонять невалидный тип модели', async () => {
      const event = {
        name: 'generate-model-training',
        data: generateModelTrainingData.invalid_model_type,
      }

      await expect(
        generateModelTrainingFunction.handler({ event, step: mockStep, logger: mockLogger })
      ).rejects.toThrow('model_type is required')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ [MODEL] Invalid model type'),
        expect.any(Object),
      )
    })

    it('должен обрабатывать style_transfer модели', async () => {
      const event = {
        name: 'generate-model-training',
        data: {
          ...generateModelTrainingData.valid_basic,
          model_type: 'style_transfer',
        },
      }

      const result = await generateModelTrainingFunction.handler({ event, step: mockStep, logger: mockLogger })

      expectSuccessResponse(result)
      expect(mockStep.run).toHaveBeenCalledWith(
        'prepare-style-images',
        expect.any(Function),
      )
    })

    it('должен отслеживать прогресс обучения', async () => {
      const event = {
        name: 'generate-model-training',
        data: generateModelTrainingData.valid_basic,
      }

      await generateModelTrainingFunction.handler({ event, step: mockStep, logger: mockLogger })

      const progressSteps = mockStep.run.mock.calls
        .filter((call) => call[0].includes('monitor'))
        .map((call) => call[0])

      expect(progressSteps.length).toBeGreaterThan(0)
    })

    it('должен сохранять чекпоинты', async () => {
      const event = {
        name: 'generate-model-training',
        data: generateModelTrainingData.valid_custom,
      }

      await generateModelTrainingFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'save-checkpoints',
        expect.any(Function),
      )
    })
  })

  describe('Shared functionality', () => {
    it('должен валидировать пользователя', async () => {
      const event = {
        name: 'generate-ai-reels',
        data: generateAIReelsData.valid_basic,
      }

      await generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'validate-user',
        expect.any(Function),
      )
    })

    it('должен логировать время выполнения', async () => {
      const startTime = Date.now()

      const event = {
        name: 'generate-advanced-looping-video',
        data: generateAdvancedLoopingVideoData.valid_simple,
      }

      await generateAdvancedLoopingVideoFunction.handler({ event, step: mockStep, logger: mockLogger })

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
        name: 'generate-model-training',
        data: generateModelTrainingData.valid_basic,
      }

      await generateModelTrainingFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'notify-progress',
        expect.any(Function),
      )
    })

    it('должен проверять квоты пользователя', async () => {
      const event = {
        name: 'generate-ai-reels',
        data: generateAIReelsData.valid_basic,
      }

      await generateAIReelsFunction.handler({ event, step: mockStep, logger: mockLogger })

      expect(mockStep.run).toHaveBeenCalledWith(
        'check-user-quotas',
        expect.any(Function),
      )
    })
  })
})
