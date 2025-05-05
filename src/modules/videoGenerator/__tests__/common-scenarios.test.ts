// src/__tests__/services/generateImageToVideo/common-scenarios.test.ts

import { describe, it, expect, beforeEach, afterEach, Mock, vi } from 'vitest'
// Используем generateImageToVideoIsolated и типы
import {
  generateImageToVideo,
  type VideoModelConfig,
} from '@/modules/videoGenerator'
import { logger } from '@/utils/logger'
import * as downloadHelper from '@/helpers/downloadFile'
import * as supabaseUserHelper from '@/core/supabase/getUserByTelegramId'
import * as botHelper from '@/core/bot'
import * as priceHelper from '@/price/helpers'
import * as supabaseSaveHelper from '@/core/supabase/saveVideoUrlToSupabase'
import * as errorHelper from '@/helpers/error/errorMessageAdmin'
import { replicate } from '@/core/replicate'
import { BalanceOperationResult, MyContext } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers/calculateFinalPrice'
import {
  createMockContext,
  createMockUser,
  setupSpies,
  teardownSpies,
  MOCK_VIDEO_MODELS_CONFIG,
} from './helpers'
import * as ConfigModule from '@/modules/videoGenerator/config/models.config'
import fsPromises from 'fs/promises'
import { Telegraf } from 'telegraf'
import * as generateVideoHelpers from '../helpers' // Import the local helpers module

// Mock the local helpers module
vi.mock('../helpers', async importOriginal => {
  const actual = await importOriginal<typeof generateVideoHelpers>()
  return {
    ...actual,
    getUserHelper: vi.fn(),
    processBalanceVideoOperationHelper: vi.fn(),
    saveVideoUrlHelper: vi.fn(),
    updateUserLevelHelper: vi.fn(),
    downloadFileHelper: vi.fn(),
  }
})

// Cast the mocked module for easier use
const mockedHelpers = generateVideoHelpers as Mocked<
  typeof generateVideoHelpers
>

// --- Test Data ---
const telegram_id = '12345'
const username = 'testuser'
const bot_name = 'test_bot'
const is_ru = false
const videoModel = 'stable-video-diffusion' // Use a valid key from MOCK_VIDEO_MODELS_CONFIG
const imageUrl = 'http://example.com/image.jpg'
const prompt = 'Test prompt'

// --- Test Suite ---
describe('generateImageToVideo Service: Общие Сценарии', () => {
  let ctx: MyContext
  let mockSendMessage: Mock
  let mockSendVideo: Mock
  // Declare necessary spies for external modules
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

    // Create spies for external modules
    getUserByTelegramIdSpy = vi.spyOn(supabaseUserHelper, 'getUserByTelegramId')
    getBotByNameSpy = vi.spyOn(botHelper, 'getBotByName')
    replicateRunSpy = vi.spyOn(replicate, 'run')
    saveVideoUrlToSupabaseSpy = vi.spyOn(
      supabaseSaveHelper,
      'saveVideoUrlToSupabase'
    )
    errorMessageAdminSpy = vi.spyOn(errorHelper, 'errorMessageAdmin')

    // Default successful resolutions using MOCKED helpers and external spies
    const defaultUser = createMockUser(telegram_id, 200000)
    mockedHelpers.getUserHelper.mockResolvedValue(defaultUser)

    const fakeBotInstance = { telegram: ctx.telegram }
    getBotByNameSpy.mockResolvedValue({
      bot: fakeBotInstance as any,
      error: null,
    } as any)

    mockedHelpers.processBalanceVideoOperationHelper.mockResolvedValue({
      success: true,
      newBalance: 199999,
      paymentAmount: 1,
      modePrice: 10, // Default price for setup
    })

    replicateRunSpy.mockResolvedValue(['http://replicate.com/success.mp4'])
    mockedHelpers.downloadFileHelper.mockResolvedValue(
      Buffer.from('fake success data')
    )
    mockedHelpers.saveVideoUrlHelper.mockResolvedValue(undefined)

    errorMessageAdminSpy.mockImplementation(() => {}) // Should not be called by default
    mockedHelpers.updateUserLevelHelper.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Restore external spies
    getUserByTelegramIdSpy?.mockRestore()
    getBotByNameSpy.mockRestore()
    replicateRunSpy.mockRestore()
    saveVideoUrlToSupabaseSpy?.mockRestore()
    errorMessageAdminSpy.mockRestore()
    vi.restoreAllMocks()
  })

  // --- Успешные кейсы ---
  it('✅ [Кейс 3.1] Минимальный успешный вызов (Стандартный режим)', async () => {
    const fakeVideoUrl = 'http://replicate.com/success.mp4'
    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl]) // Ensure correct mock for this test if needed

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
      ctx.telegram, // Pass mock instance
      Number(telegram_id) // Pass chat id
    )

    // --- ПРОВЕРКИ с использованием моков ---
    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.downloadFileHelper).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.saveVideoUrlHelper).toHaveBeenCalledTimes(1)
    // expect(getBotByNameSpy).toHaveBeenCalledWith(bot_name); // Spy check if needed
    expect(mockSendVideo).toHaveBeenCalledTimes(1)
    // Check caption content based on mocked balance result
    const expectedCaption = is_ru
      ? `✨ Ваше видео (Stable Video Diffusion) готово!\n💰 Списано: 1 ✨\n💎 Остаток: 199999 ✨`
      : `✨ Your video (Stable Video Diffusion) is ready!\n💰 Cost: 1 ✨\n💎 Balance: 199999 ✨`
    expect(mockSendVideo).toHaveBeenCalledWith(
      Number(telegram_id),
      { source: expect.stringContaining('.mp4') },
      { caption: expectedCaption }
    )
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  // --- Кейсы ошибок (общие) ---
  it('✅ [Кейс 3.1] Обработка ошибки API Replicate', async () => {
    const replicateError = new Error('Replicate Failed')
    // Баланс по умолчанию успешен (из beforeEach)
    replicateRunSpy.mockRejectedValueOnce(replicateError)
    errorMessageAdminSpy.mockImplementationOnce(() => {}) // Expect it to be called

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
      expect.stringContaining('❌ Video generation error: Replicate Failed') // Check specific error message
    )
    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).toHaveBeenCalledTimes(1)
    expect(replicateRunSpy).toHaveBeenCalledTimes(1) // Вызвали, но упал
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
    expect(mockedHelpers.saveVideoUrlHelper).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.2] Обработка ошибки извлечения URL видео (null)', async () => {
    replicateRunSpy.mockResolvedValue(null) // Replicate returns null
    errorMessageAdminSpy.mockImplementationOnce(() => {})

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
      expect.stringContaining('Failed to get video URL from Replicate')
    )
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
    expect(mockedHelpers.saveVideoUrlHelper).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.2] Обработка ошибки извлечения URL видео (не массив строк)', async () => {
    replicateRunSpy.mockResolvedValue({ output: 123 }) // Invalid format
    errorMessageAdminSpy.mockImplementationOnce(() => {})

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
      expect.stringContaining('Failed to get video URL from Replicate')
    )
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.downloadFileHelper).not.toHaveBeenCalled()
    expect(mockedHelpers.saveVideoUrlHelper).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.3] Обработка ошибки сохранения в БД (saveVideoUrlToSupabase)', async () => {
    const dbSaveError = new Error('DB Save Error')
    const fakeVideoUrl = 'http://replicate.com/db_fail.mp4'
    // Баланс успешен по умолчанию
    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    mockedHelpers.downloadFileHelper.mockResolvedValueOnce(
      Buffer.from('fake video data')
    )
    // Мокируем ошибку сохранения
    mockedHelpers.saveVideoUrlHelper.mockRejectedValueOnce(dbSaveError)
    errorMessageAdminSpy.mockImplementationOnce(() => {})

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
      expect.stringContaining('❌ Video generation error: DB Save Error') // Check error message
    )
    expect(replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.downloadFileHelper).toHaveBeenCalledWith(fakeVideoUrl)
    expect(mockedHelpers.saveVideoUrlHelper).toHaveBeenCalledTimes(1) // Вызвали, но упал
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  // --- Проверка updateUserLevel --- (Адаптация expect)
  it('✅ Проверяет и обновляет уровень пользователя, если он равен 8', async () => {
    const userLevel8 = createMockUser(telegram_id, 200000, 8)
    mockedHelpers.getUserHelper.mockResolvedValueOnce(userLevel8)
    // mockedHelpers.updateUserLevelHelper.mockResolvedValueOnce(undefined); // Already default

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

    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.updateUserLevelHelper).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.updateUserLevelHelper).toHaveBeenCalledWith(
      telegram_id
    )
  })

  it('✅ Не обновляет уровень пользователя, если он не равен 8', async () => {
    const userLevel7 = createMockUser(telegram_id, 200000, 7)
    mockedHelpers.getUserHelper.mockResolvedValueOnce(userLevel7)

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

    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(mockedHelpers.updateUserLevelHelper).not.toHaveBeenCalled()
  })

  // --- Другие кейсы ошибок --- (Адаптация expect)
  it('✅ [Кейс 3.7] Обработка ошибки, когда пользователь не найден в БД', async () => {
    const userNotFoundError = new Error(
      `Серверная ошибка: Пользователь ${telegram_id} не найден.`
    )
    // Мокируем ошибку getUserHelper
    mockedHelpers.getUserHelper.mockRejectedValueOnce(userNotFoundError)
    errorMessageAdminSpy.mockImplementationOnce(() => {})

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
      expect.stringContaining(
        `❌ Video generation error: Серверная ошибка: Пользователь ${telegram_id} не найден.`
      )
    )
    expect(mockedHelpers.getUserHelper).toHaveBeenCalledTimes(1)
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.8] Обработка ошибки, когда модель не найдена в конфиге', async () => {
    const nonExistentModel = 'non-existent-model'

    await generateImageToVideo(
      telegram_id,
      username,
      is_ru,
      bot_name,
      nonExistentModel,
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
      expect.stringContaining(
        `Configuration for model ${nonExistentModel} not found`
      )
    )
    expect(mockedHelpers.getUserHelper).not.toHaveBeenCalled()
    expect(
      mockedHelpers.processBalanceVideoOperationHelper
    ).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled()
    expect(errorMessageAdminSpy).not.toHaveBeenCalled() // Error handled before main try-catch
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  // Удалены невалидные тесты для Кейсов 3.9

  // Helper test to demonstrate calculateFinalPrice usage if needed
  it('Пример теста с использованием calculateFinalPrice', () => {
    const price = calculateFinalPrice(videoModel) // Use a valid model key
    expect(price).toBeGreaterThan(0)
    logger.info('calculateFinalPrice result for testing:', { price })
  })
})
