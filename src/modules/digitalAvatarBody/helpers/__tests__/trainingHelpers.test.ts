import { vi, describe, beforeEach, test, expect } from 'vitest'

// Hoist mocks to the top
vi.mock('../userProfileDb', () => ({
  getDigitalAvatarUserProfile: vi.fn(),
  updateUserNeuroTokens: vi.fn(),
  // incrementUserLevelForAvatarTraining: vi.fn(), // Not directly tested here, but can be added if needed by other tests in this file
}))
vi.mock('@/utils/telegramHelpers', () => ({
  sendTelegramMessageFromWorker: vi.fn(),
}))
vi.mock('../config', () => ({
  getDigitalAvatarBodyConfig: vi.fn().mockReturnValue({
    replicateApiToken: 'test-replicate-token',
    replicateUsername: 'test-replicate-username',
    replicateTrainingModelOwner: 'test-owner',
    replicateTrainingModelVersion: 'test-version',
    apiUrl: 'http://localhost:3000/api',
    nodeEnv: 'development',
    inngestEventKey: 'digital-avatar-body.train',
    logger: {
      // Mock logger if it's part of the config used by helpers
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }),
}))
vi.mock('@/utils/logger', () => ({
  // Global logger, if still imported by any deep dependency not covered by module logger
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))
vi.mock('./cache', () => ({
  // Assuming cache helpers might be used and need mocking
  getCachedData: vi.fn(),
  setCachedData: vi.fn(),
}))

// Now import the functions to be tested and their dependencies
import {
  validateAndPrepareTrainingRequest,
  TRAINING_MESSAGES,
  PreparedTrainingData,
  // Other helpers from trainingHelpers.ts can be added here for testing
  // getReplicateWebhookUrl,
  // getLatestModelUrl,
  // ensureReplicateModelExists,
  // pollReplicateTrainingStatus,
  // startFluxLoraTrainerReplicateTraining,
  // updateTrainingRecordOnError,
} from '../trainingHelpers'
import {
  getDigitalAvatarUserProfile,
  updateUserNeuroTokens,
} from '../userProfileDb'
import { sendTelegramMessageFromWorker } from '@/utils/telegramHelpers'
import { PaymentType } from '@/interfaces/payments.interface'
import type { DigitalAvatarUserProfile } from '../userProfileDb'
// Removed User import as mockUserFound is now DigitalAvatarUserProfile
// import { User } from '@/interfaces/user.interface';

describe('validateAndPrepareTrainingRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks() // Clears all mocks

    // Reset specific mocks if needed, though clearAllMocks should handle it for vi.fn()
    vi.mocked(getDigitalAvatarUserProfile).mockReset()
    vi.mocked(updateUserNeuroTokens).mockReset()
    vi.mocked(sendTelegramMessageFromWorker).mockReset()

    // Default mock implementations
    vi.mocked(updateUserNeuroTokens).mockResolvedValue(true)
  })

  const mockTelegramId = 12345
  const mockZipUrl = 'http://example.com/model.zip'
  const mockModelName = 'test-model'
  const mockTriggerWord = 'testtrigger'
  const mockIsRu = true
  const mockBotName = 'TestBot'
  const mockOperationType = PaymentType.MONEY_OUTCOME
  const mockCost = 100

  const mockUserFound: DigitalAvatarUserProfile = {
    id: 'user-id-1',
    telegram_id: String(mockTelegramId),
    username: 'testuser',
    replicate_username: 'replicate_user',
    api: 'replicate_api_key', // Assuming this field is on DigitalAvatarUserProfile based on usage
    balance: 200, // Assuming this means general balance
    neuro_tokens: 200, // Specific neuro token balance
    level: 2,
    is_ru: mockIsRu,
    first_name: 'Test',
    last_name: 'User',
  }

  test('should successfully validate and prepare when all conditions are met', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue(mockUserFound)

    const result = await validateAndPrepareTrainingRequest(
      mockTelegramId,
      mockZipUrl,
      mockModelName,
      mockTriggerWord,
      mockIsRu,
      mockBotName,
      mockOperationType,
      mockCost
    )

    expect(getDigitalAvatarUserProfile).toHaveBeenCalledWith(
      String(mockTelegramId)
    )
    expect(vi.mocked(updateUserNeuroTokens).mock.calls.length).toBe(1)
    expect(vi.mocked(updateUserNeuroTokens).mock.calls[0]).toEqual([
      mockUserFound.id,
      mockCost, // Expecting positive cost
      String(mockOperationType), // Expecting stringified PaymentType, botName removed
    ])
    expect(sendTelegramMessageFromWorker).not.toHaveBeenCalled()
    expect(result).toEqual<PreparedTrainingData | null>({
      user: mockUserFound,
      currentBalance: mockUserFound.neuro_tokens, // Should reflect the balance used for check (neuro_tokens)
      publicUrl: mockZipUrl,
      costInStars: mockCost,
    })
  })

  test('should return null and send message if user not found', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue(null)

    const result = await validateAndPrepareTrainingRequest(
      mockTelegramId,
      mockZipUrl,
      mockModelName,
      mockTriggerWord,
      mockIsRu,
      mockBotName,
      mockOperationType,
      mockCost
    )

    expect(getDigitalAvatarUserProfile).toHaveBeenCalledWith(
      String(mockTelegramId)
    )
    expect(updateUserNeuroTokens).not.toHaveBeenCalled()
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      String(mockTelegramId),
      TRAINING_MESSAGES.error(
        mockIsRu ? 'Пользователь не найден' : 'User not found'
      )[mockIsRu ? 'ru' : 'en'],
      mockBotName
    )
    expect(result).toBeNull()
  })

  test('should return null if user has no replicate_username', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue({
      ...mockUserFound,
      replicate_username: null,
    })
    const result = await validateAndPrepareTrainingRequest(
      mockTelegramId,
      mockZipUrl,
      mockModelName,
      mockTriggerWord,
      mockIsRu,
      mockBotName,
      mockOperationType,
      mockCost
    )
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      String(mockTelegramId),
      TRAINING_MESSAGES.error(
        mockIsRu
          ? 'У пользователя отсутствует имя пользователя Replicate'
          : "User's Replicate username is missing"
      )[mockIsRu ? 'ru' : 'en'],
      mockBotName
    )
    expect(result).toBeNull()
  })

  test('should return null if user has no api key for replicate', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue({
      ...mockUserFound,
      api: null, // Ensure 'api' is a valid field on DigitalAvatarUserProfile or adjust mock
    })
    const result = await validateAndPrepareTrainingRequest(
      mockTelegramId,
      mockZipUrl,
      mockModelName,
      mockTriggerWord,
      mockIsRu,
      mockBotName,
      mockOperationType,
      mockCost
    )
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      String(mockTelegramId),
      TRAINING_MESSAGES.error(
        mockIsRu
          ? 'У пользователя отсутствует API ключ Replicate'
          : "User's Replicate API key is missing"
      )[mockIsRu ? 'ru' : 'en'],
      mockBotName
    )
    expect(result).toBeNull()
  })

  test('should return null if user has insufficient neuro_tokens', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue({
      ...mockUserFound,
      neuro_tokens: 50, // neuro_tokens < mockCost
    })
    const result = await validateAndPrepareTrainingRequest(
      mockTelegramId,
      mockZipUrl,
      mockModelName,
      mockTriggerWord,
      mockIsRu,
      mockBotName,
      mockOperationType,
      mockCost
    )
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      String(mockTelegramId),
      TRAINING_MESSAGES.error(
        mockIsRu
          ? `Недостаточно средств (50 < ${mockCost})`
          : `Insufficient funds (50 < ${mockCost})`
      )[mockIsRu ? 'ru' : 'en'],
      mockBotName
    )
    expect(updateUserNeuroTokens).not.toHaveBeenCalled()
    expect(result).toBeNull()
  })

  test('should return null if payment (updateUserNeuroTokens) fails', async () => {
    vi.mocked(getDigitalAvatarUserProfile).mockResolvedValue(mockUserFound)
    vi.mocked(updateUserNeuroTokens).mockResolvedValue(false) // Simulate payment failure

    const result = await validateAndPrepareTrainingRequest(
      mockTelegramId,
      mockZipUrl,
      mockModelName,
      mockTriggerWord,
      mockIsRu,
      mockBotName,
      mockOperationType,
      mockCost
    )

    expect(vi.mocked(updateUserNeuroTokens).mock.calls.length).toBe(1)
    expect(vi.mocked(updateUserNeuroTokens).mock.calls[0]).toEqual([
      mockUserFound.id,
      mockCost, // Expecting positive cost
      String(mockOperationType), // Expecting stringified PaymentType, botName removed
    ])
    expect(sendTelegramMessageFromWorker).toHaveBeenCalledWith(
      String(mockTelegramId),
      TRAINING_MESSAGES.error(mockIsRu ? 'Ошибка оплаты' : 'Payment failed')[
        mockIsRu ? 'ru' : 'en'
      ],
      mockBotName
    )
    expect(result).toBeNull()
  })
})
