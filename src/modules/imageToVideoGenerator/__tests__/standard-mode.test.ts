// src/__tests__/services/generateImageToVideo/standard-mode.test.ts

import { generateImageToVideo } from '@/modules/imageToVideoGenerator'
import { logger } from '@/utils/logger'
import * as downloadHelper from '@/helpers/downloadFile'
import * as supabaseUserHelper from '@/core/supabase/getUserByTelegramId'
import * as botHelper from '@/core/bot'
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
import * as ConfigModule from '@/price/models/VIDEO_MODELS_CONFIG'
import { describe, it, expect, beforeEach, afterEach, Mock, vi } from 'vitest'

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
type SpiesType = ReturnType<typeof setupSpies>

let spies: SpiesType // <-- Используем локальный тип
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
  beforeEach(() => {
    // +++ МОКИРУЕМ КОНФИГ ЧЕРЕЗ spyOn +++
    vi.spyOn(ConfigModule, 'VIDEO_MODELS_CONFIG', 'get').mockReturnValue(
      MOCK_VIDEO_MODELS_CONFIG
    )
    // +++ КОНЕЦ МОКИРОВАНИЯ +++

    spies = setupSpies()
    const {
      ctx: mockCtx,
      mockSendMessage: msgSpy,
      mockSendVideo: vidSpy,
    } = createMockContext(telegram_id)
    ctx = mockCtx
    mockSendMessage = msgSpy
    mockSendVideo = vidSpy

    // --- НАСТРАИВАЕМ ШПИОНОВ FS ---
    spies.mkdirSpy.mockResolvedValue(undefined)
    spies.writeFileSpy.mockResolvedValue(undefined)

    // Default successful resolutions
    spies.getUserByTelegramIdSpy.mockResolvedValue(createMockUser(telegram_id))
    const fakeBotInstanceStandard = {
      telegram: ctx.telegram,
    }
    spies.getBotByNameSpy.mockResolvedValue({
      bot: fakeBotInstanceStandard as any,
      error: null,
    } as any)
    spies.processBalanceSpy.mockResolvedValue({
      success: true,
      newBalance: 99,
      paymentAmount: 1,
      modePrice: 1,
    })
    spies.replicateRunSpy.mockResolvedValue([
      'http://replicate.com/default.mp4',
    ])
    spies.downloadFileSpy.mockResolvedValue(Buffer.from('fake video data'))
    spies.saveVideoUrlToSupabaseSpy.mockResolvedValue(undefined)
    spies.errorMessageAdminSpy.mockImplementation(
      () => LoggerUtils.logger as any
    )
  })

  afterEach(() => {
    teardownSpies(spies)
    vi.clearAllMocks()
  })

  // --- Тесты для стандартного режима ---
  it.skip('✅ [Кейс 1.1] Успешная генерация (stable-video-diffusion)', async () => {
    const videoModel = 'stable-video-diffusion'
    const fakeVideoUrl = 'http://replicate.com/svd_video.mp4'
    spies.replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    spies.downloadFileSpy.mockResolvedValueOnce(
      Buffer.from('specific fake data')
    )

    await generateImageToVideo(
      ctx,
      imageUrl,
      prompt,
      videoModel,
      telegram_id,
      username,
      is_ru,
      bot_name,
      false
    )

    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledTimes(1)
    expect(spies.processBalanceSpy).toHaveBeenCalledTimes(1)
    expect(spies.replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(spies.downloadFileSpy).toHaveBeenCalledWith(fakeVideoUrl)
    expect(spies.saveVideoUrlToSupabaseSpy).toHaveBeenCalledWith(
      Number(telegram_id),
      fakeVideoUrl,
      expect.stringMatching(/uploads\/\d+\/image-to-video\/.+\.mp4$/),
      videoModel
    )
    expect(spies.getBotByNameSpy).toHaveBeenCalledWith(bot_name)
    expect(mockSendVideo).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledTimes(1) // Balance message
    expect(spies.errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(spies.mkdirSpy).toHaveBeenCalled()
    expect(spies.writeFileSpy).toHaveBeenCalled()
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
    const balanceError = new Error('Недостаточно средств')
    spies.processBalanceSpy.mockRejectedValueOnce(balanceError)
    spies.errorMessageAdminSpy.mockClear()

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(balanceError)

    expect(spies.processBalanceSpy).toHaveBeenCalledTimes(1)
    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledTimes(1)
    expect(spies.replicateRunSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledTimes(1)
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, balanceError)
    expect(spies.downloadFileSpy).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.3] Обработка ошибки API Replicate', async () => {
    const videoModel = 'stable-video-diffusion'
    const replicateError = new Error('Replicate API failed')
    spies.replicateRunSpy.mockRejectedValueOnce(replicateError)
    spies.errorMessageAdminSpy.mockClear()

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(replicateError)

    expect(spies.processBalanceSpy).toHaveBeenCalledTimes(1)
    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledTimes(1)
    expect(spies.replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, replicateError)
    expect(spies.downloadFileSpy).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.4] Обработка ошибки сохранения в БД', async () => {
    const videoModel = 'stable-video-diffusion'
    const dbError = new Error('Supabase save failed')
    const fakeVideoUrl = 'http://replicate.com/db_error_video.mp4'
    spies.replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    spies.downloadFileSpy.mockResolvedValueOnce(Buffer.from('db fake data'))
    spies.saveVideoUrlToSupabaseSpy.mockRejectedValueOnce(dbError)
    spies.errorMessageAdminSpy.mockClear()

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(dbError)

    expect(spies.processBalanceSpy).toHaveBeenCalledTimes(1)
    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledTimes(1)
    expect(spies.replicateRunSpy).toHaveBeenCalledTimes(1)
    expect(spies.downloadFileSpy).toHaveBeenCalledWith(fakeVideoUrl)
    expect(spies.saveVideoUrlToSupabaseSpy).toHaveBeenCalledTimes(1)
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, dbError)
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.5] Обработка отсутствия imageUrl', async () => {
    const videoModel = 'stable-video-diffusion'
    const expectedError =
      'Серверная ошибка: imageUrl обязателен для стандартного режима'
    spies.errorMessageAdminSpy.mockClear()

    await expect(
      generateImageToVideo(
        ctx,
        null, // <-- null imageUrl
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(expectedError)

    expect(spies.processBalanceSpy).not.toHaveBeenCalled()
    expect(spies.replicateRunSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.6] Обработка отсутствия prompt', async () => {
    const videoModel = 'stable-video-diffusion'
    const expectedError =
      'Серверная ошибка: prompt обязателен для стандартного режима'
    spies.errorMessageAdminSpy.mockClear()

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        null, // <-- null prompt
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(expectedError)

    expect(spies.processBalanceSpy).not.toHaveBeenCalled()
    expect(spies.replicateRunSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 1.7] Обработка невалидной videoModel', async () => {
    const invalidModel = 'invalid-model-key'
    const expectedError = `Серверная ошибка: Конфигурация для модели ${invalidModel} не найдена.`
    spies.errorMessageAdminSpy.mockClear()

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        invalidModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(expectedError)

    expect(spies.processBalanceSpy).not.toHaveBeenCalled()
    expect(spies.replicateRunSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).not.toHaveBeenCalled()
  })
})
