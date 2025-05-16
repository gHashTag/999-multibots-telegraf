import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Inngest, NonRetriableError } from 'inngest'
import { DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'
import ReplicateClient, { Training as ReplicateTraining } from 'replicate'
import { InngestTestEngine } from '@inngest/test'
import { getUserByTelegramId } from '@/core/supabase'
import {
  validateAndPrepareTrainingRequest,
  startReplicateTraining,
  PreparedTrainingData,
  updateTrainingRecordOnError,
  formatReplicateModelName,
  checkAndSetTrainingCache,
  updateTrainingStatus,
  TRAINING_MESSAGES,
} from '@/modules/digitalAvatarBody/helpers/trainingHelpers'
import { sendTelegramMessageFromWorker } from '@/utils/telegramHelpers'
import { logger } from '@/utils/logger'
import type { Telegraf } from 'telegraf'
import type { User } from '@/interfaces/user.interface'
import { PaymentType } from '@/interfaces/payments.interface'
import * as modelTrainingsDb from '@/modules/digitalAvatarBody/helpers/modelTrainingsDb'
import type { DigitalAvatarUserProfile } from '../../helpers/userProfileDb'
import type { ModelTraining } from '../../helpers/modelTrainingsDb'
import type { ModelTrainingInngestEventData } from '../../types'
import { createGenerateModelTraining } from '../generateModelTraining'

// --- Мокирование зависимостей ---

// Глобальные supabaseMockObject и supabaseAdminMockObject УДАЛЕНЫ.
// Каждый vi.mock будет определять свои собственные, полностью независимые моки.

vi.mock('@/core/supabase/client', () => ({
  supabase: {
    // Независимый мок для @/core/supabase/client
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
  supabaseAdmin: {
    // Независимый мок для @/core/supabase/client
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}))

vi.mock('@/core/supabase', async importOriginal => {
  const original = await importOriginal<any>()
  return {
    ...original,
    getUserByTelegramId: vi.fn(),
    updateUserBalance: vi.fn(),
    updateUserNeuroTokens: vi.fn(),
    supabase: {
      // Совершенно независимый мок для @/core/supabase
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    supabaseAdmin: {
      // Совершенно независимый мок для @/core/supabase
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      })),
      rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  }
})

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock(
  '@/modules/digitalAvatarBody/helpers/trainingHelpers',
  async importOriginal => {
    const original = await importOriginal<any>()
    return {
      ...original,
      validateAndPrepareTrainingRequest: vi.fn(),
      startReplicateTraining: vi.fn(),
      updateTrainingRecordOnError: vi.fn(),
    }
  }
)

vi.mock(
  '@/modules/digitalAvatarBody/helpers/modelTrainingsDb',
  async importOriginal => {
    const original = await importOriginal<any>()
    return {
      ...original,
      createDigitalAvatarTraining: vi.fn(),
      updateDigitalAvatarTraining: vi.fn(),
      setDigitalAvatarTrainingError: vi.fn(),
      getDigitalAvatarTrainingByReplicateIdWithUserDetails: vi.fn(),
    }
  }
)

vi.mock('@/utils/telegramHelpers', async () => ({
  sendTelegramMessageFromWorker: vi.fn(),
}))

vi.mock('replicate', () => {
  const MockReplicateClient = vi.fn().mockImplementation(() => ({
    trainings: {
      create: vi.fn(),
      get: vi.fn(),
    },
  }))
  return {
    default: MockReplicateClient,
  }
})

vi.mock('telegraf')

// --- Конец мокирования зависимостей ---

// Initialize Inngest and the function to test
const inngestInstance = new Inngest({
  name: 'Test Inngest Client',
  eventKey: 'test',
})
const inngestFunctionToTest = createGenerateModelTraining(inngestInstance)

// --- Типы для мокированных функций (для удобства) ---
type MockedTrainingHelpers = DeepMockProxy<
  typeof import('@/modules/digitalAvatarBody/helpers/trainingHelpers')
>

describe('generateModelTraining Inngest Function', () => {
  let testEngine: InngestTestEngine
  let mockLogger: ReturnType<typeof vi.mocked<typeof logger>>
  let mockSupabaseHelpers: DeepMockProxy<typeof import('@/core/supabase')>
  let mockHelpers: MockedTrainingHelpers
  let mockReplicateClient: DeepMockProxy<ReplicateClient>
  let mockSendTelegramMessageFromWorker: ReturnType<typeof vi.fn>
  let mockModelTrainingsDb: DeepMockProxy<typeof modelTrainingsDb>

  const mockUser: DigitalAvatarUserProfile = {
    id: 'user-uuid-123',
    telegram_id: '12345',
    username: 'testUserInFunctionsTest',
    balance: 1000,
    neuro_tokens: 500,
    replicate_username: 'testuser_replicate',
    level: 1,
  }

  const defaultEventData: ModelTrainingInngestEventData = {
    user_id: mockUser.id,
    telegram_id: mockUser.telegram_id!,
    is_ru: true,
    bot_name: 'test_bot_from_event',
    bot_token: 'test_bot_token_from_event',
    model_name: 'event_model_name',
    trigger_word: 'event_trigger_word',
    publicUrl: 'http://example.com/event_public.zip',
    steps: 200,
    gender: 'female',
    db_model_training_id: 'event_db_training_id_456',
    calculatedCost: 150,
    operation_type_for_refund: PaymentType.MONEY_OUTCOME,
  }

  const mockPreparedTrainingData: PreparedTrainingData = {
    user: mockUser,
    currentBalance: 500,
    costInStars: 10,
    publicUrl: 'https://example.com/generated-public-url.zip',
  }

  const mockModelTraining: ModelTraining = {
    id: defaultEventData.db_model_training_id as string,
    user_id: defaultEventData.user_id,
    model_name: defaultEventData.model_name,
    trigger_word: defaultEventData.trigger_word,
    steps_amount: defaultEventData.steps,
    status: 'PENDING',
    gender: defaultEventData.gender as 'male' | 'female',
    api: 'replicate',
    bot_name: defaultEventData.bot_name,
    cost_in_stars: defaultEventData.calculatedCost,
    created_at: new Date().toISOString(),
    replicate_training_id: null,
    replicate_model_id: null,
    replicate_model_version: null,
    model_url: null,
  }

  const mockReplicateTrainingResponse: ReplicateTraining = {
    id: 'replicate-id-123',
    model: 'test/replicate-model',
    source: 'api',
    version: 'test-version-123',
    status: 'starting',
    input: {},
    output: null,
    error: null,
    logs: null,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    urls: { get: '', cancel: '' },
    metrics: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
    testEngine = new InngestTestEngine({ function: inngestFunctionToTest })

    vi.mocked(getUserByTelegramId).mockResolvedValue(mockUser)
    vi.mocked(validateAndPrepareTrainingRequest).mockResolvedValue(
      mockPreparedTrainingData
    )
    vi.mocked(startReplicateTraining).mockResolvedValue(
      mockReplicateTrainingResponse as any
    )
    vi.mocked(modelTrainingsDb.createDigitalAvatarTraining).mockResolvedValue(
      mockModelTraining as any
    )

    mockLogger = vi.mocked(logger)
    mockSupabaseHelpers = mockDeep<typeof import('@/core/supabase')>()
    vi.mocked(
      require('@/core/supabase')
    ).getUserByTelegramId.mockImplementation(
      mockSupabaseHelpers.getUserByTelegramId
    )
    vi.mocked(require('@/core/supabase')).updateUserBalance.mockImplementation(
      mockSupabaseHelpers.updateUserBalance
    )

    mockHelpers = vi.mocked(
      require('@/modules/digitalAvatarBody/helpers/trainingHelpers')
    )
    mockReplicateClient = vi.mocked(
      new (require('replicate').default)()
    ) as DeepMockProxy<ReplicateClient>
    mockSendTelegramMessageFromWorker = vi.mocked(
      require('@/utils/telegramHelpers').sendTelegramMessageFromWorker
    )
    mockModelTrainingsDb = vi.mocked(
      require('@/modules/digitalAvatarBody/helpers/modelTrainingsDb')
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should be defined and be an Inngest function object', () => {
    expect(inngestFunctionToTest).toBeDefined()
    expect(inngestFunctionToTest).toHaveProperty('id')
    expect(inngestFunctionToTest).toHaveProperty('handler')
    expect(inngestFunctionToTest).toHaveProperty('triggers')
  })

  test('happy path - should process training request successfully', async () => {
    const eventName = 'digital-avatar/generate.model.training.requested'

    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeUndefined()
    expect(result).toBeDefined()
    expect(result).toEqual({
      replicateTrainingId: mockReplicateTrainingResponse.id,
      status: 'starting',
    })

    expect(getUserByTelegramId).toHaveBeenCalledWith(
      Number(defaultEventData.telegram_id)
    )
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalledWith(
      Number(defaultEventData.telegram_id),
      defaultEventData.publicUrl,
      defaultEventData.model_name,
      defaultEventData.trigger_word,
      expect.any(Object)
    )
    expect(startReplicateTraining).toHaveBeenCalledWith(
      formatReplicateModelName(
        mockUser.replicate_username!,
        defaultEventData.model_name
      ),
      defaultEventData.publicUrl,
      defaultEventData.trigger_word,
      defaultEventData.steps,
      expect.any(String),
      expect.any(Object)
    )
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      defaultEventData.bot_name,
      Number(defaultEventData.telegram_id),
      defaultEventData.is_ru
        ? TRAINING_MESSAGES.start.ru
        : TRAINING_MESSAGES.start.en
    )

    expect(
      mockModelTrainingsDb.updateDigitalAvatarTraining
    ).toHaveBeenCalledWith(defaultEventData.db_model_training_id, {
      replicate_training_id: mockReplicateTrainingResponse.id,
      status: 'PROCESSING',
    })
  })

  test('should return duplicate request message if training is already active in cache', async () => {
    const eventName = 'digital-avatar/generate.model.training.requested'

    vi.mocked(validateAndPrepareTrainingRequest).mockResolvedValue(null)

    const { result, error, state, ctx } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeUndefined()
    expect(result).toEqual({
      message: defaultEventData.is_ru
        ? TRAINING_MESSAGES.error('Validation failed or user not found').ru
        : TRAINING_MESSAGES.error('Validation failed or user not found').en,
      status: 'validation_failed',
    })

    expect(getUserByTelegramId).toHaveBeenCalledWith(
      Number(defaultEventData.telegram_id)
    )
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalledTimes(1)
    expect(startReplicateTraining).not.toHaveBeenCalled()

    expect(sendTelegramMessageFromWorker).toHaveBeenCalledTimes(2)
    expect(sendTelegramMessageFromWorker).toHaveBeenNthCalledWith(
      1,
      defaultEventData.bot_name,
      Number(defaultEventData.telegram_id),
      defaultEventData.is_ru
        ? TRAINING_MESSAGES.start.ru
        : TRAINING_MESSAGES.start.en
    )
    expect(sendTelegramMessageFromWorker).toHaveBeenNthCalledWith(
      2,
      defaultEventData.bot_name,
      Number(defaultEventData.telegram_id),
      defaultEventData.is_ru
        ? TRAINING_MESSAGES.error('Validation failed or user not found').ru
        : TRAINING_MESSAGES.error('Validation failed or user not found').en
    )
  })

  test('should handle user not found error', async () => {
    const eventName = 'digital-avatar/generate.model.training.requested'
    vi.mocked(getUserByTelegramId).mockResolvedValue(null)

    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeInstanceOf(NonRetriableError)
    if (error instanceof Error) {
      const errorMessageText = error.message || ''
      expect(errorMessageText).toContain('User not found for telegram_id')
    } else {
      fail('Error was not an instance of Error')
    }
    expect(result).toBeUndefined()

    expect(getUserByTelegramId).toHaveBeenCalledWith(
      Number(defaultEventData.telegram_id)
    )
    expect(validateAndPrepareTrainingRequest).not.toHaveBeenCalled()
    expect(startReplicateTraining).not.toHaveBeenCalled()

    expect(sendTelegramMessageFromWorker).toHaveBeenCalledTimes(1)
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      defaultEventData.bot_name,
      Number(defaultEventData.telegram_id),
      defaultEventData.is_ru
        ? TRAINING_MESSAGES.error(error.message).ru
        : TRAINING_MESSAGES.error(error.message).en
    )
  })

  test('should handle error during startReplicateTraining', async () => {
    const eventName = 'digital-avatar/generate.model.training.requested'
    const replicateErrorMessage = 'Replicate API error during startTraining'
    vi.mocked(getUserByTelegramId).mockResolvedValue(mockUser)
    vi.mocked(validateAndPrepareTrainingRequest).mockResolvedValue(
      mockPreparedTrainingData
    )
    vi.mocked(modelTrainingsDb.createDigitalAvatarTraining).mockResolvedValue(
      mockModelTraining as any
    )

    vi.mocked(startReplicateTraining).mockRejectedValue(
      new Error(replicateErrorMessage)
    )

    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeInstanceOf(NonRetriableError)
    if (error instanceof Error) {
      const errorMessageText = error.message || ''
      expect(errorMessageText).toContain(replicateErrorMessage)
    } else {
      fail('Error was not an instance of Error')
    }
    expect(result).toBeUndefined()

    expect(getUserByTelegramId).toHaveBeenCalledTimes(1)
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalledTimes(1)
    expect(modelTrainingsDb.createDigitalAvatarTraining).toHaveBeenCalledTimes(
      1
    )
    expect(startReplicateTraining).toHaveBeenCalledTimes(1)

    expect(sendTelegramMessageFromWorker).toHaveBeenCalledTimes(2)
    expect(sendTelegramMessageFromWorker).toHaveBeenNthCalledWith(
      1,
      defaultEventData.bot_name,
      Number(defaultEventData.telegram_id),
      defaultEventData.is_ru
        ? TRAINING_MESSAGES.start.ru
        : TRAINING_MESSAGES.start.en
    )
    expect(sendTelegramMessageFromWorker).toHaveBeenNthCalledWith(
      2,
      defaultEventData.bot_name,
      Number(defaultEventData.telegram_id),
      defaultEventData.is_ru
        ? TRAINING_MESSAGES.error(error.message).ru
        : TRAINING_MESSAGES.error(error.message).en
    )

    expect(
      mockModelTrainingsDb.updateDigitalAvatarTraining
    ).toHaveBeenCalledWith(
      defaultEventData.db_model_training_id,
      expect.objectContaining({
        status: 'FAILED',
        error_message: expect.stringContaining(replicateErrorMessage),
      })
    )
  })

  test('should handle database error when creating training record', async () => {
    const dbErrorMessage = 'DB error on create'
    vi.mocked(modelTrainingsDb.createDigitalAvatarTraining).mockRejectedValue(
      new Error(dbErrorMessage)
    )

    const eventName = 'digital-avatar/generate.model.training.requested'
    const testEventData = {
      ...defaultEventData,
      trainingDbIdFromEvent: undefined,
    }

    await expect(
      testEngine.execute({
        events: [{ name: eventName, data: { data: testEventData } }],
      })
    ).rejects.toThrow(NonRetriableError)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('[Inngest Function Error]'),
      expect.any(Object)
    )
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      defaultEventData.telegram_id,
      defaultEventData.is_ru
        ? TRAINING_MESSAGES.error(
            defaultEventData.is_ru ? 'Ошибка базы данных' : 'Database error'
          ).ru
        : TRAINING_MESSAGES.error(
            defaultEventData.is_ru ? 'Ошибка базы данных' : 'Database error'
          ).en,
      defaultEventData.bot_name
    )
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalledTimes(1)
    expect(startReplicateTraining).not.toHaveBeenCalled()
  })

  test('should handle Replicate API error when starting training', async () => {
    const replicateErrorMessage = 'Replicate API error'
    vi.mocked(modelTrainingsDb.createDigitalAvatarTraining).mockResolvedValue(
      mockModelTraining as any
    )
    vi.mocked(startReplicateTraining).mockRejectedValue(
      new Error(replicateErrorMessage)
    )

    const eventName = 'digital-avatar/generate.model.training.requested'
    const testEventData = {
      ...defaultEventData,
      trainingDbIdFromEvent: undefined,
    }

    await expect(
      testEngine.execute({
        events: [{ name: eventName, data: { data: testEventData } }],
      })
    ).rejects.toThrow(NonRetriableError)

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error starting Replicate training'),
      expect.any(Object)
    )

    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      defaultEventData.telegram_id,
      TRAINING_MESSAGES.error(
        defaultEventData.is_ru
          ? 'Ошибка запуска Replicate'
          : 'Replicate start error'
      )[defaultEventData.is_ru ? 'ru' : 'en'],
      defaultEventData.bot_name
    )
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalledTimes(1)
    expect(modelTrainingsDb.createDigitalAvatarTraining).toHaveBeenCalledTimes(
      1
    )
    expect(startReplicateTraining).toHaveBeenCalledTimes(1)
    expect(updateTrainingRecordOnError).toHaveBeenCalledWith(
      mockModelTraining.id,
      replicateErrorMessage,
      expect.any(String)
    )
  })

  test('should handle validation failure gracefully', async () => {
    mockHelpers.validateAndPrepareTrainingRequest.mockResolvedValue(null)

    const eventName = 'digital-avatar/generate.model.training.requested'
    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeInstanceOf(NonRetriableError)
    if (error instanceof Error) {
      expect(error.message).toContain('User validation or training prep failed')
    } else {
      fail('Error was not an instance of Error')
    }

    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      defaultEventData.telegram_id.toString(),
      TRAINING_MESSAGES.error('Validation failed')[
        defaultEventData.is_ru ? 'ru' : 'en'
      ],
      expect.anything()
    )
    expect(mockHelpers.startReplicateTraining).not.toHaveBeenCalled()
  })

  test('should handle replicate training start failure', async () => {
    mockHelpers.startReplicateTraining.mockRejectedValue(
      new Error('Replicate API is down')
    )

    const eventName = 'digital-avatar/generate.model.training.requested'
    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeInstanceOf(NonRetriableError)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'Replicate training failed to start or returned no ID.'
      )
    } else {
      fail('Error was not an instance of Error')
    }

    expect(
      mockModelTrainingsDb.updateDigitalAvatarTraining
    ).toHaveBeenCalledWith(
      defaultEventData.db_model_training_id,
      expect.objectContaining({
        status: 'FAILED',
        error_message: expect.stringContaining(
          'Replicate training failed to start'
        ),
      })
    )

    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      defaultEventData.telegram_id.toString(),
      TRAINING_MESSAGES.error('Replicate processing failed')[
        defaultEventData.is_ru ? 'ru' : 'en'
      ],
      expect.anything()
    )
  })

  test('should handle polling timeout', async () => {
    ;(mockReplicateClient.trainings.get as any).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 200))
      return { ...mockReplicateTrainingResponse, status: 'processing' }
    })

    const eventName = 'digital-avatar/generate.model.training.requested'
    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeInstanceOf(NonRetriableError)
    if (error instanceof Error) {
      expect(error.message).toContain('Replicate training polling timed out')
    } else {
      fail('Error was not an instance of Error')
    }

    expect(
      mockModelTrainingsDb.updateDigitalAvatarTraining
    ).toHaveBeenCalledWith(
      defaultEventData.db_model_training_id,
      expect.objectContaining({
        status: 'FAILED',
        error_message: expect.stringContaining(
          'Replicate training polling timed out'
        ),
      })
    )
  })

  test('should handle Replicate training failure during polling', async () => {
    const mockFailedReplicatePoll = {
      ...mockReplicateTrainingResponse,
      status: 'failed',
      error: 'Something went very wrong on Replicate side',
    }
    ;(mockReplicateClient.trainings.get as any)
      .mockResolvedValueOnce(mockReplicateTrainingResponse)
      .mockResolvedValueOnce(mockFailedReplicatePoll)

    const eventName = 'digital-avatar/generate.model.training.requested'
    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'Replicate training failed: Something went very wrong'
      )
    } else {
      fail('Error was not an instance of Error')
    }

    expect(
      mockModelTrainingsDb.updateDigitalAvatarTraining
    ).toHaveBeenLastCalledWith(
      defaultEventData.db_model_training_id,
      expect.objectContaining({
        status: 'FAILED',
        error_message: expect.stringContaining('Something went very wrong'),
      })
    )

    expect(sendTelegramMessageFromWorker).toHaveBeenLastCalledWith(
      defaultEventData.telegram_id.toString(),
      TRAINING_MESSAGES.error('Something went very wrong on Replicate side')[
        defaultEventData.is_ru ? 'ru' : 'en'
      ],
      expect.anything()
    )
  })

  test('should handle specific error details', async () => {
    const mockFailedReplicatePoll = {
      ...mockReplicateTrainingResponse,
      status: 'failed',
      error: 'Something went very wrong on Replicate side',
    }
    ;(mockReplicateClient.trainings.get as any)
      .mockResolvedValueOnce(mockReplicateTrainingResponse)
      .mockResolvedValueOnce(mockFailedReplicatePoll)

    const eventName = 'digital-avatar/generate.model.training.requested'
    const { result, error } = await testEngine.execute({
      events: [
        {
          name: eventName,
          data: defaultEventData,
        },
      ],
    })

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'Replicate training failed: Something went very wrong'
      )
    } else {
      fail('Error was not an instance of Error')
    }

    expect(
      mockModelTrainingsDb.updateDigitalAvatarTraining
    ).toHaveBeenLastCalledWith(
      defaultEventData.db_model_training_id,
      expect.objectContaining({
        status: 'FAILED',
        error_message: expect.stringContaining('Something went very wrong'),
      })
    )

    expect(sendTelegramMessageFromWorker).toHaveBeenLastCalledWith(
      defaultEventData.telegram_id.toString(),
      TRAINING_MESSAGES.error('some specific error details for this test case')[
        defaultEventData.is_ru ? 'ru' : 'en'
      ],
      defaultEventData.bot_token
    )
  })
})
