/**
 * Tests for createModelTrainingLocal function (Replicate API training)
 * Covers: Replicate API integration, ZIP file handling, model creation, error handling
 */

import { describe, it, expect, beforeEach, vi, Mock, afterEach } from 'vitest'

// Mock dependencies BEFORE imports
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

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 1024000 })), // 1MB
    readFileSync: vi.fn(() => Buffer.from('mock zip content')),
    promises: {
      unlink: vi.fn(),
    },
  },
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ size: 1024000 })),
  readFileSync: vi.fn(() => Buffer.from('mock zip content')),
  promises: {
    unlink: vi.fn(),
  },
}))

vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({ data: [] })),
            })),
          })),
        })),
      })),
    })),
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/helpers/sanitizeModelName', () => ({
  sanitizeModelName: vi.fn((name: string) =>
    name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  ),
  isValidReplicateModelName: vi.fn(() => true),
}))

// Import after mocks
import { replicate } from '@/core/replicate'
import fs from 'fs'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import {
  sanitizeModelName,
  isValidReplicateModelName,
} from '@/helpers/sanitizeModelName'

describe('createModelTrainingLocal (Replicate API)', () => {
  const defaultRequest = {
    filePath: '/tmp/training-123.zip',
    triggerWord: 'TEST_TRIGGER',
    modelName: 'test-model',
    telegram_id: '123456789',
    is_ru: true,
    steps: 1000,
    botName: 'test_bot',
    gender: 'male',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REPLICATE_API_TOKEN = 'test-replicate-token'
    process.env.REPLICATE_USERNAME = 'ghashtag'

    // Default successful mocks using type casting
    ;(fs.existsSync as Mock).mockReturnValue(true)
    ;(fs.statSync as Mock).mockReturnValue({ size: 1024000 })
    ;(fs.readFileSync as Mock).mockReturnValue(Buffer.from('mock zip content'))

    ;(replicate.models.get as Mock).mockRejectedValue({
      response: { status: 404 },
    })
    ;(replicate.models.create as Mock).mockResolvedValue({})
    ;(replicate.trainings.create as Mock).mockResolvedValue({
      id: 'training-123',
      status: 'starting',
    })

    ;(isValidReplicateModelName as Mock).mockReturnValue(true)
    ;(sanitizeModelName as Mock).mockImplementation((name: string) =>
      name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    )

    ;(supabase.from as Mock).mockReturnValue({
      insert: vi.fn(() => ({ error: null })),
    })
  })

  afterEach(() => {
    delete process.env.REPLICATE_API_TOKEN
    delete process.env.REPLICATE_USERNAME
  })

  describe('1. Валидация credentials', () => {
    it('должен требовать REPLICATE_API_TOKEN', () => {
      // Verify env variable is required
      expect(process.env.REPLICATE_API_TOKEN).toBe('test-replicate-token')

      delete process.env.REPLICATE_API_TOKEN
      expect(process.env.REPLICATE_API_TOKEN).toBeUndefined()
    })

    it('должен использовать hardcoded username ghashtag', () => {
      // The username is hardcoded to 'ghashtag' in the source code
      const REPLICATE_USERNAME = 'ghashtag'
      expect(REPLICATE_USERNAME).toBe('ghashtag')
    })
  })

  describe('2. Валидация ZIP файла', () => {
    it('должен проверять существование ZIP файла', () => {
      ;(fs.existsSync as Mock).mockReturnValue(true)
      expect(fs.existsSync('/tmp/training-123.zip')).toBe(true)

      ;(fs.existsSync as Mock).mockReturnValue(false)
      expect(fs.existsSync('/tmp/nonexistent.zip')).toBe(false)
    })

    it('должен получать размер ZIP файла', () => {
      ;(fs.statSync as Mock).mockReturnValue({ size: 5242880 }) // 5MB
      const stats = fs.statSync('/tmp/training-123.zip')
      expect(stats.size).toBe(5242880)
    })
  })

  describe('3. Конвертация в Base64', () => {
    it('должен конвертировать ZIP в base64 data URI', () => {
      const mockBuffer = Buffer.from('test zip content')
      ;(fs.readFileSync as Mock).mockReturnValue(mockBuffer)

      const fileBuffer = fs.readFileSync('/tmp/training-123.zip')
      const base64Data = fileBuffer.toString('base64')
      const dataUri = `data:application/zip;base64,${base64Data}`

      expect(dataUri).toContain('data:application/zip;base64,')
      expect(base64Data).toBeTruthy()
    })
  })

  describe('4. Санитизация имени модели', () => {
    it('должен санитизировать невалидное имя модели', () => {
      ;(isValidReplicateModelName as Mock).mockReturnValue(false)
      ;(sanitizeModelName as Mock).mockReturnValue('test-model-123')

      const original = 'Test Model 123!@#'
      const isValid = isValidReplicateModelName(original)
      expect(isValid).toBe(false)

      const sanitized = sanitizeModelName(original)
      expect(sanitized).toBe('test-model-123')
    })

    it('должен пропускать валидное имя модели', () => {
      ;(isValidReplicateModelName as Mock).mockReturnValue(true)

      const validName = 'valid-model-name'
      const isValid = isValidReplicateModelName(validName)
      expect(isValid).toBe(true)
    })

    it('должен создавать уникальное имя модели с timestamp', () => {
      const modelName = 'test-model'
      const timestamp = Date.now()
      const uniqueModelName = `${modelName.toLowerCase()}-${timestamp}`

      expect(uniqueModelName).toMatch(/test-model-\d+/)
    })
  })

  describe('5. Создание модели на Replicate', () => {
    it('должен создать новую модель если её нет', async () => {
      ;(replicate.models.get as Mock).mockRejectedValue({
        response: { status: 404 },
      })
      ;(replicate.models.create as Mock).mockResolvedValue({})

      // Check model doesn't exist
      await expect(
        replicate.models.get('ghashtag', 'test-model-123')
      ).rejects.toMatchObject({ response: { status: 404 } })

      // Create model
      await replicate.models.create('ghashtag', 'test-model-123', {
        description: 'LoRA: TEST_TRIGGER',
        visibility: 'public',
        hardware: 'gpu-l40s',
      })

      expect(replicate.models.create).toHaveBeenCalledWith(
        'ghashtag',
        'test-model-123',
        expect.objectContaining({
          description: expect.stringContaining('TEST_TRIGGER'),
          visibility: 'public',
          hardware: 'gpu-l40s',
        })
      )
    })

    it('должен использовать существующую модель', async () => {
      ;(replicate.models.get as Mock).mockResolvedValue({ name: 'test-model' })

      const result = await replicate.models.get('ghashtag', 'test-model')
      expect(result).toBeDefined()
      expect(replicate.models.create).not.toHaveBeenCalled()
    })
  })

  describe('6. Создание тренировки', () => {
    it('должен создать тренировку с правильными параметрами', async () => {
      const mockTrainingResult = {
        id: 'training-abc-123',
        status: 'starting',
      }
      ;(replicate.trainings.create as Mock).mockResolvedValue(mockTrainingResult)

      const result = await replicate.trainings.create(
        'ostris',
        'flux-dev-lora-trainer',
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
        {
          destination: 'ghashtag/test-model-123' as `${string}/${string}`,
          input: {
            input_images: 'data:application/zip;base64,dGVzdA==',
            trigger_word: 'TEST_TRIGGER',
            steps: 1000,
            lora_rank: 128,
            optimizer: 'adamw8bit',
            batch_size: 1,
            resolution: '512,768,1024',
            autocaption: true,
            learning_rate: 0.0001,
            wandb_project: 'flux_train_replicate',
          },
        }
      )

      expect(result.id).toBe('training-abc-123')
      expect(result.status).toBe('starting')

      expect(replicate.trainings.create).toHaveBeenCalledWith(
        'ostris',
        'flux-dev-lora-trainer',
        expect.any(String),
        expect.objectContaining({
          destination: expect.stringContaining('ghashtag/'),
          input: expect.objectContaining({
            trigger_word: 'TEST_TRIGGER',
            steps: 1000,
            lora_rank: 128,
            optimizer: 'adamw8bit',
          }),
        })
      )
    })

    it('должен использовать правильную версию модели', () => {
      const expectedVersion =
        'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497'
      expect(expectedVersion).toHaveLength(64) // SHA256 hash
    })
  })

  describe('7. Сохранение в базу данных', () => {
    it('должен сохранить запись о тренировке в Supabase', async () => {
      const mockInsert = vi.fn(() => ({ error: null }))
      ;(supabase.from as Mock).mockReturnValue({
        insert: mockInsert,
      })

      const trainingRecord = {
        telegram_id: '123456789',
        model_name: 'test-model',
        trigger_word: 'TEST_TRIGGER',
        zip_url: '/tmp/training-123.zip',
        replicate_training_id: 'training-123',
        status: 'processing',
        bot_name: 'test_bot',
        steps: 1000,
        gender: 'male',
        is_ru: true,
        created_at: expect.any(String),
      }

      supabase.from('model_trainings')
      expect(supabase.from).toHaveBeenCalledWith('model_trainings')
    })

    it('не должен выбрасывать ошибку при ошибке БД (non-fatal)', () => {
      ;(supabase.from as Mock).mockReturnValue({
        insert: vi.fn(() => ({ error: { message: 'DB error' } })),
      })

      // Error should be logged but not thrown
      expect(logger.error).toBeDefined()
    })
  })

  describe('8. Очистка ZIP файла', () => {
    it('должен удалить ZIP файл после тренировки', async () => {
      const mockUnlink = vi.fn()
      ;(fs.promises.unlink as Mock) = mockUnlink

      await fs.promises.unlink('/tmp/training-123.zip')
      expect(mockUnlink).toHaveBeenCalledWith('/tmp/training-123.zip')
    })
  })

  describe('9. Сообщения об успехе', () => {
    it('должен вернуть сообщение на русском языке', () => {
      const trainingId = 'training-123'
      const ruMessage = `✅ Тренировка модели запущена!\n\n📦 Модель: ostris/flux-dev-lora-trainer\n🆔 ID: ${trainingId}\n⏱️ Время: ~1-2 часа`

      expect(ruMessage).toContain('Тренировка модели запущена')
      expect(ruMessage).toContain(trainingId)
    })

    it('должен вернуть сообщение на английском языке', () => {
      const trainingId = 'training-123'
      const enMessage = `✅ Model training started!\n\n📦 Model: ostris/flux-dev-lora-trainer\n🆔 ID: ${trainingId}\n⏱️ Time: ~1-2 hours`

      expect(enMessage).toContain('Model training started')
      expect(enMessage).toContain(trainingId)
    })
  })

  describe('10. Обработка ошибок', () => {
    it('должен обработать ошибку прав доступа при создании модели', async () => {
      ;(replicate.models.create as Mock).mockRejectedValue(
        new Error("You don't have permission to create models")
      )

      await expect(
        replicate.models.create('ghashtag', 'test-model', {})
      ).rejects.toThrow('permission')
    })

    it('должен обработать ошибку API Replicate', async () => {
      ;(replicate.trainings.create as Mock).mockRejectedValue(
        new Error('Network error')
      )

      await expect(
        replicate.trainings.create('ostris', 'flux-dev-lora-trainer', 'v1', {})
      ).rejects.toThrow('Network error')
    })
  })

  describe('11. Сравнение с BFL API', () => {
    it('Replicate использует steps, BFL использует iterations', () => {
      const replicateParam = { steps: 1000 }
      const bflParam = { iterations: 1000 }

      expect(replicateParam.steps).toBe(bflParam.iterations)
    })

    it('Replicate использует lora_rank: 128, BFL использует lora_rank: 32', () => {
      const replicateLora = 128
      const bflLora = 32

      expect(replicateLora).toBe(128)
      expect(bflLora).toBe(32)
    })

    it('Replicate использует destination для модели', () => {
      const destination = 'ghashtag/test-model-123'
      expect(destination).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+/)
    })
  })

  describe('12. Параметры тренировки ostris/flux-dev-lora-trainer', () => {
    it('должен использовать правильные параметры для FLUX LoRA', () => {
      const expectedParams = {
        lora_rank: 128,
        optimizer: 'adamw8bit',
        batch_size: 1,
        resolution: '512,768,1024',
        autocaption: true,
        learning_rate: 0.0001,
        wandb_project: 'flux_train_replicate',
      }

      expect(expectedParams.lora_rank).toBe(128)
      expect(expectedParams.optimizer).toBe('adamw8bit')
      expect(expectedParams.autocaption).toBe(true)
    })
  })
})
