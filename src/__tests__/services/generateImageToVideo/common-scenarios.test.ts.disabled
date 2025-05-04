// src/__tests__/services/generateImageToVideo/common-scenarios.test.ts

import { describe, it, expect, beforeEach, afterEach, Mock, vi } from 'vitest'
import { generateImageToVideo } from '@/services/plan_b/generateImageToVideo'
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
import {
  createMockContext,
  createMockUser,
  setupSpies,
  teardownSpies,
  MOCK_VIDEO_MODELS_CONFIG,
} from './helpers'
import * as ConfigModule from '@/price/models/VIDEO_MODELS_CONFIG'

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
const videoModel = 'stable-video-diffusion' // Use a valid key from MOCK_VIDEO_MODELS_CONFIG
const imageUrl = 'http://example.com/image.jpg'
const prompt = 'Test prompt'

// --- Test Suite ---
describe('generateImageToVideo Service: Общие Сценарии', () => {
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
    } = createMockContext(String(telegram_id))
    ctx = mockCtx
    mockSendMessage = msgSpy
    mockSendVideo = vidSpy

    // Default successful resolutions for spies
    spies.getUserByTelegramIdSpy.mockResolvedValue(createMockUser(telegram_id))
    spies.getBotByNameSpy.mockResolvedValue({ bot: ctx.telegram } as any)
    spies.processBalanceSpy.mockResolvedValue({
      success: true,
      newBalance: 99,
      paymentAmount: 1,
      modePrice: 10,
    })
    spies.replicateRunSpy.mockResolvedValue([
      'http://replicate.com/default.mp4',
    ])
    spies.downloadFileSpy.mockResolvedValue(Buffer.from('fake video data'))
    spies.saveVideoUrlToSupabaseSpy.mockResolvedValue(undefined)
    spies.errorMessageAdminSpy.mockImplementation(() => {})
  })

  afterEach(() => {
    teardownSpies(spies)
    vi.restoreAllMocks()
  })

  // --- Успешные кейсы (упрощенные, основная логика в standard/morphing) ---
  it('✅ [Кейс 3.1] Минимальный успешный вызов (Стандартный режим)', async () => {
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

    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledWith(ctx)
    expect(spies.processBalanceSpy).toHaveBeenCalledOnce()
    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).toHaveBeenCalledOnce()
    expect(spies.saveVideoUrlToSupabaseSpy).toHaveBeenCalledOnce()
    expect(spies.getBotByNameSpy).toHaveBeenCalledWith(bot_name)
    expect(mockSendVideo).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledOnce() // Balance message
    expect(spies.errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  // --- Кейсы ошибок (общие) ---
  it('✅ [Кейс 3.1] Обработка ошибки API Replicate', async () => {
    const replicateError = new Error('Replicate Failed')
    spies.replicateRunSpy.mockRejectedValueOnce(replicateError) // Use spy
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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

    // Check calls before the error
    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledWith(ctx) // Should be called
    expect(spies.processBalanceSpy).toHaveBeenCalledOnce()
    // Check calls after the error
    expect(spies.replicateRunSpy).toHaveBeenCalledOnce() // Use spy
    expect(spies.downloadFileSpy).not.toHaveBeenCalled()
    expect(spies.saveVideoUrlToSupabaseSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce() // Check spy
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, replicateError) // Check spy args
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.2] Обработка ошибки извлечения URL видео (null)', async () => {
    spies.replicateRunSpy.mockResolvedValue(null) // Replicate returns null
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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
      // UPDATE: Check for the actual error message
    ).rejects.toThrow(
      'Server Error: Failed to extract video URL from Replicate response'
    )

    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).not.toHaveBeenCalled()
    expect(spies.saveVideoUrlToSupabaseSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce() // Error should be caught and reported
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.2] Обработка ошибки извлечения URL видео (не массив строк)', async () => {
    spies.replicateRunSpy.mockResolvedValue({ output: 123 }) // Invalid format
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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
      // UPDATE: Check for the actual error message
    ).rejects.toThrow(
      'Server Error: Failed to extract video URL from Replicate response'
    )

    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).not.toHaveBeenCalled()
    expect(spies.saveVideoUrlToSupabaseSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce() // Error should be caught and reported
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.3] Обработка ошибки сохранения в БД (saveVideoUrlToSupabase)', async () => {
    const dbSaveError = new Error('DB Save Error')
    const fakeVideoUrl = 'http://replicate.com/db_fail.mp4'
    spies.replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    // Ensure download works for this test case
    spies.downloadFileSpy.mockResolvedValueOnce(Buffer.from('fake video data'))
    spies.saveVideoUrlToSupabaseSpy.mockRejectedValueOnce(dbSaveError)
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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
    ).rejects.toThrow(dbSaveError)

    // Check calls before the error
    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).toHaveBeenCalledWith(fakeVideoUrl)
    // Check calls after the error
    expect(spies.saveVideoUrlToSupabaseSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, dbSaveError)
    expect(mockSendVideo).not.toHaveBeenCalled() // Should not send video if DB save fails
    expect(mockSendMessage).not.toHaveBeenCalled() // Should not send balance msg
  })

  it('✅ [Кейс 3.4] Проверка вызова errorMessageAdmin при ошибке скачивания файла', async () => {
    const fakeVideoUrl = 'http://replicate.com/video_fail.mp4'
    const downloadError = new Error('Download Failed')
    spies.replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    spies.downloadFileSpy.mockRejectedValue(downloadError) // Error here
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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
    ).rejects.toThrow(downloadError)

    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).toHaveBeenCalledWith(fakeVideoUrl)
    expect(spies.saveVideoUrlToSupabaseSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, downloadError)
    expect(spies.processBalanceSpy).toHaveBeenCalledOnce()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.4] Проверка вызова errorMessageAdmin при ошибке создания директории', async () => {
    const fakeVideoUrl = 'http://replicate.com/video_mkdir_fail.mp4'
    const mkdirError = new Error('Mkdir Failed')
    spies.replicateRunSpy.mockResolvedValue([fakeVideoUrl])
    spies.downloadFileSpy.mockResolvedValue(Buffer.from('fake data')) // Download OK
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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
    ).rejects.toThrow(mkdirError)

    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).toHaveBeenCalledWith(fakeVideoUrl)
    expect(spies.saveVideoUrlToSupabaseSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, mkdirError)
    expect(spies.processBalanceSpy).toHaveBeenCalledOnce()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.4] Проверка вызова errorMessageAdmin при ошибке записи файла', async () => {
    const fakeVideoUrl = 'http://replicate.com/video_write_fail.mp4'
    const writeError = new Error('Write Failed')
    spies.replicateRunSpy.mockResolvedValue([fakeVideoUrl])
    spies.downloadFileSpy.mockResolvedValue(Buffer.from('fake data')) // Download OK
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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
    ).rejects.toThrow(writeError)

    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).toHaveBeenCalledWith(fakeVideoUrl)
    expect(spies.saveVideoUrlToSupabaseSpy).not.toHaveBeenCalled()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, writeError)
    expect(spies.processBalanceSpy).toHaveBeenCalledOnce()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it.todo(
    '✏️ [Кейс 3.4] Проверка вызова errorMessageAdmin при других внутренних ошибках'
  )

  // --- Проверка отправки в Pulse --- ✏️
  // TODO: Requires mocking the pulse helper if/when integrated
  it.skip('✅ [Кейс 3.5] Проверка корректности данных при отправке в Pulse (стандарт)', async () => {
    // ... setup for standard success case ...
    // Add mock for pulse helper
    // Act
    // Assert pulse was called with correct args
  })

  it.skip('✅ [Кейс 3.5] Проверка корректности данных при отправке в Pulse (морфинг)', async () => {
    // ... setup for morphing success case ...
    // Add mock for pulse helper
    // Act
    // Assert pulse was called with correct args
  })

  // --- Проверка корректности списания и отображения остатка --- ✏️
  it('✅ [Кейс 3.6] Проверка корректности списания и отображения остатка', async () => {
    const initialBalance = 100000 // Используем большой баланс
    const modelPrice = calculateFinalPrice(videoModel)
    const expectedNewBalance = initialBalance - modelPrice
    const fakeVideoUrl = 'http://replicate.com/final_check.mp4'

    spies.getUserByTelegramIdSpy.mockResolvedValue(
      createMockUser(telegram_id, initialBalance)
    )

    // ---> ПЕРЕОПРЕДЕЛЯЕМ МОК БАЛАНСА для этого теста <---
    const mockBalanceResultSuccess: BalanceOperationResult = {
      success: true,
      newBalance: expectedNewBalance,
      modePrice: modelPrice,
      paymentAmount: modelPrice,
      currentBalance: initialBalance,
      error: undefined,
    }
    spies.processBalanceSpy.mockResolvedValueOnce(
      // Once - важно для этого теста
      mockBalanceResultSuccess
    )

    spies.replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl])
    // Ensure download works for this test case
    spies.downloadFileSpy.mockResolvedValueOnce(Buffer.from('fake video data'))
    spies.saveVideoUrlToSupabaseSpy.mockResolvedValue(undefined)
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

    await generateImageToVideo(
      ctx,
      imageUrl,
      prompt,
      videoModel,
      telegram_id,
      username,
      true, // is_ru = true для проверки сообщения
      bot_name,
      false
    )

    expect(spies.processBalanceSpy).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledOnce()
    const messageArgs = mockSendMessage.mock.calls[0]
    expect(messageArgs[0]).toBe(telegram_id)
    const messageText = messageArgs[1]
    const { modePrice: resultModePrice, newBalance: resultNewBalance } =
      mockBalanceResultSuccess
    expect(messageText).toContain(
      `Стоимость: ${resultModePrice.toFixed(2)} ⭐️`
    )
    expect(messageText).toContain(
      `Ваш новый баланс: ${resultNewBalance.toFixed(2)} ⭐️`
    )
    expect(mockSendVideo).toHaveBeenCalledTimes(1)
    expect(spies.saveVideoUrlToSupabaseSpy).toHaveBeenCalledWith(
      Number(telegram_id), // Используем Number() для приведения типа
      fakeVideoUrl,
      // Убираем лишнее экранирование
      expect.stringMatching(/uploads\/\d+\/image-to-video\/.+\.mp4$/),
      videoModel // Check the model ID (string) is passed
    )
    expect(spies.errorMessageAdminSpy).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.7] Обработка ошибки, когда пользователь не найден в БД', async () => {
    const userNotFoundError = new Error(
      `Серверная ошибка: Пользователь ${telegram_id} не найден.`
    )
    // Ensure the mock rejects with the specific error
    spies.getUserByTelegramIdSpy.mockRejectedValue(userNotFoundError)
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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
    ).rejects.toThrow(userNotFoundError) // Check for the specific error

    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledWith(ctx)
    expect(spies.processBalanceSpy).not.toHaveBeenCalled()
    expect(spies.replicateRunSpy).not.toHaveBeenCalled()
    expect(spies.downloadFileSpy).not.toHaveBeenCalled() // Should not be called
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(
      ctx,
      userNotFoundError
    )
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.8] Обработка ошибки, когда модель не найдена в конфиге', async () => {
    const nonExistentModel = 'non-existent-model'
    const expectedError = `Серверная ошибка: Конфигурация для модели ${nonExistentModel} не найдена.`
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

    // No need to mock getUserByTelegramId etc., as the error should happen before them

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        nonExistentModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(expectedError)

    // Check that subsequent functions were NOT called
    expect(spies.getUserByTelegramIdSpy).not.toHaveBeenCalled()
    expect(spies.processBalanceSpy).not.toHaveBeenCalled()
    expect(spies.replicateRunSpy).not.toHaveBeenCalled()
    // errorMessageAdmin is NOT called here because the error is thrown *before* the main try-catch
    expect(spies.errorMessageAdminSpy).not.toHaveBeenCalled()
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.9] Обработка ошибки, когда у модели нет цены (basePrice)', async () => {
    const modelWithoutPrice = 'model-no-price'
    const expectedError = new Error(
      `Серверная ошибка: Отсутствует basePrice в конфигурации для модели ${modelWithoutPrice}`
    )
    // Mock processBalance to throw the specific error we expect
    spies.processBalanceSpy.mockRejectedValue(expectedError)
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        modelWithoutPrice,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(expectedError) // Check for the specific error

    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledWith(ctx)
    expect(spies.processBalanceSpy).toHaveBeenCalledOnce() // It was called and threw
    expect(spies.replicateRunSpy).not.toHaveBeenCalled()
    expect(spies.downloadFileSpy).not.toHaveBeenCalled() // Should not be called
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, expectedError)
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  it('✅ [Кейс 3.9] Обработка ошибки, когда бот не найден', async () => {
    const nonExistentBot = 'non-existent-bot'
    const expectedError = new Error(
      `Bot instance or bot object not found for name: ${nonExistentBot}`
    )
    spies.getBotByNameSpy.mockRejectedValue(expectedError) // Make the spy reject
    spies.errorMessageAdminSpy.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()
    // Ensure download succeeds to reach the bot check
    spies.downloadFileSpy.mockResolvedValue(Buffer.from('fake data'))

    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru,
        nonExistentBot,
        false
      )
    ).rejects.toThrow(expectedError)

    // Check calls up to the point of failure
    expect(spies.getUserByTelegramIdSpy).toHaveBeenCalledOnce()
    expect(spies.processBalanceSpy).toHaveBeenCalledOnce()
    expect(spies.replicateRunSpy).toHaveBeenCalledOnce()
    expect(spies.downloadFileSpy).toHaveBeenCalledOnce()
    expect(spies.saveVideoUrlToSupabaseSpy).toHaveBeenCalledOnce()
    expect(spies.getBotByNameSpy).toHaveBeenCalledWith(nonExistentBot)
    // Check calls after the failure
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledOnce()
    expect(spies.errorMessageAdminSpy).toHaveBeenCalledWith(ctx, expectedError)
    expect(mockSendVideo).not.toHaveBeenCalled()
  })

  // Helper test to demonstrate calculateFinalPrice usage if needed
  it('Пример теста с использованием calculateFinalPrice', () => {
    const price = calculateFinalPrice(videoModel) // Use a valid model key
    expect(price).toBeGreaterThan(0)
    logger.info('calculateFinalPrice result for testing:', { price })
  })
})
