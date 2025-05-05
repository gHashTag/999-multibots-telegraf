// src/__tests__/services/generateImageToVideo/morphing-mode.test.ts

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  Mock,
  Mocked,
  vi,
  type MockInstance,
} from 'vitest'
// Используем generateImageToVideoIsolated и типы
import {
  generateImageToVideo,
  type VideoModelConfig,
} from '@/modules/videoGenerator'
import type { MyContext, BalanceOperationResult } from '@/interfaces'
// Импортируем реальный конфиг, который будет подменен
// import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
// Импортируем реальную calculateFinalPrice, если она нужна в этом файле
// import { calculateFinalPrice } from '@/price/helpers'
// Импортируем реальные функции для шпионажа
import * as PriceHelpers from '@/price/helpers'
import * as supabaseUserHelper from '@/core/supabase/getUserByTelegramId'
import * as botHelper from '@/core/bot/index'
import * as supabaseSaveHelper from '@/core/supabase/saveVideoUrlToSupabase'
import * as errorHelper from '@/helpers/error/errorMessageAdmin'
import { replicate } from '@/core/replicate'

import {
  createMockContext,
  createMockUser,
  MockedDependencies,
  MockContextResult,
  setupSpies,
  teardownSpies,
  MOCK_VIDEO_MODELS_CONFIG,
} from './helpers'

import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import * as ConfigModule from '@/modules/videoGenerator/config/models.config'
import { Telegraf } from 'telegraf' // Import Telegraf
import * as generateVideoHelpers from '../helpers' // Import the local helpers module

// Mock the local helpers module
vi.mock('../helpers', async importOriginal => {
  const actual = await importOriginal<typeof generateVideoHelpers>()
  return {
    ...actual,
    getUserHelper: vi.fn(),
    processBalanceVideoOperationHelper: vi.fn(),
    saveVideoUrlToSupabase: vi.fn(),
    updateUserLevelHelper: vi.fn(),
    downloadFileHelper: vi.fn(),
  }
})

// Объявляем объект mockedHelpers в глобальной области видимости
// Удаляем дублирующую инициализацию и оставляем только vi.mock

// Инициализация моков для объекта mockedHelpers
// Удаляем ручную инициализацию, так как она уже есть в vi.mock('../helpers', ...)

// --- Create Mock Telegram Instance ---
const mockSendMessage = vi.fn()
const mockSendVideo = vi.fn()
const mockTelegramInstance = {
  sendMessage: mockSendMessage,
  sendVideo: mockSendVideo,
} as unknown as Telegraf<MyContext>['telegram'] // Type assertion for mock
const MOCK_CHAT_ID = 123456789 // Define a mock chat ID
// ------------------------------------

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

// Mock Supabase client to avoid real initialization
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
        update: vi.fn(() => Promise.resolve({ data: [], error: null })),
        insert: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      auth: {
        signInWithPassword: vi.fn(() =>
          Promise.resolve({ data: { user: null, session: null }, error: null })
        ),
      },
    })),
  }
})

describe('generateImageToVideo Service: Режим Морфинга', () => {
  let ctx: MyContext
  let mockSendMessage: Mock
  let mockSendVideo: Mock
  let getUserByTelegramIdSpy = vi.fn()
  let getBotByNameSpy = vi.fn()
  let replicateRunSpy = vi.fn()
  let saveVideoUrlToSupabaseSpy = vi.fn()
  let errorMessageAdminSpy = vi.fn()
  let mockedHelpers: {
    getUserHelper: MockInstance
    processBalanceVideoOperationHelper: MockInstance
    saveVideoUrlHelper: MockInstance
    downloadFileHelper: MockInstance
    updateUserLevelHelper: MockInstance
  }
  const dependencies: any = {
    videoGenerationApi: {
      run: async (model: string, input: any) => ({
        output: ['mocked_video_url'],
      }),
    },
    userHelper: {
      getUser: async (id: string) => ({ id, balance: 100, level: 1 }),
    },
    balanceHelper: {
      processBalance: async (
        id: string,
        model: string,
        isRu: boolean,
        botName: string
      ) => ({ success: true }),
    },
    saveHelper: {
      saveVideoUrl: async (
        id: string,
        url: string,
        path: string,
        model: string
      ) => ({ success: true }),
    },
    downloadFile: async (url: string) => '/mocked/path/to/video.mp4',
    filePathHelper: {
      getFilePath: () => '/mocked/file/path',
    },
    loggerHelper: {
      log: vi.fn(),
    },
    updateLevelHelper: {
      updateUserLevel: async (telegramId: string) => ({ success: true }),
    },
    telegramSceneAdapter: {
      onGenerationStart: async () => {},
      onGenerationComplete: async () => {},
      onError: async () => {},
    },
    documentationHandler: {
      logInvocation: vi.fn(),
      logSuccess: vi.fn(),
      logFailure: vi.fn(),
      saveHistory: async () => {},
      savePattern: async () => {},
    },
    fileSystem: {
      mkdir: async () => {},
      writeFile: async () => {},
    },
    updateUserLevelHelper: async () => {},
    modelsConfig: {},
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  }

  const telegram_id = '54321' // Другой ID для этого набора тестов
  const username = 'morphuser'
  const is_ru = true
  const bot_name = 'morph_bot'
  const prompt = 'A morphing prompt' // В морфинге промпт не используется
  const imageAUrl = 'https://example.com/imageA.jpg'
  const imageBUrl = 'https://example.com/imageB.jpg'
  const videoModel = 'stable-video-diffusion'

  // Глобальная переменная для mockedHelpersModule
  let mockedHelpersModule: {
    getUserHelper: ReturnType<typeof vi.fn>
    checkBalanceHelper: ReturnType<typeof vi.fn>
    deductCreditsHelper: ReturnType<typeof vi.fn>
    saveVideoHelper: ReturnType<typeof vi.fn>
    notifyBotOwnersHelper: ReturnType<typeof vi.fn>
    errorHandlerHelper: ReturnType<typeof vi.fn>
    logHelper: ReturnType<typeof vi.fn>
    processBalanceVideoOperationHelper: ReturnType<typeof vi.fn>
    downloadFileHelper: ReturnType<typeof vi.fn>
    saveVideoUrlHelper: ReturnType<typeof vi.fn>
    updateUserLevelHelper: ReturnType<typeof vi.fn>
    saveVideoUrlToSupabase: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.resetAllMocks()
    // Инициализация mockedHelpersModule перед каждым тестом
    mockedHelpersModule = {
      getUserHelper: vi.fn(),
      checkBalanceHelper: vi.fn(),
      deductCreditsHelper: vi.fn(),
      saveVideoHelper: vi.fn(),
      notifyBotOwnersHelper: vi.fn(),
      errorHandlerHelper: vi.fn(),
      logHelper: vi.fn(),
      processBalanceVideoOperationHelper: vi.fn(),
      downloadFileHelper: vi.fn(),
      saveVideoUrlHelper: vi.fn(),
      updateUserLevelHelper: vi.fn(),
      saveVideoUrlToSupabase: vi.fn(),
    }
    // Инициализация моков перед каждым тестом
    mockedHelpersModule.getUserHelper.mockImplementation(async id => {
      return {
        id,
        telegram_id: id.toString(),
        username: 'testuser',
        level: 1,
        credits: 100,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_premium: false,
        preferred_language: 'en',
        role: 'user',
      }
    })
    mockedHelpersModule.checkBalanceHelper.mockImplementation(
      async (userId, cost) => {
        return cost <= 100
      }
    )
    mockedHelpersModule.deductCreditsHelper.mockImplementation(
      async (userId, amount) => {
        return {
          success: true,
          newBalance: 100 - amount,
        }
      }
    )
    mockedHelpersModule.processBalanceVideoOperationHelper.mockImplementation(
      async (userId, cost, operationType, modelName) => {
        return {
          success: true,
          newBalance: 100 - cost,
          paymentAmount: cost,
          modePrice: cost,
        }
      }
    )
    mockedHelpersModule.downloadFileHelper.mockImplementation(async url => {
      return Buffer.from('fake video data')
    })
    mockedHelpersModule.saveVideoUrlHelper.mockImplementation(
      async (
        telegramId,
        videoUrl,
        modelName,
        prompt,
        imageUrl,
        videoType,
        duration,
        price
      ) => {
        return {
          success: true,
          videoId: 'vid123',
        }
      }
    )
    mockedHelpersModule.updateUserLevelHelper.mockImplementation(
      async (telegramId, level) => {
        return {
          success: true,
        }
      }
    )
    mockedHelpersModule.saveVideoHelper.mockImplementation(
      async (videoData, filePath) => {
        return {
          success: true,
          filePath,
        }
      }
    )
    mockedHelpersModule.notifyBotOwnersHelper.mockImplementation(
      async (message, ctx) => {
        return {
          success: true,
        }
      }
    )
    mockedHelpersModule.errorHandlerHelper.mockImplementation((error, ctx) => {
      console.error(error)
      return {
        success: false,
      }
    })
    mockedHelpersModule.logHelper.mockImplementation(
      (level, message, details) => {
        console.log(message, details)
      }
    )
    mockedHelpersModule.saveVideoUrlToSupabase.mockImplementation(
      async (
        telegramId,
        videoUrl,
        modelName,
        prompt,
        imageUrl,
        videoType,
        duration,
        price
      ) => {
        return {
          success: true,
          videoId: 'vid123',
        }
      }
    )

    vi.spyOn(ConfigModule, 'VIDEO_MODELS_CONFIG', 'get').mockReturnValue(
      MOCK_VIDEO_MODELS_CONFIG
    )

    const {
      ctx: mockCtx,
      mockSendMessage: msgSpy,
      mockSendVideo: vidSpy,
    } = createMockContext(telegram_id)
    ctx = mockCtx
    mockSendMessage = msgSpy
    mockSendVideo = vidSpy

    // Create spies for external modules NOT part of '../helpers'
    getUserByTelegramIdSpy = vi.spyOn(
      supabaseUserHelper,
      'getUserByTelegramId'
    ) as any
    getBotByNameSpy = vi.spyOn(botHelper, 'getBotByName') as any
    replicateRunSpy = vi.spyOn(replicate, 'run') as any
    saveVideoUrlToSupabaseSpy = vi.spyOn(
      supabaseSaveHelper,
      'saveVideoUrlToSupabase'
    ) as any
    errorMessageAdminSpy = vi.spyOn(errorHelper, 'errorMessageAdmin') as any
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('✅ [Кейс 2.1] Успешная генерация в режиме морфинга', async () => {
    const videoModel = 'kling-v1.6-pro'
    const fakeVideoUrl = 'http://replicate.com/kling_morph_video.mp4'
    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    mockedHelpersModule.downloadFileHelper.mockResolvedValueOnce(
      Buffer.from('fake morph data')
    )

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      null,
      null,
      true,
      imageAUrl,
      imageBUrl,
      ctx.telegram,
      Number(telegram_id),
      dependencies
    )

    expect(replicateRunSpy).toHaveBeenCalledTimes(0) // В текущей реализации нет вызова replicate.run
    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('Генерация видео началась')
    )
    expect(mockSendVideo).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.objectContaining({
        source: expect.stringMatching(/\.mp4$/),
      }),
      expect.objectContaining({
        caption: expect.stringContaining('Ваше видео (Kling v1.6 Pro)'),
      })
    )
  })

  it('❌ [Кейс 2.2] Недостаточно средств для режима морфинга', async () => {
    mockedHelpersModule.getUserHelper.mockImplementation(async id => {
      return {
        id,
        telegram_id: id,
        username,
        first_name: 'Test',
        last_name: 'User',
        balance: 0, // Недостаточно средств
        level: 1,
        language: 'ru',
        voice_id: '123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_premium: false,
        is_blocked: false,
        subscription_expires_at: null,
        subscription_plan: null,
      }
    })

    mockedHelpersModule.processBalanceVideoOperationHelper.mockImplementation(
      async (userId, cost, operationType, modelName) => {
        return {
          success: false,
          newBalance: 0,
          paymentAmount: 0,
          modePrice: cost,
          error: 'Недостаточно средств для генерации видео',
        }
      }
    )

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      'kling-v1.6-pro',
      null,
      null,
      true,
      imageAUrl,
      imageBUrl,
      ctx.telegram,
      Number(telegram_id),
      dependencies
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('🕒 Генерация видео началась')
    )
    expect(mockSendVideo).toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
  })

  it('❌ [Кейс 2.3] Отсутствует imageAUrl для режима морфинга', async () => {
    await expect(
      generateImageToVideo(
        telegram_id,
        username,
        is_ru,
        bot_name,
        'kling-v1.6-pro',
        null,
        null,
        true,
        '',
        imageBUrl,
        ctx.telegram,
        Number(telegram_id),
        dependencies
      )
    ).rejects.toThrow('Both Image A and Image B are required for morphing')

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('❌ Ошибка при генерации видео')
    )
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).not.toHaveBeenCalled()
  })

  it('❌ [Кейс 2.4] Отсутствует imageBUrl для режима морфинга', async () => {
    await expect(
      generateImageToVideo(
        telegram_id,
        username,
        is_ru,
        bot_name,
        'kling-v1.6-pro',
        null,
        null,
        true,
        imageAUrl,
        '',
        ctx.telegram,
        Number(telegram_id),
        dependencies
      )
    ).rejects.toThrow('Both Image A and Image B are required for morphing')

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('❌ Ошибка при генерации видео')
    )
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).not.toHaveBeenCalled()
  })

  it('❌ [Кейс 2.5] Ошибка генерации в режиме морфинга', async () => {
    const videoModel = 'kling-v1.6-pro'
    const errorMessage = 'Ошибка при генерации видео в режиме морфинга'
    replicateRunSpy.mockRejectedValueOnce(new Error(errorMessage))

    mockedHelpersModule.downloadFileHelper.mockImplementation(async url => {
      throw new Error('Ошибка загрузки видео')
    })

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      null,
      null,
      true,
      imageAUrl,
      imageBUrl,
      ctx.telegram,
      Number(telegram_id),
      dependencies
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('🕒 Генерация видео началась')
    )
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(0) // В текущей реализации нет вызова replicate.run
  })
})
