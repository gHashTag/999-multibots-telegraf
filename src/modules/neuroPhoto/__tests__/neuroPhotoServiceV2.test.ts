/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from 'vitest'
// import type { MockedFunction } from 'vitest' // MockedFunction не используется, можно удалить
import {
  generateNeuroPhotoV2, // Тестируемая функция
  // type GenerateV2Params, // Удаляем дублирующий type-only импорт
} from '../services/neuroPhotoService'
import {
  NeuroPhotoServiceDependencies,
  GenerateV2Params, // Оставляем этот импорт значения/типа
  GetUserByTelegramIdStringFn,
  UpdateUserLevelPlusOneFn,
  SavePromptDirectFn,
  GetLatestUserModelFn, // Важно для V2
  GetUserDataFn, // Важно для V2
  DirectPaymentProcessorFn,
  CalculateModeCostFn,
  SaveFileLocallyFn,
  SendMediaToPulseFn,
  LoggerFn,
  GetAspectRatioFn, // Не используется в V2, но есть в зависимостях
  NeuroPhotoOverallResult,
  NeuroPhotoServiceResultItem,
  NeuroPhotoErrorItem,
  NeuroPhotoSuccessItem,
  User, // Используем User напрямую, так как он уже UserType as User в dependencies
  ReplicateRunMinimalResponse,
} from '../interfaces/neuroPhotoDependencies.interface'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'
import { BotName } from '@/interfaces/telegram-bot.interface'

// Переносим определение createMockUserV2 сюда, до его использования
const createMockUserV2 = (
  telegram_id: string,
  balance: number = 100,
  level: number = 2,
  vip: boolean = false
): User => ({
  id: BigInt(Math.floor(Math.random() * 1000000)),
  telegram_id: BigInt(telegram_id),
  username: `testuser_${telegram_id}`,
  balance: balance,
  first_name: 'Test',
  last_name: 'User',
  photo_url: '',
  created_at: new Date(),
  language_code: 'en',
  mode: ModeEnum.NeuroPhotoV2 as string,
  level: level,
  vip: vip,
  user_id: `uuid_user_${telegram_id}`,
  is_bot: false,
  email: null,
  role: null,
  display_name: `Test User ${telegram_id}`,
  user_timezone: null,
  designation: null,
  position: null,
  company: null,
  invitation_codes: null,
  select_izbushka: null,
  avatar_id: null,
  voice_id: null,
  voice_id_elevenlabs: null,
  chat_id: BigInt(telegram_id),
  voice_id_synclabs: null,
  model: null,
  count: null,
  aspect_ratio: null,
  inviter: null,
  token: null,
  is_leela_start: null,
})

// Аналогично V1, мокаем зависимости
const mockDependenciesV2 = (): NeuroPhotoServiceDependencies => ({
  replicateRun:
    vi.fn<
      (
        ...args: [string, { input: any }]
      ) => Promise<ReplicateRunMinimalResponse>
    >(),
  getUserByTelegramIdString:
    vi.fn<(...args: [string]) => Promise<User | null>>(),
  updateUserLevelPlusOne: vi.fn<(...args: [string, number]) => Promise<void>>(),
  savePromptDirect:
    vi.fn<
      (...args: [Parameters<SavePromptDirectFn>[0]]) => Promise<string | null>
    >(),
  getLatestUserModel:
    vi.fn<(...args: [number, string]) => ReturnType<GetLatestUserModelFn>>(),
  getUserData: vi.fn<(...args: [string]) => ReturnType<GetUserDataFn>>(),
  directPaymentProcessor:
    vi.fn<
      (
        ...args: [Parameters<DirectPaymentProcessorFn>[0]]
      ) => ReturnType<DirectPaymentProcessorFn>
    >(),
  calculateModeCost:
    vi.fn<
      (
        ...args: [Parameters<CalculateModeCostFn>[0]]
      ) => ReturnType<CalculateModeCostFn>
    >(),
  saveFileLocally:
    vi.fn<(...args: [string, string, string, string]) => Promise<string>>(),
  sendMediaToPulse:
    vi.fn<(...args: [Parameters<SendMediaToPulseFn>[0]]) => Promise<void>>(),
  generateUUID: vi.fn<(...args: []) => string>(),
  getAspectRatio: vi.fn<(...args: [number]) => Promise<string | null>>(),
  logInfo: vi.fn<(...args: [string | Record<string, any>]) => void>(),
  logError: vi.fn<(...args: [string | Record<string, any>]) => void>(),
  logWarn: vi.fn<(...args: [string | Record<string, any>]) => void>(),
})

let deps: NeuroPhotoServiceDependencies

describe('generateNeuroPhotoV2', () => {
  const defaultV2Params: GenerateV2Params = {
    basePrompt: 'A beautiful portrait',
    numImages: 1,
    telegramId: '12345002',
    username: 'testUserV2',
    isRu: false,
    botName: 'neuro_blogger_bot' as BotName,
    bypassPaymentCheck: false,
  }

  const defaultMockBFLModel = {
    model_url: 'replicate/bfl-model:version_hash',
    trigger_word: 'my_bfl_trigger',
    finetune_id: 'bfl_finetune_id_default',
  }

  const defaultCalculatedCost = 15

  beforeEach(() => {
    deps = mockDependenciesV2()
    ;(
      deps.getUserByTelegramIdString as Mock<
        (...args: [string]) => Promise<User | null>
      >
    ).mockResolvedValue(createMockUserV2(defaultV2Params.telegramId, 200))
    ;(
      deps.getLatestUserModel as Mock<
        (...args: [number, string]) => ReturnType<GetLatestUserModelFn>
      >
    ).mockResolvedValue(defaultMockBFLModel)
    ;(
      deps.getUserData as Mock<(...args: [string]) => ReturnType<GetUserDataFn>>
    ).mockResolvedValue({ gender: 'female' })
    ;(
      deps.calculateModeCost as Mock<
        (
          ...args: [Parameters<CalculateModeCostFn>[0]]
        ) => ReturnType<CalculateModeCostFn>
      >
    ).mockReturnValue({ stars: defaultCalculatedCost })
    ;(
      deps.directPaymentProcessor as Mock<
        (
          ...args: [Parameters<DirectPaymentProcessorFn>[0]]
        ) => ReturnType<DirectPaymentProcessorFn>
      >
    ).mockResolvedValue({
      success: true,
      payment_id: 'mock_payment_id_v2',
    })
    ;(
      deps.replicateRun as Mock<
        (
          ...args: [string, { input: any }]
        ) => Promise<ReplicateRunMinimalResponse>
      >
    ).mockResolvedValue({
      id: 'replicate_run_id_v2',
      status: 'succeeded',
      output: ['http://example.com/image_v2.jpg'],
    })
    ;(
      deps.saveFileLocally as Mock<
        (...args: [string, string, string, string]) => Promise<string>
      >
    ).mockResolvedValue('/path/to/local/image_v2.jpg')
    ;(
      deps.savePromptDirect as Mock<
        (...args: [Parameters<SavePromptDirectFn>[0]]) => Promise<string | null>
      >
    ).mockResolvedValue('mock_prompt_id_v2')
    ;(
      deps.sendMediaToPulse as Mock<
        (...args: [Parameters<SendMediaToPulseFn>[0]]) => Promise<void>
      >
    ).mockResolvedValue(undefined)
    ;(deps.generateUUID as Mock<(...args: []) => string>).mockReturnValue(
      'mock-uuid-v2-12345'
    )
    ;(
      deps.updateUserLevelPlusOne as Mock<
        (...args: [string, number]) => Promise<void>
      >
    ).mockResolvedValue(undefined)
    ;(
      deps.getAspectRatio as Mock<(...args: [number]) => Promise<string | null>>
    ).mockResolvedValue('1:1')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should successfully generate an image with V2 logic', async () => {
    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.getLatestUserModel).toHaveBeenCalledWith(
      Number(defaultV2Params.telegramId),
      'bfl'
    )
    expect(deps.getUserData).toHaveBeenCalledWith(defaultV2Params.telegramId)

    const expectedFullPromptPart = `Fashionable my_bfl_trigger female, ${defaultV2Params.basePrompt}`
    expect(deps.replicateRun).toHaveBeenCalledWith(
      'replicate/bfl-model:version_hash',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: expect.stringContaining(expectedFullPromptPart),
        }),
      })
    )

    expect(deps.directPaymentProcessor).toHaveBeenCalled()
    expect(deps.saveFileLocally).toHaveBeenCalled()
    expect(deps.savePromptDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        model_name: 'replicate/bfl-model:version_hash',
        prompt: defaultV2Params.basePrompt,
        replicate_id: 'replicate_run_id_v2',
        service_type: ModeEnum.NeuroPhotoV2,
        telegram_id: Number(defaultV2Params.telegramId),
        image_urls: ['http://example.com/image_v2.jpg'],
        additional_data: expect.objectContaining({
          service_version: 'v2',
          original_user_prompt: defaultV2Params.basePrompt,
          gender_used: 'female',
          trigger_word: 'my_bfl_trigger',
          revised_prompt: expect.stringContaining(expectedFullPromptPart),
        }),
        generation_time: expect.any(Number),
      })
    )
    expect(deps.sendMediaToPulse).toHaveBeenCalled()

    expect(results.results).toHaveLength(1)
    expect(results.results[0].error).toBeUndefined()
    expect(results.results[0].imageUrl).toBe('http://example.com/image_v2.jpg')
    expect(results.results[0].localPath).toBe('/path/to/local/image_v2.jpg')
    expect(results.results[0].promptId).toBe('mock_prompt_id_v2')
  })

  it('should return an error if bfl model is not found', async () => {
    ;(
      deps.getLatestUserModel as Mock<
        (...args: [number, string]) => ReturnType<GetLatestUserModelFn>
      >
    ).mockResolvedValueOnce(null)

    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.getLatestUserModel).toHaveBeenCalledWith(
      Number(defaultV2Params.telegramId),
      'bfl'
    )
    expect(results.results).toHaveLength(1)
    expect(results.results[0].error).toBe('NO_BFL_MODEL_OR_TRIGGER')
    expect(deps.getUserData).not.toHaveBeenCalled()
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should use default gender_part if getUserData returns no gender', async () => {
    ;(
      deps.getUserData as Mock<(...args: [string]) => ReturnType<GetUserDataFn>>
    ).mockResolvedValueOnce({})

    await generateNeuroPhotoV2(defaultV2Params, deps)

    const expectedFullPromptPartDefaultGender = `Fashionable my_bfl_trigger person, ${defaultV2Params.basePrompt}`
    expect(deps.replicateRun).toHaveBeenCalledWith(
      'replicate/bfl-model:version_hash',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: expect.stringContaining(expectedFullPromptPartDefaultGender),
        }),
      })
    )
  })

  it('should correctly handle numImages > 1', async () => {
    const paramsWithMultipleImages: GenerateV2Params = {
      ...defaultV2Params,
      numImages: 2,
    }
    ;(
      deps.replicateRun as Mock<
        (
          ...args: [string, { input: any }]
        ) => Promise<ReplicateRunMinimalResponse>
      >
    )
      .mockResolvedValueOnce({
        id: 'replicate_run_id_v2_img1',
        status: 'succeeded',
        output: ['http://example.com/image_v2_1.jpg'],
      })
      .mockResolvedValueOnce({
        id: 'replicate_run_id_v2_img2',
        status: 'succeeded',
        output: ['http://example.com/image_v2_2.jpg'],
      })
    ;(deps.generateUUID as Mock<(...args: []) => string>)
      .mockReturnValueOnce('mock-uuid-v2-img1')
      .mockReturnValueOnce('mock-uuid-v2-img2')
    ;(
      deps.saveFileLocally as Mock<
        (...args: [string, string, string, string]) => Promise<string>
      >
    )
      .mockResolvedValueOnce('/path/to/local/image_v2_1.jpg')
      .mockResolvedValueOnce('/path/to/local/image_v2_2.jpg')
    ;(
      deps.savePromptDirect as Mock<
        (...args: [Parameters<SavePromptDirectFn>[0]]) => Promise<string | null>
      >
    )
      .mockResolvedValueOnce('mock_prompt_id_v2_img1')
      .mockResolvedValueOnce('mock_prompt_id_v2_img2')

    const results = await generateNeuroPhotoV2(paramsWithMultipleImages, deps)

    expect(deps.replicateRun).toHaveBeenCalledTimes(2)
    expect(deps.directPaymentProcessor).toHaveBeenCalledTimes(1) // Оплата один раз за всю пачку
    expect(deps.saveFileLocally).toHaveBeenCalledTimes(2)
    expect(deps.savePromptDirect).toHaveBeenCalledTimes(2)
    expect(deps.sendMediaToPulse).toHaveBeenCalledTimes(2)
    expect(results.results).toHaveLength(2)
    expect(results.results[0].imageUrl).toBe(
      'http://example.com/image_v2_1.jpg'
    )
    expect(results.results[1].imageUrl).toBe(
      'http://example.com/image_v2_2.jpg'
    )
  })

  it('should return an error if user is not found', async () => {
    ;(
      deps.getUserByTelegramIdString as Mock<
        (...args: [string]) => Promise<User | null>
      >
    ).mockResolvedValueOnce(null)
    const results = await generateNeuroPhotoV2(defaultV2Params, deps)
    expect(results.results).toHaveLength(1)
    expect(results.results[0].error).toBe('USER_NOT_FOUND')
    expect(deps.getLatestUserModel).not.toHaveBeenCalled()
  })

  it('should return an error if user balance is insufficient', async () => {
    const userWithLowBalance = createMockUserV2(defaultV2Params.telegramId, 5) // Баланс 5, стоимость 15
    ;(
      deps.getUserByTelegramIdString as Mock<
        (...args: [string]) => Promise<User | null>
      >
    ).mockResolvedValue(userWithLowBalance)
    ;(
      deps.directPaymentProcessor as Mock<
        (
          ...args: [Parameters<DirectPaymentProcessorFn>[0]]
        ) => ReturnType<DirectPaymentProcessorFn>
      >
    ).mockResolvedValueOnce({
      success: false,
      error: 'INSUFFICIENT_FUNDS',
    })

    const results = await generateNeuroPhotoV2(defaultV2Params, deps)

    expect(deps.directPaymentProcessor).toHaveBeenCalled()
    expect(results.results).toHaveLength(1)
    expect(results.results[0].error).toBe('INSUFFICIENT_FUNDS')
    expect(results.paymentError).toBe('INSUFFICIENT_FUNDS')
    expect(deps.replicateRun).not.toHaveBeenCalled()
  })

  it('should handle Replicate API error', async () => {
    ;(
      deps.replicateRun as Mock<
        (
          ...args: [string, { input: any }]
        ) => Promise<ReplicateRunMinimalResponse>
      >
    ).mockRejectedValueOnce(new Error('Replicate API Down'))
    const results = await generateNeuroPhotoV2(defaultV2Params, deps)
    expect(results.results).toHaveLength(1)
    expect(results.results[0].error).toBe('REPLICATE_API_ERROR')
    expect(results.results[0].errorMessage).toContain('Replicate API Down')
  })

  it('should handle Replicate result with no output', async () => {
    ;(
      deps.replicateRun as Mock<
        (
          ...args: [string, { input: any }]
        ) => Promise<ReplicateRunMinimalResponse>
      >
    ).mockResolvedValueOnce({
      id: 'replicate_run_id_v2_no_output',
      status: 'succeeded',
      output: null, // или output: []
    })
    const results = await generateNeuroPhotoV2(defaultV2Params, deps)
    expect(results.results).toHaveLength(1)
    expect(results.results[0].error).toBe('REPLICATE_NO_OUTPUT')
  })

  // Тест для проверки, что пользователь 1 уровня не может генерировать
  it('should prevent generation for user level 1', async () => {
    const userLevel1 = createMockUserV2(defaultV2Params.telegramId, 200, 1)
    ;(
      deps.getUserByTelegramIdString as Mock<
        (...args: [string]) => Promise<User | null>
      >
    ).mockResolvedValue(userLevel1)
    const results = await generateNeuroPhotoV2(defaultV2Params, deps)
    expect(results.results[0].error).toBe('USER_LEVEL_TOO_LOW')
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
  })

  // Тест для проверки обхода оплаты
  it('should bypass payment if bypassPaymentCheck is true', async () => {
    const paramsBypass: GenerateV2Params = {
      ...defaultV2Params,
      bypassPaymentCheck: true,
    }
    await generateNeuroPhotoV2(paramsBypass, deps)
    expect(deps.directPaymentProcessor).not.toHaveBeenCalled()
    expect(deps.replicateRun).toHaveBeenCalled() // Убедимся, что генерация была вызвана
  })
})
