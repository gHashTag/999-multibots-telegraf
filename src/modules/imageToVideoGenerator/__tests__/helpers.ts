import { vi, Mocked, Mock, MockInstance } from 'vitest'
import type { MyContext } from '@/interfaces'
import { Telegraf } from 'telegraf'

import * as SupabaseCore from '@/core/supabase'
import * as PriceHelpers from '@/price/helpers'
import * as ReplicateClient from '@/core/replicate'
import * as DownloadHelper from '@/helpers/downloadFile'
import * as ErrorAdmin from '@/helpers/error/errorMessageAdmin'
import * as LoggerUtils from '@/utils/logger'
import type { VideoModelKey } from '@/interfaces'
import * as ConfigModule from '@/config'
import type { VideoModelConfig } from '@/price/models/VIDEO_MODELS_CONFIG'
import * as BotIndex from '@/core/bot/index'
// Import the mocked functions from fs/promises
// const mockMkdir = vi.fn()
// const mockWriteFile = vi.fn()
// Import fs/promises
import * as FSPromises from 'fs/promises'

// --- МОКИ ДРУГИХ МОДУЛЕЙ ---
vi.mock('@/utils/logger')
vi.mock('@/helpers/error/errorMessageAdmin')
// Мокируем fs/promises, используя объявленные выше переменные
// vi.mock('fs/promises', () => ({
//   mkdir: mockMkdir,
//   writeFile: mockWriteFile,
// }))

// --- Define helper functions BEFORE vi.mock (если они нужны ВНУТРИ vi.mock, иначе можно ниже) ---

// Simple mock user creator (can be expanded)
export const createMockUser = (
  telegram_id: string,
  balance = 100,
  level = 1,
  aspect_ratio = '16:9'
) => {
  return {
    id: `user-uuid-${telegram_id}`,
    telegram_id: Number(telegram_id),
    balance,
    level,
    aspect_ratio,
    // Add other user properties as needed by tests
  } as any // Use 'as any' for simplicity or define a proper mock type
}

// --- УДАЛЯЕМ ДИНАМИЧЕСКИЙ МОК ---
// vi.mock('@/price/models/VIDEO_MODELS_CONFIG', async importOriginal => {
//   // ... (весь старый код динамического мока удален) ...
// })

// +++ СОЗДАЕМ СТАТИЧЕСКИЙ МОК +++
export const MOCK_VIDEO_MODELS_CONFIG: Record<VideoModelKey, VideoModelConfig> =
  {
    // Модели, используемые в тестах
    'stable-video-diffusion': {
      id: 'stable-video-diffusion',
      title: 'Stable Video Diffusion',
      inputType: ['image', 'text'],
      description: 'Mock SVD',
      basePrice: 30,
      api: {
        model:
          'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172638',
        input: { cfg: 2.5, motion_bucket_id: 127, steps: 25 },
      },
      imageKey: 'image',
      canMorph: true, // <--- ВРЕМЕННО РАЗРЕШАЕМ МОРФИНГ ДЛЯ ТЕСТОВ
    },
    // Закомментируем или удалим нерабочую модель
    // 'kling-v1.6-pro': {
    //   id: 'kling-v1.6-pro',
    //   title: 'Kling v1.6 Pro',
    //   inputType: ['image', 'text'],
    //   description: 'Mock Kling',
    //   basePrice: 45,
    //   api: {
    //     model: 'aliyun/video-kling-v1:kling-v1.6-pro',
    //     input: { aspect_ratio: '16:9' /* другие параметры */ },
    //   },
    //   imageKey: 'image',
    //   canMorph: true,
    // },
    minimax: {
      id: 'minimax',
      title: 'Minimax',
      inputType: ['image', 'text'],
      description: 'Mock Minimax',
      basePrice: 25, // Примерная цена
      api: { model: 'minimax-video:latest', input: {} },
      imageKey: 'image',
      canMorph: false,
    },
    'wan-text-to-video': {
      // Модель без imageKey для теста Кейс 1.5
      id: 'wan-text-to-video',
      title: 'Wan Text-to-Video',
      inputType: ['text'],
      description: 'Mock Wan TTV',
      basePrice: 20,
      api: { model: 'wan-ttv:latest', input: {} },
      // imageKey отсутствует намеренно
      canMorph: false,
    },
    // Добавьте другие модели по мере необходимости для тестов
  }
// Переименовываем экспорт для совместимости
export const VIDEO_MODELS_CONFIG = MOCK_VIDEO_MODELS_CONFIG
// +++ КОНЕЦ СТАТИЧЕСКОГО МОКА +++

// --- Declare Mocked Variables Type --- (Export for use in tests)
export interface MockedDependencies {
  supabaseMock: Mocked<typeof SupabaseCore>
  priceMock: Mocked<typeof PriceHelpers>
  // Убираем replicateClientMock, так как будем использовать spyOn
  // replicateClientMock: Mocked<typeof ReplicateClient.replicate>
  downloadMock: Mocked<typeof DownloadHelper>
  errorAdminMock: Mocked<typeof ErrorAdmin>
  loggerMock: Mocked<typeof LoggerUtils>
  // fsPromisesMocks: {
  //   mkdir: typeof mkdirMock
  //   writeFile: typeof writeFileMock
  // }
  spies: ReturnType<typeof setupSpies>
}

// Define the return type for createMockContext
export interface MockContextResult {
  ctx: MyContext
  mockSendMessage: Mock // Use the correct type for vi.fn()
  mockSendVideo: Mock
  loggerErrorSpy: any
  loggerInfoSpy: any
  updateUserLevelPlusOneSpy: any
  mkdirSpy: any
  writeFileSpy: any
}

// --- Setup Function --- (To be called in beforeEach of each test file)
export const setupMocks = async (): Promise<MockedDependencies> => {
  vi.resetAllMocks()
  // mkdirMock.mockReset()
  // writeFileMock.mockReset()

  // ---> ДОБАВЛЯЕМ ЯВНУЮ ОЧИСТКУ КЭША
  const GetUserBalanceModule = await import('@/core/supabase/getUserBalance')
  // Получаем доступ к внутреннему кэшу (это хак, но для теста допустимо)
  try {
    const internalCache = (GetUserBalanceModule as any).balanceCache
    if (internalCache) {
      for (const key in internalCache) {
        delete internalCache[key]
      }
      console.log('[TEST_HELPER] Manually cleared internal balanceCache')
    }
  } catch (e) {
    console.warn(
      '[TEST_HELPER] Could not manually clear internal balanceCache',
      e
    )
  }

  // --- Initialize mocks ---
  const supabaseMock = vi.mocked(SupabaseCore)
  const priceMock = vi.mocked(PriceHelpers)
  // Убираем инициализацию мока replicate
  // const replicateClientMock = vi.mocked(ReplicateClient.replicate)
  const downloadMock = vi.mocked(DownloadHelper)
  const errorAdminMock = vi.mocked(ErrorAdmin)
  const loggerMock = vi.mocked(LoggerUtils)
  // const fsPromisesMocks = {
  //   mkdir: mkdirMock,
  //   writeFile: writeFileMock,
  // }

  // --- Set default mock implementations ---
  supabaseMock.getUserByTelegramId.mockResolvedValue(null)
  // Убираем дефолтный мок для replicate.run
  // replicateClientMock.run.mockRejectedValue(new Error('Replicate Error Mock'))
  supabaseMock.saveVideoUrlToSupabase.mockResolvedValue(undefined)
  errorAdminMock.errorMessageAdmin.mockClear()

  // fsPromisesMocks.mkdir.mockResolvedValue(undefined as any)
  // fsPromisesMocks.writeFile.mockResolvedValue(undefined)

  vi.mocked(downloadMock.downloadFile).mockResolvedValue(
    Buffer.from('fake video data')
  )
  downloadMock.downloadFile.mockClear()

  return {
    supabaseMock,
    priceMock,
    // Убираем replicateClientMock из возвращаемого объекта
    // replicateClientMock,
    downloadMock,
    errorAdminMock,
    loggerMock,
    // fsPromisesMocks,
    spies: setupSpies(),
  }
}

// --- Missing Helper Function Stubs --- (Implement or refine later)

export const createMockContext = (
  telegram_id: string,
  username = 'testuser',
  bot_name = 'test_bot'
): MockContextResult => {
  // Update return type here
  const mockSendVideo = vi.fn().mockResolvedValue({ message_id: 1 } as any)
  const mockSendMessage = vi.fn().mockResolvedValue({ message_id: 2 } as any)
  const mockTelegram = {
    sendVideo: mockSendVideo,
    sendMessage: mockSendMessage,
  }

  const ctx = {
    telegram: mockTelegram as any,
    from: {
      id: Number(telegram_id),
      username: username,
      is_bot: false,
      first_name: 'Test',
    },
    message: {
      from: {
        id: Number(telegram_id),
        username: username,
        is_bot: false,
        first_name: 'Test',
      },
      chat: { id: Number(telegram_id), type: 'private' },
      message_id: Math.floor(Math.random() * 1000),
      date: Date.now() / 1000,
    } as any,
    session: {} as any,
    botInfo: { username: bot_name } as any,
  } as MyContext

  // Return both ctx and the mock functions
  return {
    ctx,
    mockSendMessage,
    mockSendVideo,
    loggerErrorSpy: vi.spyOn(LoggerUtils.logger, 'error'),
    loggerInfoSpy: vi.spyOn(LoggerUtils.logger, 'info'),
    updateUserLevelPlusOneSpy: vi.spyOn(SupabaseCore, 'updateUserLevelPlusOne'),
    mkdirSpy: vi.spyOn(FSPromises, 'mkdir'),
    writeFileSpy: vi.spyOn(FSPromises, 'writeFile'),
  }
}

// +++ УПРОЩАЕМ setupSpies: ТОЛЬКО СОЗДАНИЕ ШПИОНОВ +++
export const setupSpies = () => {
  const spies = {
    processBalanceSpy: vi.spyOn(PriceHelpers, 'processBalanceVideoOperation'),
    getUserBalanceSpy: vi.spyOn(SupabaseCore, 'getUserBalance'),
    replicateRunSpy: vi.spyOn(ReplicateClient.replicate, 'run'),
    downloadFileSpy: vi.spyOn(DownloadHelper, 'downloadFile'),
    getUserByTelegramIdSpy: vi.spyOn(SupabaseCore, 'getUserByTelegramId'),
    saveVideoUrlToSupabaseSpy: vi.spyOn(SupabaseCore, 'saveVideoUrlToSupabase'),
    getBotByNameSpy: vi.spyOn(BotIndex, 'getBotByName'),
    errorMessageAdminSpy: vi.spyOn(ErrorAdmin, 'errorMessageAdmin'),
    loggerErrorSpy: vi.spyOn(LoggerUtils.logger, 'error'),
    loggerInfoSpy: vi.spyOn(LoggerUtils.logger, 'info'),
    updateUserLevelPlusOneSpy: vi.spyOn(SupabaseCore, 'updateUserLevelPlusOne'),
    mkdirSpy: vi.spyOn(FSPromises, 'mkdir'),
    writeFileSpy: vi.spyOn(FSPromises, 'writeFile'),
  }

  // --- УДАЛЯЕМ УСТАНОВКУ ДЕФОЛТНЫХ РЕАЛИЗАЦИЙ ---
  // spies.processBalanceSpy.mockResolvedValue(...)
  // spies.getUserBalanceSpy.mockResolvedValue(...)
  // ... и так далее для всех шпионов ...

  return spies
}

// teardownSpies остается без изменений
export const teardownSpies = (spies: ReturnType<typeof setupSpies>) => {
  Object.values(spies).forEach(spy => {
    if (spy && typeof spy.mockRestore === 'function') {
      spy.mockRestore()
    }
  })
}
// +++ КОНЕЦ УПРОЩЕНИЯ +++

// Экспортируем моки fs для использования в тестах
// export { mockMkdir, mockWriteFile }
