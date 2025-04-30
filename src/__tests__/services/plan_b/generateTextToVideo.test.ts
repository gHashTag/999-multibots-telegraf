import { vi, describe, it, expect, beforeEach, Mocked } from 'vitest'
import { generateTextToVideo } from '@/services/plan_b/generateTextToVideo'
import type { MyContext, BalanceOperationResult } from '@/interfaces' // Keep necessary types if used indirectly or by mocks
// Import types for mocked modules
import type * as SupabaseCore from '@/core/supabase'
import type * as PriceHelpers from '@/price/helpers'
import type Replicate from 'replicate' // Import the default export type for mocking replicate.run
import type * as ReplicateClient from '@/core/replicate/generateVideo' // For mocking generateVideo helper
import type * as FsPromises from 'fs/promises'
import type * as ErrorHelper from '@/helpers/error' // Combined error helpers
import type * as LoggerUtils from '@/utils/logger'
import type * as BotCore from '@/core/bot' // For mocking getBotByName
import type * as PulseHelper from '@/helpers/pulse' // For mocking pulse helper
import type * as BotNameHelper from '@/helpers/botName.helper' // For mocking toBotName
import type { BotName } from '@/interfaces'
import {
  VIDEO_MODELS_CONFIG as VideoModelsConfigValue,
  VideoModelConfig,
} from '@/price/models/VIDEO_MODELS_CONFIG'
import * as fsPromises from 'fs/promises' // Import namespace for mocking fs functions
import { Telegram } from 'telegraf' // Import Telegram type for mocking bot.telegram

// --- Mock External Dependencies ---

vi.mock('@/core/replicate/generateVideo') // Mock the helper directly
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    // Можно добавить другие уровни, если они используются
  },
}))
vi.mock('@/core/supabase')
vi.mock('@/price/helpers')
vi.mock('@/helpers/error') // Mock combined error helper module
vi.mock('fs/promises')
vi.mock('@/core/bot')
vi.mock('@/helpers/pulse')
vi.mock('@/helpers/botName.helper')

// Mock Models Config (can keep the dynamic mock from imageToVideo if needed, or simplify)
vi.mock('@/price/models/VIDEO_MODELS_CONFIG', async importOriginal => {
  const originalModule =
    (await importOriginal()) as typeof import('@/price/models/VIDEO_MODELS_CONFIG')
  if (!originalModule || !originalModule.VIDEO_MODELS_CONFIG) {
    throw new Error('Failed to import original VIDEO_MODELS_CONFIG for mocking')
  }
  const REAL_VIDEO_MODELS_CONFIG = originalModule.VIDEO_MODELS_CONFIG
  const mockConfig: Record<string, VideoModelConfig> = {}
  for (const key in REAL_VIDEO_MODELS_CONFIG) {
    if (Object.prototype.hasOwnProperty.call(REAL_VIDEO_MODELS_CONFIG, key)) {
      const realModelConfig = REAL_VIDEO_MODELS_CONFIG[key]
      mockConfig[key] = {
        ...realModelConfig,
        api: {
          ...realModelConfig.api,
          input: { ...realModelConfig.api.input },
        },
      } // Deep copy essentials
    }
  }
  return { VIDEO_MODELS_CONFIG: mockConfig }
})

// --- Test Suite ---

describe('generateTextToVideo Service', () => {
  // Declare Mocked Variables
  let supabaseMock: Mocked<typeof SupabaseCore>
  let priceMock: Mocked<typeof PriceHelpers>
  let generateVideoMock: Mocked<typeof ReplicateClient>
  let fsPromisesMock: Mocked<typeof FsPromises>
  let errorHelperMock: Mocked<typeof ErrorHelper>
  let loggerInfoMock: Mocked<(...args: any[]) => void>
  let loggerErrorMock: Mocked<(...args: any[]) => void>
  let botCoreMock: Mocked<typeof BotCore>
  let pulseMock: Mocked<typeof PulseHelper>
  let botNameMock: Mocked<typeof BotNameHelper>
  let mockTelegram: Mocked<Telegram> // To mock bot.telegram methods

  beforeEach(async () => {
    vi.resetAllMocks()

    // Получаем мокнутые функции логгера
    const loggerModule = await import('@/utils/logger')
    loggerInfoMock = loggerModule.logger.info as Mocked<any>
    loggerErrorMock = loggerModule.logger.error as Mocked<any>

    // Инициализируем остальные моки
    supabaseMock = vi.mocked(await import('@/core/supabase'))
    priceMock = vi.mocked(await import('@/price/helpers'))
    generateVideoMock = vi.mocked(
      await import('@/core/replicate/generateVideo')
    )
    // fsPromises мокируется глобально, не нужно импортировать здесь
    errorHelperMock = vi.mocked(await import('@/helpers/error'))
    botCoreMock = vi.mocked(await import('@/core/bot'))
    pulseMock = vi.mocked(await import('@/helpers/pulse'))
    botNameMock = vi.mocked(await import('@/helpers/botName.helper'))

    // Initialize the mocked Telegram instance
    mockTelegram = {
      sendMessage: vi.fn(),
      sendVideo: vi.fn(),
    } as any // Use 'any' for simplicity or mock more thoroughly if needed

    // Setup default mock implementations
    botNameMock.toBotName.mockImplementation(name => name as BotName) // Приводим к BotName
    botCoreMock.getBotByName.mockResolvedValue({
      bot: { telegram: mockTelegram },
    } as any) // Return mocked bot
    supabaseMock.getUserByTelegramIdString.mockResolvedValue(null) // Default: user not found
    priceMock.processBalanceVideoOperation.mockResolvedValue({
      success: false,
      error: 'Default mock error',
    } as any) // Default: balance error
    generateVideoMock.generateVideo.mockRejectedValue(
      new Error('generateVideo mock error')
    ) // Default: generateVideo fails
    supabaseMock.saveVideoUrlToSupabase.mockResolvedValue(undefined) // Default: save success
    supabaseMock.updateUserLevelPlusOne.mockResolvedValue(undefined) // Default: level update success
    pulseMock.pulse.mockResolvedValue(undefined) // Default: pulse success

    // Mock fs functions
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined)
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined) // Default: write success

    // Clear error mocks
    errorHelperMock.sendServiceErrorToAdmin.mockClear()
    errorHelperMock.sendServiceErrorToUser.mockClear()
    // Очищаем моки логгера правильно
    vi.mocked(loggerModule.logger.info).mockClear() // Верно
    vi.mocked(loggerModule.logger.error).mockClear() // Верно

    // Clear telegram mocks
    mockTelegram.sendMessage.mockClear()
    mockTelegram.sendVideo.mockClear()
  })

  // ==================================
  //  Основные Сценарии
  // ==================================
  describe('Основные Сценарии', () => {
    const telegram_id = '987654'
    const username = 'text_user'
    const is_ru = false
    const bot_name = 'text_test_bot'
    const prompt = 'A cat writing code'
    const videoModel = 'kling-v1.6-pro' as keyof typeof VideoModelsConfigValue // Example model

    // --- Успешная генерация ---
    it('✅ [Кейс 1.1] Успешная генерация', async () => {
      // --- Arrange ---
      const fakeGeneratedVideoBuffer = Buffer.from('fake generated video data')

      const expectedLocalPathRegex = /uploads\/987654\/text-to-video\/.+\.mp4$/ // Correct regex literal
      const paymentAmount = 25
      const newBalance = 175

      // Mock successful scenario
      supabaseMock.getUserByTelegramIdString.mockResolvedValue({
        id: 'user-uuid-text',
        balance: 200,
        level: 1,
      } as any)
      priceMock.processBalanceVideoOperation.mockResolvedValue({
        success: true,
        newBalance,
        paymentAmount,
        modePrice: paymentAmount,
        error: null,
      } as BalanceOperationResult)
      generateVideoMock.generateVideo.mockResolvedValue({
        video: fakeGeneratedVideoBuffer,
      })
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined) // Ensure writeFile is mocked for success

      // --- Act ---
      const result = await generateTextToVideo(
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name
      )

      // --- Assert ---
      expect(supabaseMock.getUserByTelegramIdString).toHaveBeenCalledWith(
        telegram_id
      )
      expect(priceMock.processBalanceVideoOperation).toHaveBeenCalledWith(
        expect.objectContaining({ from: { id: Number(telegram_id) } }),
        videoModel,
        is_ru
      )
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        telegram_id,
        expect.stringContaining('Generating video...'),
        expect.any(Object)
      )
      const modelConfig = VideoModelsConfigValue[videoModel]
      expect(generateVideoMock.generateVideo).toHaveBeenCalledWith(
        prompt,
        modelConfig.api.model,
        expect.any(String)
      )
      expect(fsPromises.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('uploads/987654/text-to-video'),
        { recursive: true }
      )
      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(expectedLocalPathRegex),
        fakeGeneratedVideoBuffer
      )
      expect(mockTelegram.sendVideo).toHaveBeenCalledWith(
        telegram_id.toString(),
        { source: expect.stringMatching(expectedLocalPathRegex) }
      )
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        telegram_id,
        expect.stringContaining(`Cost: ${paymentAmount.toFixed(2)}`),
        expect.any(Object)
      )
      expect(pulseMock.pulse).toHaveBeenCalledWith(
        expect.stringMatching(expectedLocalPathRegex),
        prompt,
        'text-to-video',
        telegram_id,
        username,
        is_ru,
        bot_name
      )
      expect(result).toEqual({
        videoLocalPath: expect.stringMatching(expectedLocalPathRegex),
      })
      expect(loggerErrorMock).not.toHaveBeenCalled()
      expect(errorHelperMock.sendServiceErrorToAdmin).not.toHaveBeenCalled()
      expect(errorHelperMock.sendServiceErrorToUser).not.toHaveBeenCalled()
    })

    // --- Другие тесты ---
    it.todo('❌ [Кейс 1.2] Обработка недостатка средств')
    it.todo('❌ [Кейс 1.3] Обработка ошибки поиска пользователя')
    it.todo('❌ [Кейс 1.4] Обработка ошибки API (generateVideo)')
    it.todo('❌ [Кейс 1.5] Обработка ошибки извлечения URL')
    it.todo('❌ [Кейс 1.6] Обработка ошибки сохранения файла (writeFile)')
    it.todo('❌ [Кейс 1.7] Обработка ошибки создания директории (mkdir)')
    it.todo(
      '❌ [Кейс 1.8] Обработка ошибки сохранения в БД (saveVideoUrlToSupabase)'
    )
    it.todo('❌ [Кейс 1.9] Обработка ошибки отправки Pulse')
    it.todo('❌ [Кейс 1.10] Проверка отправки ошибки админу при падении')
    it.todo('❌ [Кейс 1.11] Проверка отправки ошибки юзеру при падении')
    it.todo('✅ [Кейс 1.12] Проверка обновления уровня пользователя с 9 до 10')
  })
})
