/**
 * Comprehensive Tests for createModelTrainingLocal
 *
 * Test Coverage:
 * 1. Successful training creation with destination model
 * 2. Correct Replicate API parameters
 * 3. ZIP file validation
 * 4. Base64 conversion
 * 5. Database record creation
 * 6. Webhook disabled for local training
 * 7. Error handling for missing credentials
 * 8. Model creation and checking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Mock fs module
vi.mock('fs', async () => {
  // Сервис импортирует fs как DEFAULT (`import fs from 'fs'`), поэтому мок
  // обязан отдавать и default — иначе vitest сообщает
  // «No "default" export is defined on the "fs" mock».
  const api = {
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ size: 1024 })),
    readFileSync: vi.fn(() => Buffer.from('zip-content')),
    promises: {
      unlink: vi.fn(() => Promise.resolve()),
    },
  }
  return { ...api, default: api }
})

// Mock supabase
vi.mock('@/core/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        data: null,
        error: null,
      })),
    })),
  },
}))

// Mock logger
// Сервис импортирует пакет `replicate` НАПРЯМУЮ (`import Replicate from
// 'replicate'`) и создаёт клиента сам — мок обёртки @/core/replicate его не
// перехватывал, поэтому тесты уходили в живой API и падали на «Unauthorized»
// (по секунде на кейс). Плюс vi.mock внутри it() не работает: вызовы
// поднимаются в начало файла. Мокаем сам пакет.
// Спаи вынесены через vi.hoisted: фабрика vi.mock и сами тесты должны
// смотреть на ОДНИ И ТЕ ЖЕ функции. Раньше тесты объявляли mockReplicate
// внутри it() и звали там же vi.mock — обе конструкции не работают:
// vi.mock поднимается в начало файла, а локальный объект в фабрику не попадает.
const replicateMocks = vi.hoisted(() => ({
  modelsGet: vi.fn(),
  modelsCreate: vi.fn(),
  trainingsCreate: vi.fn(),
}))

vi.mock('replicate', () => {
  class Replicate {
    models = {
      get: replicateMocks.modelsGet,
      create: replicateMocks.modelsCreate,
    }
    trainings = { create: replicateMocks.trainingsCreate }
  }
  return { default: Replicate, Replicate }
})

// Провайдер выбирается как `requestData.provider || (FAL_KEY ? 'fal-ai' :
// 'replicate')`. В общем тестовом окружении FAL_KEY задан, поэтому без явного
// снятия ключа эти тесты уходили в ветку Fal.ai и в живой API. Файл проверяет
// именно ветку Replicate.
delete process.env.FAL_KEY

// Сервис строит webhook-адрес из BASE_WEBHOOK_URL / API_SERVER_URL.
process.env.BASE_WEBHOOK_URL = 'https://test.example.com'

// Сервис берёт креденшелы из констант @/config, а они связываются при импорте
// модуля — удаление process.env.* в самом тесте на них уже не влияет.
// Мокаем конфиг геттерами: значение читается в момент обращения, поэтому
// кейсы могут управлять им через окружение.
vi.mock('@/config', () => ({
  get REPLICATE_API_TOKEN() {
    return process.env.REPLICATE_API_TOKEN
  },
  get REPLICATE_USERNAME() {
    return process.env.REPLICATE_USERNAME
  },
  get FAL_KEY() {
    return process.env.FAL_KEY
  },
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

// Import fs after mocking to get mocked version
import * as fs from 'fs'

// Import after mocks
import { createModelTrainingLocal } from '@/services/createModelTrainingLocal'

// Mock MyContext
const mockContext = {
  from: { id: 123, username: 'test_user' },
  telegram: {
    getFile: vi.fn(),
  },
} as any

describe('createModelTrainingLocal', () => {
  beforeEach(() => {
    replicateMocks.modelsGet.mockResolvedValue({ id: 'test-model' })
    replicateMocks.modelsCreate.mockResolvedValue({ id: 'test-model' })
    replicateMocks.trainingsCreate.mockResolvedValue({
      id: 'training_123',
      status: 'starting',
      urls: { get: 'https://api.replicate.com/v1/trainings/training_123' },
    })
    vi.clearAllMocks()

    // Set up environment variables
    process.env.REPLICATE_API_TOKEN = 'test-token'
    process.env.REPLICATE_USERNAME = 'ghashtag'
  })

  afterEach(() => {
    delete process.env.REPLICATE_API_TOKEN
    delete process.env.REPLICATE_USERNAME
  })

  // Сервис после models.create ждёт 5 секунд («Wait for model to be fully
  // initialized»), что упирается в дефолтный таймаут теста в 5000 мс.
  it('should create training with destination model', async () => {
    // Mock replicate module
    const mockReplicate = {
      models: {
        get: vi.fn(),
        create: vi.fn(),
      },
      trainings: {
        create: vi.fn(),
      },
    }

    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))
    replicateMocks.modelsGet.mockRejectedValue({
      response: { status: 404 },
    })
    replicateMocks.modelsCreate.mockResolvedValue({
      url: 'https://replicate.com/ghashtag/test-model',
      latest_version: { id: 'version_123' },
    })
    replicateMocks.trainingsCreate.mockResolvedValue({
      id: 'training_123',
      status: 'starting',
    } as any)

    // Mock the module import
    vi.mock('@/core/replicate', () => ({
      replicate: mockReplicate,
    }))

    // Re-import after mocking
    const { createModelTrainingLocal: createModelTrainingLocalMocked } =
      await import('@/services/createModelTrainingLocal')

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: true,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    const result = await createModelTrainingLocalMocked(
      requestData,
      mockContext
    )

    // Verify model was checked
    expect(replicateMocks.modelsGet).toHaveBeenCalled()

    // Verify model was created
    expect(replicateMocks.modelsCreate).toHaveBeenCalled()

    // Verify training was created
    expect(replicateMocks.trainingsCreate).toHaveBeenCalled()

    // Get the call arguments
    // Сигнатура вызова: trainings.create(owner, modelName, version, options).
    // destination лежит в options (4-й аргумент), версия — 3-й аргумент;
    // прежний тест читал ПЕРВЫЙ аргумент ('ostris') и искал в нём поля.
    const [owner, modelName, version, options] =
      replicateMocks.trainingsCreate.mock.calls[0]

    expect(owner).toBe('ostris')
    expect(modelName).toBe('flux-dev-lora-trainer')
    expect(version).toBeDefined()

    expect(options.destination).toBeDefined()
    expect(options.destination).toContain('ghashtag/')
    expect(options.destination).toMatch(/ghashtag\/digital_avatar_model-\d+/)

    // Verify input parameters
    expect(options.input.input_images).toBeDefined()
    expect(options.input.trigger_word).toBe('NEURO_SAGE')
    expect(options.input.steps).toBe(1000)
    expect(options.input.lora_rank).toBe(128)
    expect(options.input.optimizer).toBe('adamw8bit')
    expect(options.input.batch_size).toBe(1)
    expect(options.input.resolution).toBe('512,768,1024')
    expect(options.input.autocaption).toBe(true)
    expect(options.input.learning_rate).toBe(0.0001)

    // Verify no webhook
    expect(options.webhook).toBeUndefined()
    expect(options.webhook_events_filter).toBeUndefined()

    // Verify result
    expect(result.message).toContain('Тренировка модели запущена')
    expect(result.training_id).toBe('training_123')
    expect(result.model_id).toBe('ostris/flux-dev-lora-trainer')
  }, 15000)

  it('should validate Replicate credentials', async () => {
    const { createModelTrainingLocal } = await import(
      '@/services/createModelTrainingLocal'
    )

    // Remove credentials
    delete process.env.REPLICATE_API_TOKEN
    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    await expect(
      createModelTrainingLocal(requestData, mockContext)
    ).rejects.toThrow('Missing REPLICATE_API_TOKEN')
  })

  it('should validate REPLICATE_USERNAME credential', async () => {
    const { createModelTrainingLocal } = await import(
      '@/services/createModelTrainingLocal'
    )

    // Remove REPLICATE_USERNAME
    delete process.env.REPLICATE_USERNAME
    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    await expect(
      createModelTrainingLocal(requestData, mockContext)
    ).rejects.toThrow('Missing REPLICATE_USERNAME')
  })

  it('should validate ZIP file exists', async () => {
    const { createModelTrainingLocal } = await import(
      '@/services/createModelTrainingLocal'
    )

    // Mock file doesn't exist
    fs.existsSync.mockReturnValue(false)

    const requestData = {
      filePath: '/tmp/nonexistent.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    await expect(
      createModelTrainingLocal(requestData, mockContext)
    ).rejects.toThrow('ZIP file not found')
  })

  // 🚩 ТЕСТ ПРОТИВОРЕЧИТ СОСЕДНЕМУ И САМОМУ КОДУ.
  // Выше кейс «should validate REPLICATE_USERNAME credential» требует, чтобы
  // отсутствие REPLICATE_USERNAME приводило к ошибке, а здесь — чтобы молча
  // подставлялось 'ghashtag'. Реализация выбирает первое, и это безопаснее:
  // тихо обучать модель под чужим аккаунтом хуже, чем громко потребовать
  // настройку. Плюс vi.mock внутри it() не действует (он поднимается в начало
  // файла), так что кейс не работал и технически.
  it.skip('should use fallback username if REPLICATE_USERNAME not set', async () => {
    delete process.env.REPLICATE_USERNAME

    // Mock Replicate module
    const mockReplicate = {
      models: {
        get: vi.fn(),
        create: vi.fn(),
      },
      trainings: {
        create: vi.fn().mockResolvedValue({
          id: 'training_123',
          status: 'starting',
        } as any),
      },
    }

    vi.mock('@/core/replicate', () => ({
      replicate: mockReplicate,
    }))

    // Re-import after mocking
    const { createModelTrainingLocal: createModelTrainingLocalMocked } =
      await import('@/services/createModelTrainingLocal')

    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    // Should not throw - uses fallback 'ghashtag'
    const result = await createModelTrainingLocalMocked(
      requestData,
      mockContext
    )
    expect(result).toBeDefined()
  })

  it('should clean up ZIP file after successful training', async () => {
    const { createModelTrainingLocal } = await import(
      '@/services/createModelTrainingLocal'
    )

    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    await createModelTrainingLocal(requestData, mockContext)

    // Verify file was deleted
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/test.zip')
  })

  it('should handle file cleanup on error', async () => {
    // Ошибку задаём общему спаю: локальный mockReplicate в сервис не попадает
    // (vi.mock внутри it() не работает).
    replicateMocks.trainingsCreate.mockRejectedValueOnce(
      new Error('Replicate API error')
    )
    // Mock Replicate module with error
    const mockReplicate = {
      models: {
        get: vi.fn(),
        create: vi.fn(),
      },
      trainings: {
        create: vi.fn(),
      },
    }

    vi.mock('@/core/replicate', () => ({
      replicate: mockReplicate,
    }))

    // Re-import after mocking
    const { createModelTrainingLocal: createModelTrainingLocalMocked } =
      await import('@/services/createModelTrainingLocal')

    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    await expect(
      createModelTrainingLocalMocked(requestData, mockContext)
    ).rejects.toThrow()

    // Verify file was deleted even on error
    expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/test.zip')
  })

  it('should return correct success message in Russian', async () => {
    const { createModelTrainingLocal } = await import(
      '@/services/createModelTrainingLocal'
    )

    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: true, // Russian
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    const result = await createModelTrainingLocal(requestData, mockContext)

    // Verify Russian message
    // Сообщение переписано: теперь это имя модели, ID тренировки, провайдер и
    // ожидаемое время. Идентификатор тренера переехал в поле model_id ответа —
    // проверяем его там, где он теперь живёт, а не в тексте.
    expect(result.message).toContain('Тренировка модели запущена')
    expect(result.message).toContain('Провайдер: Replicate')
    expect(result.message).toContain('training_123')
    expect(result.model_id).toBe('ostris/flux-dev-lora-trainer')
  })

  it('should return correct success message in English', async () => {
    const { createModelTrainingLocal } = await import(
      '@/services/createModelTrainingLocal'
    )

    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false, // English
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    const result = await createModelTrainingLocal(requestData, mockContext)

    // Verify English message
    expect(result.message).toContain('Model training started')
    expect(result.message).toContain('Provider: Replicate')
    expect(result.message).toContain('training_123')
    expect(result.model_id).toBe('ostris/flux-dev-lora-trainer')
  })

  it('should save training record to Supabase', async () => {
    const { createModelTrainingLocal } = await import(
      '@/services/createModelTrainingLocal'
    )

    const insertMock = vi.fn().mockReturnValue({ data: null, error: null })
    supabase.from.mockReturnValue({ insert: insertMock } as any)
    fs.existsSync.mockReturnValue(true)
    fs.statSync.mockReturnValue({ size: 1000000 } as any)
    fs.readFileSync.mockReturnValue(Buffer.from('test-zip-data'))

    const requestData = {
      filePath: '/tmp/test.zip',
      triggerWord: 'NEURO_SAGE',
      modelName: 'digital_avatar_model',
      telegram_id: '123',
      is_ru: false,
      steps: 1000,
      botName: 'test_bot',
      gender: 'male',
    }

    await createModelTrainingLocal(requestData, mockContext)

    // Verify database record was inserted
    expect(insertMock).toHaveBeenCalled()
    // Сервис вставляет ОДИН объект: .insert(trainingRecord) — не массив,
    // поэтому лишний индекс давал undefined.
    const insertedData = insertMock.mock.calls[0][0]
    expect(insertedData.telegram_id).toBe('123')
    expect(insertedData.model_name).toBe('digital_avatar_model')
    expect(insertedData.trigger_word).toBe('NEURO_SAGE')
    expect(insertedData.replicate_training_id).toBe('training_123')
    expect(insertedData.steps).toBe(1000)
    expect(insertedData.status).toBe('processing')
  })
})
