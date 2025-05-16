import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateModelTraining } from '../generateModelTraining'
import { Prediction } from 'replicate'

// Import and mock module-local dependencies
import {
  getDigitalAvatarUserProfile,
  incrementUserLevelForAvatarTraining,
  type DigitalAvatarUserProfile,
} from '../helpers/userProfileDb'
import {
  createDigitalAvatarTraining,
  updateDigitalAvatarTraining,
  type ModelTraining,
} from '../helpers/modelTrainingsDb'
import {
  ensureReplicateModelExists,
  pollReplicateTrainingStatus,
  getLatestModelUrl,
  startReplicateTraining,
  updateTrainingRecordOnError,
  validateAndPrepareTrainingRequest,
  type PreparedTrainingData,
} from '../helpers/trainingHelpers'
import { calculateDigitalAvatarBodyCost } from '../helpers/pricingHelpers'
import { getDigitalAvatarBodyConfig } from '../config'
import { logger } from '../utils/logger'
import { ModeEnum, PaymentType, type ReplicateTrainingResponse } from '../types'

// --- Global Mocks ---
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../helpers/userProfileDb', async importOriginal => {
  const original = await importOriginal<any>()
  return {
    ...original,
    getDigitalAvatarUserProfile: vi.fn(),
    incrementUserLevelForAvatarTraining: vi.fn(),
  }
})

vi.mock('../helpers/modelTrainingsDb', async importOriginal => {
  const original = await importOriginal<any>()
  return {
    ...original,
    createDigitalAvatarTraining: vi.fn(),
    updateDigitalAvatarTraining: vi.fn(),
  }
})

vi.mock('../helpers/pricingHelpers', () => ({
  calculateDigitalAvatarBodyCost: vi.fn(),
}))

vi.mock('../helpers/trainingHelpers', async importOriginal => {
  const original = await importOriginal<any>()
  return {
    ...original,
    ensureReplicateModelExists: vi.fn(),
    pollReplicateTrainingStatus: vi.fn(),
    getLatestModelUrl: vi.fn(),
    startReplicateTraining: vi.fn(),
    updateTrainingRecordOnError: vi.fn(),
    validateAndPrepareTrainingRequest: vi.fn(),
  }
})

vi.mock('../config', () => ({
  getDigitalAvatarBodyConfig: vi.fn().mockReturnValue({
    replicateUsername: 'test_replicate_user_env',
    replicateDefaultSteps: 1000,
    replicateTrainingModelVersion: 'test-trainer-version',
    inngestEventNameGenerateModelTraining: 'test/event',
  }),
}))

const mockSendMessage = vi.fn()
// -- End Global Mocks --

const mockPollReplicateTrainingStatus = vi.fn()
const mockGetLatestModelUrl = vi.fn()

describe.skip('generateModelTraining (Plan B Refactored)', () => {
  const mockTelegramId = 12345
  const mockUserId = 'user-uuid-123'
  const mockUser: DigitalAvatarUserProfile = {
    id: 'user-uuid-123',
    telegram_id: mockTelegramId.toString(),
    username: 'testuser',
    level: 1,
    api: 'user-replicate-api-key',
    replicate_username: 'test_replicate_user_from_db',
    neuro_tokens: 1000,
    balance: 1000,
    is_ru: true,
    created_at: new Date(),
    updated_at: new Date(),
  }
  const mockTrainingBaseParams = {
    zipUrl: 'http://example.com/test.zip',
    triggerWord: 'test_trigger',
    modelName: 'test_model',
    steps: 100,
    telegram_id: mockTelegramId,
    is_ru: false,
    bot_name: 'TestBotFromParams',
    gender: 'female' as 'female' | 'male' | 'other',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue(undefined)

    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue(mockUser)
    vi.mocked(incrementUserLevelForAvatarTraining).mockResolvedValue(true)
    vi.mocked(calculateDigitalAvatarBodyCost).mockReturnValue({
      stars: 100,
      dollars: 0,
      rubles: 0,
    })
    vi.mocked(validateAndPrepareTrainingRequest).mockResolvedValue({
      user: mockUser,
      costInStars: 100,
      currentBalance: mockUser.neuro_tokens! - 100,
      publicUrl: mockTrainingBaseParams.zipUrl,
    } as PreparedTrainingData)
    vi.mocked(ensureReplicateModelExists).mockResolvedValue(undefined)
    vi.mocked(createDigitalAvatarTraining).mockResolvedValue({
      id: 'db-training-id-123',
      user_id: mockUser.id,
      telegram_id: mockTelegramId.toString(),
      model_name: mockTrainingBaseParams.modelName,
      trigger_word: mockTrainingBaseParams.triggerWord,
      zip_url: mockTrainingBaseParams.zipUrl,
      steps_amount: mockTrainingBaseParams.steps,
      status: 'PENDING',
      gender: mockTrainingBaseParams.gender,
      api: 'replicate',
      bot_name: mockTrainingBaseParams.bot_name,
      cost_in_stars: 100,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      replicate_training_id: null,
      replicate_model_id: null,
      replicate_model_version_id: null,
      replicate_destination_model_id: null,
      replicate_model_url: null,
      base_model: null,
    } as ModelTraining)
    vi.mocked(startReplicateTraining).mockResolvedValue({
      id: 'replicate-training-id-default',
      version: 'test-version',
      model: 'test-model',
      source: 'api',
      input: {},
      logs: 'Starting training...',
      error: null,
      status: 'starting',
      output: null,
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      metrics: { predict_time: 123 },
      urls: { cancel: '', get: 'http://replicate.com/get_url_default' },
    } as Prediction)
    vi.mocked(updateDigitalAvatarTraining).mockResolvedValue(
      {} as ModelTraining
    )
    vi.mocked(pollReplicateTrainingStatus).mockResolvedValue('succeeded')
    vi.mocked(getLatestModelUrl).mockResolvedValue(
      'http://example.com/model.zip'
    )
  })

  const callGenerateModelTrainingWithDefaults = (
    overrideParams: Partial<typeof mockTrainingBaseParams> = {},
    skipAwait = false
  ) => {
    const params = { ...mockTrainingBaseParams, ...overrideParams }
    return generateModelTraining(
      params.zipUrl,
      params.triggerWord,
      params.modelName,
      params.steps,
      params.telegram_id,
      params.is_ru,
      params.bot_name,
      params.gender,
      mockSendMessage
    )
  }

  it('happy path - should process training request successfully', async () => {
    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(true)
    expect(result.message).toBe('Model trained successfully!')
    expect(result.replicateTrainingId).toBe('replicate-training-id-default')
    expect(result.model_id).toBe('test_replicate_user_env/test_model')
    expect(result.model_url).toBe('http://example.com/model.zip')

    expect(getDigitalAvatarUserProfile).toHaveBeenCalledWith(
      mockTelegramId.toString()
    )
    expect(incrementUserLevelForAvatarTraining).toHaveBeenCalledTimes(2)
    expect(calculateDigitalAvatarBodyCost).toHaveBeenCalledWith({
      mode: ModeEnum.DigitalAvatarBody,
      steps: mockTrainingBaseParams.steps,
    })
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalledWith(
      mockTelegramId,
      mockTrainingBaseParams.zipUrl,
      mockTrainingBaseParams.modelName,
      mockTrainingBaseParams.triggerWord,
      mockTrainingBaseParams.is_ru,
      mockTrainingBaseParams.bot_name,
      PaymentType.MONEY_OUTCOME,
      100,
      mockUser.api
    )
    expect(ensureReplicateModelExists).toHaveBeenCalled()
    expect(createDigitalAvatarTraining).toHaveBeenCalled()
    expect(startReplicateTraining).toHaveBeenCalled()
    expect(updateDigitalAvatarTraining).toHaveBeenCalledTimes(2)
    expect(pollReplicateTrainingStatus).toHaveBeenCalled()
    expect(getLatestModelUrl).toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      expect.stringContaining(
        'Your model "test_model" has been successfully trained'
      )
    )
  })

  it('should return PREPARATION_FAILED if validateAndPrepareTrainingRequest returns null', async () => {
    vi.mocked(validateAndPrepareTrainingRequest).mockResolvedValue(null)
    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.error).toBe('PREPARATION_FAILED')
    expect(getDigitalAvatarUserProfile).toHaveBeenCalledWith(
      mockTelegramId.toString()
    )
    expect(calculateDigitalAvatarBodyCost).toHaveBeenCalled()
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalled()
    expect(ensureReplicateModelExists).not.toHaveBeenCalled()
    expect(createDigitalAvatarTraining).not.toHaveBeenCalled()
  })

  it('should return USER_NOT_FOUND if getDigitalAvatarUserProfile returns null', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue(null)
    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.message).toBe(
      `User with ID ${mockTelegramId} does not exist.`
    )
    expect(result.error).toBe('USER_NOT_FOUND')
    expect(getDigitalAvatarUserProfile).toHaveBeenCalledWith(
      mockTelegramId.toString()
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      'Your profile was not found. Please restart the bot with /start.'
    )
    expect(validateAndPrepareTrainingRequest).not.toHaveBeenCalled()
  })

  it('should return CONFIG_ERROR if user replicate_username is not set and config replicateUsername is not set', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue({
      ...mockUser,
      replicate_username: undefined,
    })
    vi.mocked(getDigitalAvatarBodyConfig).mockReturnValue({
      ...getDigitalAvatarBodyConfig(),
      replicateUsername: undefined,
    })

    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.error).toBe('CONFIG_ERROR')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('REPLICATE_USERNAME is not set in module config'),
      expect.anything()
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      expect.stringContaining('Configuration error. Please contact support.')
    )
  })

  it('should return DB_ERROR if createDigitalAvatarTraining fails', async () => {
    vi.mocked(createDigitalAvatarTraining).mockRejectedValue(
      new Error('Database error')
    )
    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.error).toBe('DB_ERROR')
    expect(logger.error).toHaveBeenCalledWith(
      '[DigitalAvatarBody] Failed to create training record in DB.',
      expect.any(Error)
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      'Database error during training creation. Please try again later.'
    )
  })

  it('should return REPLICATE_TRAINING_START_FAILED if startReplicateTraining throws', async () => {
    const startError = new Error('Replicate start error')
    vi.mocked(startReplicateTraining).mockRejectedValue(startError)
    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.error).toBe('REPLICATE_TRAINING_START_FAILED')
    expect(logger.error).toHaveBeenCalledWith(
      '[DigitalAvatarBody] Failed to start Replicate training.',
      expect.objectContaining({ message: 'Replicate start error' })
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      'Failed to start model training with Replicate. Please try again later.'
    )
    expect(updateTrainingRecordOnError).toHaveBeenCalledWith(
      mockUser.id,
      mockTrainingBaseParams.modelName,
      'Replicate start error'
    )
  })

  it('should return REPLICATE_POLL_FAILED if pollReplicateTrainingStatus fails (status not "succeeded")', async () => {
    vi.mocked(pollReplicateTrainingStatus).mockResolvedValue('failed')
    const mockReplicateError = 'mock replicate processing error'
    vi.mocked(startReplicateTraining).mockResolvedValue({
      id: 'replicate-training-id-failed-poll',
      version: 'test-version',
      model: 'test-model',
      source: 'api',
      input: {},
      logs: 'Polling...',
      error: 'Training failed during polling',
      status: 'failed',
      output: null,
      created_at: new Date().toISOString(),
      urls: { get: '', cancel: '' },
    } as Prediction)

    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.error).toBe('REPLICATE_POLL_FAILED')
    expect(logger.warn).toHaveBeenCalledWith(
      '[DigitalAvatarBody] Replicate training finished with non-succeeded status: failed',
      {
        trainingId: 'replicate-training-id-failed-poll',
        status: 'failed',
        error: mockReplicateError,
      }
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      expect.stringContaining(
        `Unfortunately, training for model "${mockTrainingBaseParams.modelName}" finished with status: failed. Details: ${mockReplicateError}`
      )
    )
    expect(updateTrainingRecordOnError).toHaveBeenCalledWith(
      mockUser.id,
      mockTrainingBaseParams.modelName,
      `Replicate training status: failed. Error: ${mockReplicateError}`
    )
  })

  it('should return REPLICATE_POLL_FAILED if pollReplicateTrainingStatus throws', async () => {
    vi.mocked(pollReplicateTrainingStatus).mockRejectedValue(
      new Error('Replicate poll error')
    )
    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.error).toBe('REPLICATE_POLL_FAILED')
    expect(logger.error).toHaveBeenCalledWith(
      '[DigitalAvatarBody] Error polling Replicate training status.',
      expect.objectContaining({ message: 'Replicate poll error' })
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      'Failed to get training status from Replicate. Please check later or contact support.'
    )
    expect(updateTrainingRecordOnError).toHaveBeenCalledWith(
      mockUser.id,
      mockTrainingBaseParams.modelName,
      'Error polling Replicate training status: Replicate poll error (no-wait)'
    )
  })

  it('should return REPLICATE_MODEL_URL_FAILED if getLatestModelUrl throws', async () => {
    vi.mocked(getLatestModelUrl).mockRejectedValue(
      new Error('Replicate model URL error')
    )
    const result = await callGenerateModelTrainingWithDefaults()

    expect(result.success).toBe(false)
    expect(result.error).toBe('REPLICATE_MODEL_URL_FAILED')
    expect(logger.error).toHaveBeenCalledWith(
      '[DigitalAvatarBody] Error fetching latest model URL from Replicate.',
      expect.objectContaining({ message: 'Replicate model URL error' })
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      'Failed to get model URL from Replicate. Please check later or contact support.'
    )
    expect(updateTrainingRecordOnError).toHaveBeenCalledWith(
      mockUser.id,
      mockTrainingBaseParams.modelName,
      'Replicate model URL error'
    )
  })

  it('should use user replicate_username if config.replicateUsername is not set but user has it', async () => {
    vi.mocked(getDigitalAvatarBodyConfig).mockReturnValue({
      ...getDigitalAvatarBodyConfig(),
      replicateUsername: undefined,
    })
    const result = await callGenerateModelTrainingWithDefaults()
    expect(result.success).toBe(true)
    expect(result.model_id).toBe('test_replicate_user_from_db/test_model')
  })

  it('should correctly form model_id if gender is male and specific username logic exists in func', async () => {
    vi.mocked(getDigitalAvatarBodyConfig).mockReturnValue({
      replicateUsername: 'default_config_user',
      inngestEventNameGenerateModelTraining: 'test/event',
      replicateDefaultSteps: 1000,
      replicateTrainingModelVersion: 'test-trainer-version',
    })

    const result = await callGenerateModelTrainingWithDefaults({
      gender: 'male',
      modelName: 'test_model_male_gender',
    })

    expect(result.success).toBe(true)
    expect(result.model_id).toBe(
      'test_replicate_user_from_db/test_model_male_gender'
    )

    expect(startReplicateTraining).toHaveBeenCalledWith(
      expect.anything(),
      'test_replicate_user_from_db/test_model_male_gender',
      mockTrainingBaseParams.zipUrl,
      mockTrainingBaseParams.triggerWord,
      mockTrainingBaseParams.steps,
      mockUser.api,
      expect.any(String)
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      expect.stringContaining(
        'Your model "test_model_male_gender" has been successfully trained'
      )
    )
  })

  it('should use default replicateUsername from config if gender is not female/male (and user has no replicate_username)', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue({
      ...mockUser,
      replicate_username: undefined,
    })
    vi.mocked(getDigitalAvatarBodyConfig).mockReturnValue({
      replicateUsername: 'config_default_user',
      inngestEventNameGenerateModelTraining: 'test/event',
      replicateDefaultSteps: 1000,
      replicateTrainingModelVersion: 'test-trainer-version',
    })

    const result = await callGenerateModelTrainingWithDefaults({
      gender: 'other',
      modelName: 'test_model_other_gender',
    })

    expect(result.success).toBe(true)
    expect(result.model_id).toBe('config_default_user/test_model_other_gender')
    expect(startReplicateTraining).toHaveBeenCalledWith(
      expect.anything(),
      'config_default_user/test_model_other_gender',
      mockTrainingBaseParams.zipUrl,
      mockTrainingBaseParams.triggerWord,
      mockTrainingBaseParams.steps,
      mockUser.api,
      expect.any(String)
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      expect.stringContaining(
        'Your model "test_model_other_gender" has been successfully trained'
      )
    )
  })

  it('should handle undefined triggerWord by using a default in startReplicateTraining', async () => {
    vi.mocked(startReplicateTraining).mockResolvedValue({
      id: 'replicate-training-id-no-trigger',
      version: 'test-version',
      model: 'test-model',
      source: 'api',
      input: {},
      logs: 'Training complete',
      error: null,
      status: 'succeeded',
      output: null,
      created_at: new Date().toISOString(),
      urls: { get: '', cancel: '' },
    } as Prediction)
    vi.mocked(pollReplicateTrainingStatus).mockResolvedValue('succeeded')
    vi.mocked(getLatestModelUrl).mockResolvedValue(
      'http://example.com/model_no_trigger.zip'
    )

    const result = await callGenerateModelTrainingWithDefaults({
      triggerWord: undefined,
      modelName: 'test_model_no_trigger',
    })

    expect(result.success).toBe(true)
    expect(result.message).toBe('Model trained successfully!')
    expect(result.model_id).toBe(
      'test_replicate_user_env/test_model_no_trigger'
    )
    expect(startReplicateTraining).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/test_replicate_user_env\/test_model_no_trigger$/),
      mockTrainingBaseParams.zipUrl,
      expect.any(String),
      mockTrainingBaseParams.steps,
      mockUser.api,
      expect.any(String)
    )
    expect(validateAndPrepareTrainingRequest).toHaveBeenCalledWith(
      mockTelegramId,
      mockTrainingBaseParams.zipUrl,
      'test_model_no_trigger',
      undefined,
      mockTrainingBaseParams.is_ru,
      mockTrainingBaseParams.bot_name,
      PaymentType.MONEY_OUTCOME,
      100,
      mockUser.api
    )
    expect(mockSendMessage).toHaveBeenCalledWith(
      mockTelegramId.toString(),
      expect.stringContaining(
        'Your model "test_model_no_trigger" has been successfully trained'
      )
    )
  })
})
