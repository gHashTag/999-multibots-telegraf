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
import fs from 'fs'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

// Mock fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
    promises: {
      unlink: vi.fn(),
    },
  }
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
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

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
    vi.clearAllMocks()

    // Set up environment variables
    process.env.REPLICATE_API_TOKEN = 'test-token'
    process.env.REPLICATE_USERNAME = 'ghashtag'
  })

  afterEach(() => {
    delete process.env.REPLICATE_API_TOKEN
    delete process.env.REPLICATE_USERNAME
  })

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

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

    ;(vi as any).mocked(mockReplicate.models.get).mockRejectedValue({
      response: { status: 404 }
    })
    ;(vi as any).mocked(mockReplicate.models.create).mockResolvedValue({
      url: 'https://replicate.com/ghashtag/test-model',
      latest_version: { id: 'version_123' }
    })
    ;(vi as any).mocked(mockReplicate.trainings.create).mockResolvedValue({
      id: 'training_123',
      status: 'starting',
    } as any)

    // Mock the module import
    vi.doMock('@/core/replicate', () => ({
      replicate: mockReplicate,
    }))

    // Re-import after mocking
    const { createModelTrainingLocal: createModelTrainingLocalMocked } = await import('@/services/createModelTrainingLocal')

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

    const result = await createModelTrainingLocalMocked(requestData, mockContext)

    // Verify model was checked
    expect(mockReplicate.models.get).toHaveBeenCalled()

    // Verify model was created
    expect(mockReplicate.models.create).toHaveBeenCalled()

    // Verify training was created
    expect(mockReplicate.trainings.create).toHaveBeenCalled()

    // Get the call arguments
    const callArgs = (vi as any).mocked(mockReplicate.trainings.create).mock.calls[0][0]

    // Verify destination is provided
    expect(callArgs.destination).toBeDefined()
    expect(callArgs.destination).toContain('ghashtag/')
    expect(callArgs.destination).toMatch(/ghashtag\/digital_avatar_model-\d+/)

    // Verify version is provided
    expect(callArgs.version).toBe('ostris/flux-dev-lora-trainer:e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497')

    // Verify input parameters
    expect(callArgs.input.input_images).toBeDefined()
    expect(callArgs.input.trigger_word).toBe('NEURO_SAGE')
    expect(callArgs.input.steps).toBe(1000)
    expect(callArgs.input.lora_rank).toBe(128)
    expect(callArgs.input.optimizer).toBe('adamw8bit')
    expect(callArgs.input.batch_size).toBe(1)
    expect(callArgs.input.resolution).toBe('512,768,1024')
    expect(callArgs.input.autocaption).toBe(true)
    expect(callArgs.input.learning_rate).toBe(0.0001)

    // Verify no webhook
    expect(callArgs.webhook).toBeUndefined()
    expect(callArgs.webhook_events_filter).toBeUndefined()

    // Verify result
    expect(result.message).toContain('Тренировка модели запущена')
    expect(result.training_id).toBe('training_123')
    expect(result.model_id).toBe('ostris/flux-dev-lora-trainer')
  })

  it('should validate Replicate credentials', async () => {
    const { createModelTrainingLocal } = await import('@/services/createModelTrainingLocal')

    // Remove credentials
    delete process.env.REPLICATE_API_TOKEN

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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

    await expect(createModelTrainingLocal(requestData, mockContext)).rejects.toThrow('Missing REPLICATE_API_TOKEN')
  })

  it('should validate REPLICATE_USERNAME credential', async () => {
    const { createModelTrainingLocal } = await import('@/services/createModelTrainingLocal')

    // Remove REPLICATE_USERNAME
    delete process.env.REPLICATE_USERNAME

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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

    await expect(createModelTrainingLocal(requestData, mockContext)).rejects.toThrow('Missing REPLICATE_USERNAME')
  })

  it('should validate ZIP file exists', async () => {
    const { createModelTrainingLocal } = await import('@/services/createModelTrainingLocal')

    // Mock file doesn't exist
    ;(vi as any).mocked(fs.existsSync).mockReturnValue(false)

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

    await expect(createModelTrainingLocal(requestData, mockContext)).rejects.toThrow('ZIP file not found')
  })

  it('should use fallback username if REPLICATE_USERNAME not set', async () => {
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

    vi.doMock('@/core/replicate', () => ({
      replicate: mockReplicate,
    }))

    // Re-import after mocking
    const { createModelTrainingLocal: createModelTrainingLocalMocked } = await import('@/services/createModelTrainingLocal')

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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
    const result = await createModelTrainingLocalMocked(requestData, mockContext)
    expect(result).toBeDefined()
  })

  it('should clean up ZIP file after successful training', async () => {
    const { createModelTrainingLocal } = await import('@/services/createModelTrainingLocal')

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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
    expect((vi as any).mocked(fs.promises.unlink)).toHaveBeenCalledWith('/tmp/test.zip')
  })

  it('should handle file cleanup on error', async () => {
    // Mock Replicate module with error
    const mockReplicate = {
      models: {
        get: vi.fn(),
        create: vi.fn(),
      },
      trainings: {
        create: vi.fn().mockRejectedValue(new Error('Replicate API error')),
      },
    }

    vi.doMock('@/core/replicate', () => ({
      replicate: mockReplicate,
    }))

    // Re-import after mocking
    const { createModelTrainingLocal: createModelTrainingLocalMocked } = await import('@/services/createModelTrainingLocal')

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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

    await expect(createModelTrainingLocalMocked(requestData, mockContext)).rejects.toThrow()

    // Verify file was deleted even on error
    expect((vi as any).mocked(fs.promises.unlink)).toHaveBeenCalledWith('/tmp/test.zip')
  })

  it('should return correct success message in Russian', async () => {
    const { createModelTrainingLocal } = await import('@/services/createModelTrainingLocal')

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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
    expect(result.message).toContain('Тренировка модели запущена')
    expect(result.message).toContain('ostris/flux-dev-lora-trainer')
    expect(result.message).toContain('Прямая ссылка: https://replicate.com/models/training_123')
    expect(result.message).toContain('Статус проверяйте по прямой ссылке выше')
  })

  it('should return correct success message in English', async () => {
    const { createModelTrainingLocal } = await import('@/services/createModelTrainingLocal')

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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
    expect(result.message).toContain('ostris/flux-dev-lora-trainer')
    expect(result.message).toContain('Direct link: https://replicate.com/models/training_123')
    expect(result.message).toContain('Check status using the direct link above')
  })

  it('should save training record to Supabase', async () => {
    const { createModelTrainingLocal } = await import('@/services/createModelTrainingLocal')

    const insertMock = vi.fn().mockReturnValue({ data: null, error: null })
    ;(vi as any).mocked(supabase.from).mockReturnValue({ insert: insertMock } as any)

    ;(vi as any).mocked(fs.existsSync).mockReturnValue(true)
    ;(vi as any).mocked(fs.statSync).mockReturnValue({ size: 1000000 } as any)
    ;(vi as any).mocked(fs.readFileSync).mockReturnValue(Buffer.from('test-zip-data'))

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
    const insertedData = (vi as any).mocked(insertMock).mock.calls[0][0][0]
    expect(insertedData.telegram_id).toBe('123')
    expect(insertedData.model_name).toBe('digital_avatar_model')
    expect(insertedData.trigger_word).toBe('NEURO_SAGE')
    expect(insertedData.replicate_training_id).toBe('training_123')
    expect(insertedData.steps).toBe(1000)
    expect(insertedData.status).toBe('processing')
  })
})
