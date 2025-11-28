/**
 * Тесты для Inngest функции Model Training
 * Проверяет весь flow от получения события до создания тренировки на Replicate
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Моки
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/core/replicate', () => ({
  replicate: {
    models: {
      get: vi.fn(),
      create: vi.fn(),
    },
    trainings: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ error: null })),
    })),
  },
}))

vi.mock('@/helpers/sanitizeModelName', () => ({
  sanitizeModelName: vi.fn((name: string) =>
    name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  ),
  isValidReplicateModelName: vi.fn((name: string) =>
    /^[a-z0-9-]+$/.test(name.toLowerCase())
  ),
}))

vi.mock('@/inngest_app/services/bot-adapter', () => ({
  getBotByNameAdapter: vi.fn(() => ({
    bot: {
      telegram: {
        sendMessage: vi.fn(),
      },
    },
    error: null,
  })),
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 1024 })),
    createWriteStream: vi.fn(),
    readFileSync: vi.fn(() => Buffer.from('test zip content')),
    promises: {
      unlink: vi.fn(),
    },
  },
}))

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
  },
}))

vi.mock('axios', () => ({
  default: vi.fn(() => ({
    data: {
      pipe: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          setTimeout(callback, 0)
        }
      }),
    },
  })),
}))

// Импорты после моков
import { logger } from '@/utils/logger'
import { replicate } from '@/core/replicate'
import { supabase } from '@/core/supabase'
import { getBotByNameAdapter } from '@/inngest_app/services/bot-adapter'
import { createGenerateModelTrainingFunction } from '@/inngest_app/functions/existing/generateModelTrainingFunction'

describe('generateModelTrainingFunction', () => {
  const mockInngest = {
    createFunction: vi.fn((config, trigger, handler) => handler),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REPLICATE_API_TOKEN = 'test-token'
    process.env.REPLICATE_USERNAME = 'testuser'
  })

  describe('валидация данных события', () => {
    it('должен проверить наличие REPLICATE_API_TOKEN', async () => {
      delete process.env.REPLICATE_API_TOKEN

      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      const mockSendMessage = vi.fn()
      vi.mocked(getBotByNameAdapter).mockReturnValue({
        bot: {
          telegram: {
            sendMessage: mockSendMessage,
          },
        },
        error: null,
      })

      const result = await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing REPLICATE_API_TOKEN')
    })

    it('должен проверить наличие REPLICATE_USERNAME', async () => {
      delete process.env.REPLICATE_USERNAME

      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      const mockSendMessage = vi.fn()
      vi.mocked(getBotByNameAdapter).mockReturnValue({
        bot: {
          telegram: {
            sendMessage: mockSendMessage,
          },
        },
        error: null,
      })

      const result = await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Missing REPLICATE_USERNAME')
    })
  })

  describe('обработка base64 data URI', () => {
    it('должен использовать zipDataUri напрямую без загрузки', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          return {
            destination: 'testuser/test-model-123',
            uniqueModelName: 'test-model-123',
          }
        }
        if (name === 'create-replicate-model') {
          return undefined
        }
        if (name === 'create-replicate-training') {
          return { id: 'training-123', status: 'starting' }
        }
        if (name === 'save-training-record') {
          return undefined
        }
        if (name === 'send-telegram-notification') {
          return undefined
        }
        return fn()
      })

      // Мокаем replicate
      vi.mocked(replicate.models.get).mockRejectedValue({
        response: { status: 404 },
      })
      vi.mocked(replicate.models.create).mockResolvedValue({} as any)
      vi.mocked(replicate.trainings.create).mockResolvedValue({
        id: 'training-123',
        status: 'starting',
      } as any)

      const result = await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as any)

      expect(result.success).toBe(true)
      expect(result.training_id).toBe('training-123')
      expect(logger.info).toHaveBeenCalledWith(
        '[INNGEST TRAINING] Using base64 data URI directly',
        expect.objectContaining({
          dataUriLength: expect.any(Number),
        })
      )
    })
  })

  describe('санитизация имени модели', () => {
    it('должен санитизировать невалидное имя модели', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'Test Model 123!@#',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          return fn()
        }
        if (name === 'create-replicate-model') {
          return undefined
        }
        if (name === 'create-replicate-training') {
          return { id: 'training-123', status: 'starting' }
        }
        if (name === 'save-training-record') {
          return undefined
        }
        if (name === 'send-telegram-notification') {
          return undefined
        }
        return fn()
      })

      vi.mocked(replicate.models.get).mockRejectedValue({
        response: { status: 404 },
      })
      vi.mocked(replicate.models.create).mockResolvedValue({} as any)
      vi.mocked(replicate.trainings.create).mockResolvedValue({
        id: 'training-123',
        status: 'starting',
      } as any)

      await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as InngestFunctionInput)

      expect(logger.warn).toHaveBeenCalledWith(
        '[INNGEST TRAINING] Invalid model name, sanitizing',
        expect.objectContaining({
          original: 'Test Model 123!@#',
        })
      )
    })
  })

  describe('создание модели на Replicate', () => {
    it('должен создать новую модель если её нет', async () => {
      // Мокаем setTimeout чтобы не ждать 5 секунд
      const originalSetTimeout = global.setTimeout
      global.setTimeout = vi.fn((callback: () => void) => {
        // Вызываем callback сразу
        Promise.resolve().then(() => callback())
        return {} as any
      }) as any

      try {
        const functionHandler = createGenerateModelTrainingFunction(mockInngest)
        const mockEvent = createMockEvent({
          telegram_id: '123',
          modelName: 'test-model',
          triggerWord: 'TEST',
          zipDataUri: 'data:application/zip;base64,dGVzdA==',
          steps: 1000,
          bot_name: 'test_bot',
          is_ru: true,
          gender: 'male',
        })

        const mockStep = createMockStep()
        mockStep.run.mockImplementation(async (name, fn) => {
          if (name === 'sanitize-model-name') {
            return {
              destination: 'testuser/test-model-123',
              uniqueModelName: 'test-model-123',
            }
          }
          if (name === 'create-replicate-model') {
            return fn()
          }
          if (name === 'create-replicate-training') {
            return { id: 'training-123', status: 'starting' }
          }
          if (name === 'save-training-record') {
            return undefined
          }
          if (name === 'send-telegram-notification') {
            return undefined
          }
          return fn()
        })

        vi.mocked(replicate.models.get).mockRejectedValue({
          response: { status: 404 },
        })
        vi.mocked(replicate.models.create).mockResolvedValue({} as any)
        vi.mocked(replicate.trainings.create).mockResolvedValue({
          id: 'training-123',
          status: 'starting',
        } as any)

        await functionHandler({
          event: mockEvent,
          step: mockStep,
        } as any)

        expect(replicate.models.create).toHaveBeenCalledWith(
          'testuser',
          expect.stringContaining('test-model'),
          expect.objectContaining({
            description: expect.stringContaining('TEST'),
            visibility: 'public',
            hardware: 'gpu-l40s',
          })
        )
      } finally {
        global.setTimeout = originalSetTimeout
      }
    }, 10000)

    it('должен использовать существующую модель если она есть', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          return {
            destination: 'testuser/test-model-123',
            uniqueModelName: 'test-model-123',
          }
        }
        if (name === 'create-replicate-model') {
          return fn()
        }
        if (name === 'create-replicate-training') {
          return { id: 'training-123', status: 'starting' }
        }
        if (name === 'save-training-record') {
          return undefined
        }
        if (name === 'send-telegram-notification') {
          return undefined
        }
        return fn()
      })

      vi.mocked(replicate.models.get).mockResolvedValue({} as any)
      vi.mocked(replicate.trainings.create).mockResolvedValue({
        id: 'training-123',
        status: 'starting',
      } as any)

      await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as InngestFunctionInput)

      expect(replicate.models.create).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        '[INNGEST TRAINING] Model already exists'
      )
    })
  })

  describe('создание тренировки на Replicate', () => {
    it('должен создать тренировку с правильными параметрами', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          return {
            destination: 'testuser/test-model-123',
            uniqueModelName: 'test-model-123',
          }
        }
        if (name === 'create-replicate-model') {
          return undefined
        }
        if (name === 'create-replicate-training') {
          return fn()
        }
        if (name === 'save-training-record') {
          return undefined
        }
        if (name === 'send-telegram-notification') {
          return undefined
        }
        return fn()
      })

      vi.mocked(replicate.models.get).mockRejectedValue({
        response: { status: 404 },
      })
      vi.mocked(replicate.models.create).mockResolvedValue({} as any)
      vi.mocked(replicate.trainings.create).mockResolvedValue({
        id: 'training-123',
        status: 'starting',
      } as any)

      await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as InngestFunctionInput)

      expect(replicate.trainings.create).toHaveBeenCalledWith(
        'ostris',
        'flux-dev-lora-trainer',
        expect.any(String),
        expect.objectContaining({
          destination: 'testuser/test-model-123',
          input: expect.objectContaining({
            input_images: 'data:application/zip;base64,dGVzdA==',
            trigger_word: 'TEST',
            steps: 1000,
            lora_rank: 128,
            optimizer: 'adamw8bit',
            batch_size: 1,
            resolution: '512,768,1024',
            autocaption: true,
            learning_rate: 0.0001,
            wandb_project: 'flux_train_replicate',
          }),
        })
      )
    })

    it('должен конвертировать steps из string в number', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: '2000', // string
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          return {
            destination: 'testuser/test-model-123',
            uniqueModelName: 'test-model-123',
          }
        }
        if (name === 'create-replicate-model') {
          return undefined
        }
        if (name === 'create-replicate-training') {
          return fn()
        }
        if (name === 'save-training-record') {
          return undefined
        }
        if (name === 'send-telegram-notification') {
          return undefined
        }
        return fn()
      })

      vi.mocked(replicate.models.get).mockRejectedValue({
        response: { status: 404 },
      })
      vi.mocked(replicate.models.create).mockResolvedValue({} as any)
      vi.mocked(replicate.trainings.create).mockResolvedValue({
        id: 'training-123',
        status: 'starting',
      } as any)

      await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as InngestFunctionInput)

      expect(replicate.trainings.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({
            steps: 2000, // должно быть number
          }),
        })
      )
    })
  })

  describe('сохранение в базу данных', () => {
    it('должен сохранить запись о тренировке в БД', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockStep = createMockStep()
      const mockInsert = vi.fn(() => ({ error: null }))
      vi.mocked(supabase.from).mockReturnValue({
        insert: mockInsert,
      } as any)

      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          return {
            destination: 'testuser/test-model-123',
            uniqueModelName: 'test-model-123',
          }
        }
        if (name === 'create-replicate-model') {
          return undefined
        }
        if (name === 'create-replicate-training') {
          return { id: 'training-123', status: 'starting' }
        }
        if (name === 'save-training-record') {
          return fn()
        }
        if (name === 'send-telegram-notification') {
          return undefined
        }
        return fn()
      })

      vi.mocked(replicate.models.get).mockRejectedValue({
        response: { status: 404 },
      })
      vi.mocked(replicate.models.create).mockResolvedValue({} as any)
      vi.mocked(replicate.trainings.create).mockResolvedValue({
        id: 'training-123',
        status: 'starting',
      } as any)

      await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as InngestFunctionInput)

      expect(supabase.from).toHaveBeenCalledWith('model_trainings')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          telegram_id: '123',
          model_name: 'test-model',
          trigger_word: 'TEST',
          zip_url: null,
          replicate_training_id: 'training-123',
          status: 'processing',
          bot_name: 'test_bot',
          steps: 1000,
          gender: 'male',
          is_ru: true,
        })
      )
    })
  })

  describe('отправка уведомления пользователю', () => {
    it('должен отправить уведомление через правильного бота', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockSendMessage = vi.fn()
      vi.mocked(getBotByNameAdapter).mockReturnValue({
        bot: {
          telegram: {
            sendMessage: mockSendMessage,
          },
        },
        error: null,
      })

      const mockStep = createMockStep()
      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          return {
            destination: 'testuser/test-model-123',
            uniqueModelName: 'test-model-123',
          }
        }
        if (name === 'create-replicate-model') {
          return undefined
        }
        if (name === 'create-replicate-training') {
          return { id: 'training-123', status: 'starting' }
        }
        if (name === 'save-training-record') {
          return undefined
        }
        if (name === 'send-telegram-notification') {
          return fn()
        }
        return fn()
      })

      vi.mocked(replicate.models.get).mockRejectedValue({
        response: { status: 404 },
      })
      vi.mocked(replicate.models.create).mockResolvedValue({} as any)
      vi.mocked(replicate.trainings.create).mockResolvedValue({
        id: 'training-123',
        status: 'starting',
      } as any)

      await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as InngestFunctionInput)

      expect(getBotByNameAdapter).toHaveBeenCalledWith('test_bot')
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Тренировка модели запущена')
      )
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('testuser/test-model-123')
      )
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('training-123')
      )
    })
  })

  describe('обработка ошибок', () => {
    it('должен отправить уведомление об ошибке пользователю', async () => {
      const functionHandler = createGenerateModelTrainingFunction(mockInngest)
      const mockEvent = createMockEvent({
        telegram_id: '123',
        modelName: 'test-model',
        triggerWord: 'TEST',
        zipDataUri: 'data:application/zip;base64,dGVzdA==',
        steps: 1000,
        bot_name: 'test_bot',
        is_ru: true,
        gender: 'male',
      })

      const mockSendMessage = vi.fn()
      vi.mocked(getBotByNameAdapter).mockReturnValue({
        bot: {
          telegram: {
            sendMessage: mockSendMessage,
          },
        },
        error: null,
      })

      const mockStep = createMockStep()
      mockStep.run.mockImplementation(async (name, fn) => {
        if (name === 'sanitize-model-name') {
          throw new Error('Test error')
        }
        return fn()
      })

      const result = await functionHandler({
        event: mockEvent,
        step: mockStep,
      } as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Test error')
      expect(mockSendMessage).toHaveBeenCalledWith(
        123,
        expect.stringContaining('Ошибка при запуске тренировки')
      )
    })
  })
})

// Вспомогательные функции
function createMockEvent(data: {
  telegram_id: string
  modelName: string
  triggerWord: string
  zipDataUri: string
  steps: number | string
  bot_name: string
  is_ru: boolean
  gender: string
}) {
  return {
    name: 'model/training.start',
    data,
  }
}

function createMockStep() {
  return {
    run: vi.fn(),
    waitForEvent: vi.fn(),
    sleep: vi.fn(),
  }
}
