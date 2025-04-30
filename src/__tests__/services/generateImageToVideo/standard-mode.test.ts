// src/__tests__/services/generateImageToVideo/standard-mode.test.ts

import { describe, it, expect, beforeEach, afterEach, vi, Mocked } from 'vitest'
import { generateImageToVideo } from '@/services/plan_b/generateImageToVideo'
import type { MyContext, BalanceOperationResult } from '@/interfaces'
import { calculateFinalPrice } from '@/price/helpers'
import { Mock } from 'vitest' // Import Mock type
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
// Импортируем реальные функции для шпионажа
import * as PriceHelpers from '@/price/helpers'
import * as UserBalanceModule from '@/core/supabase/getUserBalance' // <--- Импортируем модуль для getUserBalance
import * as ReplicateClient from '@/core/replicate' // <--- Импортируем для spyOn

// Import helpers and types from the new helper file
import {
  setupMocks,
  createMockContext,
  createMockUser,
  MockedDependencies,
  MockContextResult, // Import the new return type
} from './helpers'
import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'

// +++ ГЛОБАЛЬНЫЙ МОК МОДЕЛЕЙ ДЛЯ ЭТОГО ТЕСТА +++
vi.mock('@/price/models/VIDEO_MODELS_CONFIG', () => ({
  VIDEO_MODELS_CONFIG: {
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
      canMorph: false,
    },
    'kling-v1.6-pro': {
      id: 'kling-v1.6-pro',
      title: 'Kling v1.6 Pro',
      inputType: ['image', 'text'],
      description: 'Mock Kling',
      basePrice: 45,
      api: {
        model: 'aliyun/video-kling-v1:kling-v1.6-pro',
        input: { aspect_ratio: '16:9' },
      },
      imageKey: 'image',
      canMorph: true,
    },
    minimax: {
      id: 'minimax',
      title: 'Minimax',
      inputType: ['image', 'text'],
      description: 'Mock Minimax',
      basePrice: 25,
      api: { model: 'minimax-video:latest', input: {} },
      imageKey: 'image',
      canMorph: false,
    },
    'wan-text-to-video': {
      id: 'wan-text-to-video',
      title: 'Wan Text-to-Video',
      inputType: ['text'],
      description: 'Mock Wan TTV',
      basePrice: 20,
      api: { model: 'wan-ttv:latest', input: {} },
      canMorph: false,
    },
  },
}))
// +++ КОНЕЦ ГЛОБАЛЬНОГО МОКА +++

describe('generateImageToVideo Service: Стандартный Режим (Image + Prompt -> Video)', () => {
  let mocks: MockedDependencies
  let ctx: MyContext
  let mockSendMessage: Mock // Declare mock function variable
  let mockSendVideo: Mock // Declare mock function variable
  let processBalanceSpy
  let getUserBalanceSpy
  let replicateRunSpy // <--- Добавляем шпиона для replicate.run

  const telegram_id = '12345'
  const username = 'testuser'
  const is_ru = false
  const bot_name = 'test_bot'
  const prompt = 'A dancing robot'
  const imageUrl = 'https://example.com/image.jpg' // Валидный URL
  const videoModel = 'stable-video-diffusion' // <--- Используем эту модель по умолчанию

  beforeEach(async () => {
    // Устанавливаем шпионов
    processBalanceSpy = vi.spyOn(
      PriceHelpers as any,
      'processBalanceVideoOperation'
    )
    getUserBalanceSpy = vi.spyOn(UserBalanceModule, 'getUserBalance') // <--- Используем правильный модуль
    replicateRunSpy = vi.spyOn(ReplicateClient.replicate, 'run') // <--- Устанавливаем шпиона

    mocks = await setupMocks()
    const modelConfig = VIDEO_MODELS_CONFIG[videoModel]
    if (!modelConfig) {
      throw new Error(
        `Test setup error: Model ${videoModel} not found in mock config after setupMocks`
      )
    }
    const contextResult: MockContextResult = createMockContext(
      telegram_id,
      username,
      bot_name
    )
    ctx = contextResult.ctx
    mockSendMessage = contextResult.mockSendMessage
    mockSendVideo = contextResult.mockSendVideo

    // ---> УСТАНАВЛИВАЕМ ДЕФОЛТНОЕ ПОВЕДЕНИЕ ДЛЯ ШПИОНОВ В beforeEach < ---
    // Set default user found
    const defaultUser = createMockUser(telegram_id, 100000)
    getUserBalanceSpy.mockResolvedValue(defaultUser.balance) // Мок getUserBalance через шпиона
    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(defaultUser) // Для других частей кода

    // Set default successful balance operation result
    const defaultModePrice = modelConfig.basePrice || 30
    const defaultInitialBalance = defaultUser.balance
    const mockBalanceResultSuccess: BalanceOperationResult = {
      success: true,
      newBalance: defaultInitialBalance - defaultModePrice,
      modePrice: defaultModePrice,
      paymentAmount: defaultModePrice,
      currentBalance: defaultInitialBalance,
      error: undefined,
    }
    processBalanceSpy.mockResolvedValue(mockBalanceResultSuccess) // Мок processBalanceVideoOperation через шпиона

    // Мокируем ответ Replicate через шпиона
    replicateRunSpy.mockResolvedValue([
      'https://replicate.delivery/pbxt/abc.../video.mp4',
    ])

    // Мокируем успешное сохранение в БД (остается как было)
    mocks.supabaseMock.saveVideoUrlToSupabase.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- Успешная генерация --- ✏️
  it('✅ [Кейс 1.1] Успешная генерация (stable-video-diffusion)', async () => {
    // --- Arrange ---
    const currentVideoModel = 'stable-video-diffusion' // <--- Меняем модель
    const mockUser = createMockUser(telegram_id, 100000)
    const modelPrice = calculateFinalPrice(currentVideoModel)
    const fakeVideoUrl = 'http://replicate.com/svd_video.mp4' // Меняем URL для ясности

    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(mockUser)

    // ---> Успешный баланс < ---
    const mockBalanceResultSuccess: BalanceOperationResult = {
      success: true,
      newBalance: mockUser.balance - modelPrice,
      modePrice: modelPrice,
      paymentAmount: modelPrice,
      currentBalance: mockUser.balance,
      error: undefined,
    }
    processBalanceSpy.mockResolvedValueOnce(mockBalanceResultSuccess)

    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl]) // <--- Мокируем шпиона
    mocks.downloadMock.downloadFile.mockResolvedValue(
      Buffer.from('fake video data')
    )
    mocks.fsPromisesMocks.writeFile.mockResolvedValue(undefined)
    mocks.fsPromisesMocks.mkdir.mockResolvedValue(undefined as any)
    mocks.supabaseMock.saveVideoUrlToSupabase.mockResolvedValue(undefined)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()

    // --- Act ---
    const result = await generateImageToVideo(
      ctx,
      imageUrl,
      prompt,
      currentVideoModel, // <--- Используем SVD
      telegram_id,
      username,
      is_ru,
      bot_name,
      false // is_morphing = false
    )

    // --- Assert ---
    expect(processBalanceSpy).toHaveBeenCalledOnce()
    expect(mocks.supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(replicateRunSpy).toHaveBeenCalledWith(
      // <--- Проверяем шпиона
      VIDEO_MODELS_CONFIG[currentVideoModel].api.model,
      {
        input: expect.objectContaining({
          image: imageUrl,
          prompt: prompt,
          ...(VIDEO_MODELS_CONFIG[currentVideoModel].api.input || {}),
        }),
      }
    )
    expect(mocks.downloadMock.downloadFile).toHaveBeenCalledWith(fakeVideoUrl)
    // Проверяем моки fsPromises через mocks.fsPromisesMocks
    expect(mocks.fsPromisesMocks.mkdir).toHaveBeenCalledOnce()
    expect(mocks.fsPromisesMocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/uploads\/12345\/image-to-video\/.+\.mp4$/),
      expect.any(Buffer)
    )
    expect(mocks.supabaseMock.saveVideoUrlToSupabase).toHaveBeenCalledWith(
      telegram_id,
      fakeVideoUrl,
      expect.stringMatching(/uploads\/12345\/image-to-video\/.+\.mp4$/),
      currentVideoModel // Проверяем правильную модель
    )
    expect(mockSendVideo).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).toHaveBeenCalledOnce() // Было 2, теперь 1? Проверить логику отправки сообщений
    const messageArgs = mockSendMessage.mock.calls[0]
    // Now we expect the dynamically calculated price (30)
    expect(messageArgs[1]).toContain(`Cost: ${modelPrice.toFixed(2)} ⭐️`)
    // And the correctly calculated new balance (1000 - 30)
    expect(messageArgs[1]).toContain(
      `Your new balance: ${(mockUser.balance - modelPrice).toFixed(2)} ⭐️`
    )
    expect(result).toEqual({ videoUrl: fakeVideoUrl })
    expect(mocks.loggerMock.logger.error).not.toHaveBeenCalled()
  })

  it.todo('✅ [Кейс 1.1] Успешная генерация (kling-v1.6-pro)')
  it.todo('✅ [Кейс 1.1] Успешная генерация (haiper-video-2)')
  it.todo('✅ [Кейс 1.1] Успешная генерация (ray-v2)')
  it.todo('✅ [Кейс 1.1] Успешная генерация (wan-image-to-video)')
  it.todo('✅ [Кейс 1.1] Успешная генерация (minimax)')

  // --- Обработка недостатка средств --- ✏️
  it('✅ [Кейс 1.2] Обработка недостатка средств', async () => {
    // --- Arrange ---
    const currentVideoModel = 'stable-video-diffusion' // Используем SVD
    const mockUser = createMockUser(telegram_id, 5) // Низкий баланс
    const expectedPrice = calculateFinalPrice(currentVideoModel)
    const expectedErrorMessage = is_ru
      ? 'Недостаточно средств на балансе. Пополните баланс вызвав команду /buy.'
      : 'Insufficient funds. Top up your balance using the /buy command.'

    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(mockUser)

    // ---> ПЕРЕОПРЕДЕЛЯЕМ МОК БАЛАНСА (неуспешный) через шпиона <---
    const mockBalanceResultFailure: BalanceOperationResult = {
      success: false,
      newBalance: mockUser.balance,
      modePrice: expectedPrice,
      paymentAmount: 0,
      currentBalance: mockUser.balance,
      error: 'Недостаточно средств',
    }
    processBalanceSpy.mockResolvedValueOnce(mockBalanceResultFailure) // Используем шпиона

    mocks.errorAdminMock.errorMessageAdmin.mockClear()
    replicateRunSpy.mockClear()

    // --- Act & Assert ---
    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        currentVideoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow('Недостаточно средств') // Фактическая ошибка из кода

    // --- Assert Mocks ---
    expect(processBalanceSpy).toHaveBeenCalledOnce() // Используем шпиона
    expect(mocks.supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(replicateRunSpy).not.toHaveBeenCalled() // <--- Проверяем шпиона
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledTimes(1)
  })

  // --- Обработка ошибок API --- ✏️
  it('✅ [Кейс 1.3] Обработка ошибки API Replicate', async () => {
    // --- Arrange ---
    const currentVideoModel = 'stable-video-diffusion' // Используем SVD
    const apiError = new Error('Replicate API failed') // Имитируем ошибку
    const mockUser = createMockUser(telegram_id, 10000)
    const modelPrice = calculateFinalPrice(currentVideoModel)
    const expectedErrorMessage = is_ru
      ? 'Произошла ошибка при генерации видео. Попробуйте позже или обратитесь к администратору.'
      : 'An error occurred during video generation. Please try again later or contact support.'

    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(mockUser)

    // ---> Успешный баланс <---
    const mockBalanceResultSuccess: BalanceOperationResult = {
      success: true,
      newBalance: mockUser.balance - modelPrice,
      modePrice: modelPrice,
      paymentAmount: modelPrice,
      currentBalance: mockUser.balance,
      error: undefined,
    }
    processBalanceSpy.mockResolvedValueOnce(mockBalanceResultSuccess)

    // ---> Ошибка Replicate <---
    replicateRunSpy.mockRejectedValueOnce(apiError) // <--- Мокируем шпиона на ошибку

    mocks.errorAdminMock.errorMessageAdmin.mockClear()

    // --- Act & Assert ---
    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        currentVideoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(apiError) // Ожидаем конкретную ошибку, которую мокировали

    // --- Assert Mocks ---
    expect(processBalanceSpy).toHaveBeenCalledOnce()
    expect(mocks.supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(replicateRunSpy).toHaveBeenCalledOnce() // <--- Проверяем шпиона
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledWith(
      expect.stringContaining('Error in Replicate API'),
      expect.objectContaining({ error: apiError })
    )
    // Проверить, что баланс не откатывается (если нет такой логики)
  })

  // --- Обработка ошибок базы данных --- ✏️
  it('✅ [Кейс 1.4] Обработка ошибки сохранения в БД', async () => {
    // --- Arrange ---
    const currentVideoModel = 'stable-video-diffusion' // Используем SVD
    const mockUser = createMockUser(telegram_id, 10000)
    const modelPrice = calculateFinalPrice(currentVideoModel)
    const dbError = new Error('Supabase save failed')
    const fakeVideoUrl = 'http://replicate.com/db_error_video.mp4'
    const expectedErrorMessage = is_ru
      ? 'Произошла ошибка при сохранении видео. Попробуйте позже или обратитесь к администратору.'
      : 'An error occurred while saving the video. Please try again later or contact support.'

    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(mockUser)

    // ---> Успешный баланс <---
    const mockBalanceResultSuccess: BalanceOperationResult = {
      success: true,
      newBalance: mockUser.balance - modelPrice,
      modePrice: modelPrice,
      paymentAmount: modelPrice,
      currentBalance: mockUser.balance,
      error: undefined,
    }
    processBalanceSpy.mockResolvedValueOnce(mockBalanceResultSuccess)

    // ---> Успешный Replicate <---
    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl]) // <--- Успешный ответ от шпиона
    mocks.supabaseMock.saveVideoUrlToSupabase.mockRejectedValueOnce(dbError)

    mocks.downloadMock.downloadFile.mockResolvedValue(
      Buffer.from('fake video data for db error')
    )
    mocks.fsPromisesMocks.writeFile.mockResolvedValue(undefined)
    mocks.fsPromisesMocks.mkdir.mockResolvedValue(undefined as any)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()

    // --- Act & Assert ---
    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        prompt,
        currentVideoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(dbError) // Ожидаем конкретную ошибку, которую мокировали

    // --- Assert Mocks ---
    expect(processBalanceSpy).toHaveBeenCalledOnce()
    expect(mocks.supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(replicateRunSpy).toHaveBeenCalledOnce() // <--- Проверяем шпиона
    expect(mocks.downloadMock.downloadFile).toHaveBeenCalledOnce()
    expect(mocks.fsPromisesMocks.mkdir).toHaveBeenCalledOnce()
    expect(mocks.fsPromisesMocks.writeFile).toHaveBeenCalledOnce()
    expect(mocks.supabaseMock.saveVideoUrlToSupabase).toHaveBeenCalledOnce() // Вызов был
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledWith(
      expect.stringContaining('Error saving video url to Supabase'),
      expect.objectContaining({ error: dbError })
    )
    // TODO: Проверить, был ли откат баланса (если логика отката реализована)
    // expect(mocks.supabaseMock.updateUserBalance).toHaveBeenCalledWith(...) // Пример
  })

  // --- Обработка невалидных входных данных --- ✏️
  it('✅ [Кейс 1.5] Обработка отсутствия imageUrl', async () => {
    // --- Arrange ---
    const expectedErrorMessage = is_ru
      ? 'Серверная ошибка: Отсутствует URL изображения для генерации.'
      : 'Server error: Image URL is missing for generation.'

    mocks.errorAdminMock.errorMessageAdmin.mockClear()

    // --- Act & Assert ---
    await expect(
      generateImageToVideo(
        ctx,
        undefined, // <--- imageUrl is undefined
        prompt,
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(
      'Серверная ошибка: imageUrl обязателен для стандартного режима'
    ) // Фактическая ошибка из кода

    // --- Assert Mocks ---
    expect(processBalanceSpy).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled() // <--- Проверяем шпиона
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledTimes(1)
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      'Image URL is required'
    )
  })

  it('✅ [Кейс 1.6] Обработка отсутствия prompt', async () => {
    // --- Arrange ---
    const expectedErrorMessage = is_ru
      ? 'Серверная ошибка: Отсутствует промпт для генерации.'
      : 'Server error: Prompt is missing for generation.'

    mocks.errorAdminMock.errorMessageAdmin.mockClear()

    // --- Act & Assert ---
    await expect(
      generateImageToVideo(
        ctx,
        imageUrl,
        undefined, // <--- prompt is undefined
        videoModel,
        telegram_id,
        username,
        is_ru,
        bot_name,
        false
      )
    ).rejects.toThrow(
      'Серверная ошибка: prompt обязателен для стандартного режима'
    ) // Фактическая ошибка из кода

    // --- Assert Mocks ---
    expect(processBalanceSpy).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled() // <--- Проверяем шпиона
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledTimes(1)
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      'Prompt is required'
    )
  })

  it('✅ [Кейс 1.7] Обработка невалидной videoModel', async () => {
    // --- Arrange ---
    const invalidModel = 'non-existent-model'
    const expectedErrorMessage = is_ru
      ? `Серверная ошибка: Невалидная модель видео ${invalidModel}`
      : `Server error: Invalid video model ${invalidModel}`

    mocks.errorAdminMock.errorMessageAdmin.mockClear()

    // --- Act & Assert ---
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
    ).rejects.toThrow(
      `Серверная ошибка: Конфигурация для модели ${invalidModel} не найдена.`
    ) // Фактическая ошибка из кода

    // --- Assert Mocks ---
    expect(processBalanceSpy).not.toHaveBeenCalled()
    expect(replicateRunSpy).not.toHaveBeenCalled() // <--- Проверяем шпиона
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledTimes(1)
  })
})
