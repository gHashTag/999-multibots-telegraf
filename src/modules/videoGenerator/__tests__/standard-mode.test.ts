// src/__tests__/services/generateImageToVideo/standard-mode.test.ts

// Mock the Supabase client
vi.mock('@/core/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  },
}))

// Используем generateImageToVideo и типы
import {
  generateImageToVideo,
  type VideoModelConfig, // <-- Import type
} from '@/modules/videoGenerator'
import { logger } from '@/utils/logger'
import * as downloadHelper from '@/helpers/downloadFile'
import * as supabaseUserHelper from '@/core/supabase/getUserByTelegramId'
import * as botHelper from '@/core/bot/index'
import * as priceHelper from '@/price/helpers'
import * as supabaseSaveHelper from '@/core/supabase/saveVideoUrlToSupabase'
import * as fsPromises from 'fs/promises'
import * as errorHelper from '@/helpers/error/errorMessageAdmin'
import { replicate } from '@/core/replicate'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import { Telegraf } from 'telegraf'
import * as LoggerUtils from '@/utils/logger'
import {
  MOCK_VIDEO_MODELS_CONFIG,
  createMockContext,
  createMockUser,
  setupSpies,
  teardownSpies,
} from './helpers'
import * as ConfigModule from '@/modules/videoGenerator/config/models.config'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  Mock,
  vi,
  type Mocked,
  type MockInstance,
} from 'vitest'
import * as generateVideoHelpers from '../helpers'

// Mock the local helpers module
vi.mock('../helpers', async importOriginal => {
  const actual = await importOriginal<typeof generateVideoHelpers>()
  return {
    ...actual, // Keep original implementations for other helpers if needed
    getUserHelper: vi.fn(), // Mock specific functions used by generateImageToVideo
    processBalanceVideoOperationHelper: vi.fn(),
    saveVideoUrlHelper: vi.fn(),
    updateUserLevelHelper: vi.fn(),
    downloadFileHelper: vi.fn(), // Also mock download helper if used directly
  }
})

// Cast the mocked module for easier use
const mockedHelpers = generateVideoHelpers as Mocked<
  typeof generateVideoHelpers
>

// --- УБИРАЕМ МОКИРОВАНИЕ FS/PROMISES ---
// const mockMkdir = vi.fn()
// const mockWriteFile = vi.fn()
// vi.mock('fs/promises', () => ({
//   mkdir: mockMkdir,
//   writeFile: mockWriteFile,
// }))
// --- КОНЕЦ УДАЛЕНИЯ ---

// --- Mocks & Spies ---
// Определяем тип для шпионов ЛОКАЛЬНО
// type SpiesType = ReturnType<typeof setupSpies>
// let spies: SpiesType // <-- Используем локальный тип

let ctx: MyContext
let mockSendMessage: Mock // <-- Используем Mock
let mockSendVideo: Mock // <-- Используем Mock

// --- Test Data ---
const telegram_id = '12345'
const username = 'testuser'
const bot_name = 'test_bot'
const is_ru = false
const imageUrl = 'http://example.com/image.jpg'
const prompt = 'Test prompt'

// --- Test Suite ---
describe('generateImageToVideo Service: Стандартный Режим (Image + Prompt -> Video)', () => {
  // Correct types for spies
  let getUserByTelegramIdSpy: MockInstance
  let getBotByNameSpy: MockInstance
  let replicateRunSpy: MockInstance
  let saveVideoUrlToSupabaseSpy: MockInstance
  let errorMessageAdminSpy: MockInstance

  beforeEach(async () => {
    vi.resetAllMocks()

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
    getUserByTelegramIdSpy = vi.spyOn(supabaseUserHelper, 'getUserByTelegramId')
    getBotByNameSpy = vi.spyOn(botHelper, 'getBotByName')
    replicateRunSpy = vi.spyOn(replicate, 'run')
    saveVideoUrlToSupabaseSpy = vi.spyOn(
      supabaseSaveHelper,
      'saveVideoUrlToSupabase'
    )
    errorMessageAdminSpy = vi.spyOn(errorHelper, 'errorMessageAdmin')

    // --- Set default resolutions for MOCKED helpers and external spies ---
    const defaultUser = createMockUser(telegram_id, 200000)
    mockedHelpers.getUserHelper.mockResolvedValue(defaultUser)

    const fakeBotInstanceStandard = {
      telegram: ctx.telegram,
    }
    getBotByNameSpy.mockResolvedValue({
      bot: fakeBotInstanceStandard as any,
      error: null,
    } as any)

    mockedHelpers.processBalanceVideoOperationHelper.mockResolvedValue({
      success: true,
      newBalance: 199999, // High balance to prevent issues
      paymentAmount: 1,
      modePrice: 1,
    })

    replicateRunSpy.mockResolvedValue(['http://replicate.com/default.mp4'])
    mockedHelpers.downloadFileHelper.mockResolvedValue(
      Buffer.from('fake video data')
    )
    mockedHelpers.saveVideoUrlHelper.mockResolvedValue(undefined)

    errorMessageAdminSpy.mockImplementation(() => LoggerUtils.logger as any)
    mockedHelpers.updateUserLevelHelper.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Restore only the spies for external modules
    getUserByTelegramIdSpy?.mockRestore()
    getBotByNameSpy.mockRestore()
    replicateRunSpy.mockRestore()
    saveVideoUrlToSupabaseSpy?.mockRestore()
    errorMessageAdminSpy.mockRestore()
    vi.restoreAllMocks()
  })

  // --- Тесты для стандартного режима ---
  it.skip('✅ [Кейс 1.1] Успешная генерация (stable-video-diffusion)', async () => {
    const videoModel = 'stable-video-diffusion'
    const fakeVideoUrl = 'http://replicate.com/svd_video.mp4'
    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    mockedHelpers.downloadFileHelper.mockResolvedValueOnce(
      Buffer.from('specific fake data')
    )

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      imageUrl,
      prompt,
      false, // isMorphing
      null, // imageAUrl
      null, // imageBUrl
      ctx.telegram,
      Number(telegram_id)
    )

    expect(getUserByTelegramIdSpy).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.downloadFileHelper).toHaveBeenCalledWith(fakeVideoUrl)
    expect(mockedHelpers.saveVideoUrlHelper).toHaveBeenCalledWith(
      telegram_id,
      fakeVideoUrl,
      expect.stringMatching(/uploads\/\d+\/image-to-video\/.+\.mp4$/),
      videoModel
    )
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).toHaveBeenCalledWith(
      Number(telegram_id),
      { source: expect.stringMatching(/\.mp4$/) },
      {
        caption: expect.stringContaining('Your video (Stable Video Diffusion)'),
      }
    )
  })

  // --- Тесты на пропуск (можно добавить позже) ---
  it.skip('✅ [Кейс 1.1] Успешная генерация (kling-v1.6-pro)', async () => {}) // Add test logic
  it.skip('✅ [Кейс 1.1] Успешная генерация (haiper-video-2)', async () => {}) // Add test logic
  it.skip('✅ [Кейс 1.1] Успешная генерация (ray-v2)', async () => {}) // Add test logic
  it.skip('✅ [Кейс 1.1] Успешная генерация (wan-image-to-video)', async () => {}) // Add test logic
  it.skip('✅ [Кейс 1.1] Успешная генерация (minimax)', async () => {}) // Add test logic

  // --- Тесты ошибок --- (Исправлены)
  it('✅ [Кейс 1.2] Обработка недостатка средств', async () => {
    const videoModel = 'stable-video-diffusion'
    mockedHelpers.processBalanceVideoOperationHelper.mockResolvedValueOnce({
      success: false,
      error: 'Insufficient funds. Top up your balance using the /buy command.',
      newBalance: 0,
      paymentAmount: 0,
      modePrice: 0,
    })

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      imageUrl,
      prompt,
      false, // isMorphing
      null, // imageAUrl
      null, // imageBUrl,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining('Insufficient funds')
    )
    expect(getUserByTelegramIdSpy).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
    expect(mockedHelpers.saveVideoUrlHelper).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.3] Обработка ошибки API Replicate', async () => {
    const videoModel = 'stable-video-diffusion'
    const replicateError = new Error('Replicate API failed')

    replicateRunSpy.mockRejectedValueOnce(replicateError)

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      imageUrl,
      prompt,
      false, // isMorphing
      null, // imageAUrl
      null, // imageBUrl
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      is_ru
        ? `❌ Ошибка генерации: Replicate API failed`
        : `❌ Video generation error: Replicate API failed`
    )
    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
    expect(mockedHelpers.saveVideoUrlHelper).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.4] Обработка ошибки сохранения в БД', async () => {
    const videoModel = 'stable-video-diffusion'
    const saveDbError = new Error('Supabase save failed')
    const fakeVideoUrl = 'http://replicate.com/test_video.mp4'

    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    mockedHelpers.downloadFileHelper.mockResolvedValueOnce(
      Buffer.from('fake video data')
    )
    mockedHelpers.saveVideoUrlHelper.mockRejectedValueOnce(saveDbError)

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      imageUrl,
      prompt,
      false, // isMorphing
      null, // imageAUrl
      null, // imageBUrl
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      is_ru
        ? `❌ Ошибка генерации: Supabase save failed`
        : `❌ Video generation error: Supabase save failed`
    )
    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.downloadFileHelper).toHaveBeenCalledWith(fakeVideoUrl)
    expect(mockedHelpers.saveVideoUrlHelper).toHaveBeenCalledTimes(1)
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.5] Обработка отсутствия imageUrl', async () => {
    const videoModel = 'stable-video-diffusion'

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      null,
      prompt,
      false,
      null,
      null,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining(
        '❌ Ошибка: Изображение и промпт обязательны для стандартного режима.'
      )
    )
    expect(getUserByTelegramIdSpy).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.6] Обработка отсутствия prompt', async () => {
    const videoModel = 'stable-video-diffusion'

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      imageUrl,
      null,
      false,
      null,
      null,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining(
        '❌ Ошибка: Изображение и промпт обязательны для стандартного режима.'
      )
    )
    expect(getUserByTelegramIdSpy).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.7] Обработка невалидной videoModel (через конфиг)', async () => {
    const videoModel = 'invalid-model-key'

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      videoModel,
      imageUrl,
      prompt,
      false,
      null,
      null,
      ctx.telegram,
      Number(telegram_id)
    )

    expect(mockSendMessage).toHaveBeenCalledWith(
      Number(telegram_id),
      expect.stringContaining(`Configuration for model ${videoModel} not found`)
    )
    expect(getUserByTelegramIdSpy).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
  })
})
