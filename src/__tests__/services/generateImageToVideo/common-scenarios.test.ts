// src/__tests__/services/generateImageToVideo/common-scenarios.test.ts

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  Mocked,
  Mock,
} from 'vitest'
import { generateImageToVideo } from '@/services/plan_b/generateImageToVideo'
// Импортируем нужные типы напрямую
import type { MyContext, BalanceOperationResult } from '@/interfaces'
// Импортируем ВЕСЬ модуль helpers для spyOn
import * as PriceHelpers from '@/price/helpers'
// Импортируем реальный конфиг, который будет подменен
import { VIDEO_MODELS_CONFIG } from '@/price/models/VIDEO_MODELS_CONFIG'
// Импортируем calculateFinalPrice, если она нужна
import { calculateFinalPrice } from '@/price/helpers'

// Import helpers and types from the new helper file
import {
  setupMocks,
  createMockContext,
  createMockUser,
  MockedDependencies,
  MockContextResult,
  // Удаляем импорт моков vi.fn()
  // mockProcessBalanceVideoOperation,
  // mockGetUserBalance,
} from './helpers'

import { errorMessageAdmin } from '@/helpers/error/errorMessageAdmin'
import * as UserBalanceModule from '@/core/supabase/getUserBalance' // <--- Импортируем модуль для getUserBalance
import * as ReplicateClient from '@/core/replicate' // <--- Импортируем для spyOn

// --- УДАЛЯЕМ МОК МОДУЛЯ ОТСЮДА (он теперь в helpers.ts) ---
// import * as PriceHelpers from '@/price/helpers'
// import {
//   mockProcessBalanceVideoOperation,
//   mockGetUserBalance,
// } from './helpers'
// vi.mock('@/price/helpers', () => ({
//   processBalanceVideoOperation: mockProcessBalanceVideoOperation,
//   getUserBalance: mockGetUserBalance,
// }))
// --- КОНЕЦ УДАЛЕНИЯ ---

// +++ ГЛОБАЛЬНЫЙ МОК МОДЕЛЕЙ ДЛЯ ЭТОГО ТЕСТА +++
vi.mock('@/price/models/VIDEO_MODELS_CONFIG', () => ({
  // ---> Вставляем объект мока ПРЯМО СЮДА <---
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
    // Добавляем модель для Кейса 3.9
    'model-no-price': {
      id: 'model-no-price',
      title: 'Model Without Price',
      inputType: ['image', 'text'],
      description: 'Mock No Price',
      basePrice: undefined, // Цена не определена
      api: { model: 'no-price:latest', input: {} },
      imageKey: 'image',
      canMorph: false,
    },
  },
}))
// +++ КОНЕЦ ГЛОБАЛЬНОГО МОКА +++

describe('generateImageToVideo Service: Общие Сценарии', () => {
  let mocks: MockedDependencies
  let ctx: MyContext
  let mockSendMessage: Mock
  let mockSendVideo: Mock
  let processBalanceSpy
  let getUserBalanceSpy
  let replicateRunSpy // <--- Добавляем шпиона для replicate.run

  const telegram_id = '12345'
  const username = 'testuser'
  const is_ru = false
  const bot_name = 'test_bot'
  const prompt = 'A test prompt'
  const imageUrl = 'https://example.com/image.jpg'
  const videoModel = 'stable-video-diffusion' // Используем эту модель везде

  beforeEach(async () => {
    // Сброс всех моков и спаев перед тестом
    vi.restoreAllMocks()

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

    // ---> ИСПОЛЬЗУЕМ vi.spyOn ДЛЯ УСТАНОВКИ ПОВЕДЕНИЯ < ---
    processBalanceSpy = vi.spyOn(
      PriceHelpers as any,
      'processBalanceVideoOperation'
    )
    getUserBalanceSpy = vi.spyOn(UserBalanceModule, 'getUserBalance')
    replicateRunSpy = vi.spyOn(ReplicateClient.replicate, 'run') // <--- Устанавливаем шпиона

    // Set default user found
    const defaultUser = createMockUser(telegram_id, 100000)
    getUserBalanceSpy.mockResolvedValue(defaultUser.balance)
    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(defaultUser)

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
    processBalanceSpy.mockResolvedValue(mockBalanceResultSuccess)

    // ---> Устанавливаем ДЕФОЛТНЫЙ мок для replicateRunSpy < ---
    replicateRunSpy.mockResolvedValue([
      'https://replicate.delivery/pbxt/default/video.mp4',
    ])
  })

  afterEach(() => {
    // Очищаем все шпионы после каждого теста
    vi.restoreAllMocks()
  })

  // --- Обработка ошибок API и системы --- ✏️
  it('✅ [Кейс 3.1] Обработка ошибки API Replicate', async () => {
    const replicateError = new Error('Replicate API Error')
    replicateRunSpy.mockRejectedValueOnce(replicateError) // <--- Мокируем шпиона на ошибку
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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

    expect(mocks.supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(replicateRunSpy).toHaveBeenCalledOnce() // <--- Проверяем шпиона
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      'Replicate API Error'
    )
    expect(processBalanceSpy).toHaveBeenCalledOnce()
  })

  it('✅ [Кейс 3.2] Обработка ошибки извлечения URL видео (null)', async () => {
    const expectedError = 'Серверная ошибка: Replicate не вернул результат'
    replicateRunSpy.mockResolvedValueOnce(null) // <--- Мокируем шпиона на null
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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
    ).rejects.toThrow(expectedError)

    expect(replicateRunSpy).toHaveBeenCalledOnce() // <--- Проверяем шпиона
    expect(mocks.downloadMock.downloadFile).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      expectedError
    )
    expect(processBalanceSpy).toHaveBeenCalledOnce()
  })

  it('✅ [Кейс 3.2] Обработка ошибки извлечения URL видео (не массив строк)', async () => {
    const expectedError =
      'Серверная ошибка: Неверный формат ответа от Replicate'
    replicateRunSpy.mockResolvedValueOnce({ not_an_array: true }) // <--- Мокируем шпиона
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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
    ).rejects.toThrow(expectedError)

    expect(replicateRunSpy).toHaveBeenCalledOnce() // <--- Проверяем шпиона
    expect(mocks.downloadMock.downloadFile).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      expectedError
    )
    expect(processBalanceSpy).toHaveBeenCalledOnce()
  })

  it('✅ [Кейс 3.3] Обработка ошибки сохранения в БД (saveVideoUrlToSupabase)', async () => {
    const fakeVideoUrl = 'http://replicate.com/video.mp4'
    const dbError = new Error('DB Save Error')
    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl]) // <--- Мокируем шпиона
    mocks.downloadMock.downloadFile.mockResolvedValue(Buffer.from('fake data'))
    mocks.fsPromisesMocks.mkdir.mockResolvedValue(undefined as any)
    mocks.fsPromisesMocks.writeFile.mockResolvedValue(undefined)
    mocks.supabaseMock.saveVideoUrlToSupabase.mockRejectedValue(dbError)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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
    ).rejects.toThrow(dbError)

    expect(replicateRunSpy).toHaveBeenCalledOnce() // <--- Проверяем шпиона
    expect(mocks.downloadMock.downloadFile).toHaveBeenCalledWith(fakeVideoUrl)
    expect(mocks.fsPromisesMocks.writeFile).toHaveBeenCalledOnce()
    expect(mocks.supabaseMock.saveVideoUrlToSupabase).toHaveBeenCalledOnce()
    expect(mockSendVideo).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      dbError.message
    )
    expect(processBalanceSpy).toHaveBeenCalledOnce()
  })

  it('✅ [Кейс 3.4] Проверка вызова errorMessageAdmin при ошибке скачивания файла', async () => {
    const fakeVideoUrl = 'http://replicate.com/video_fail.mp4'
    const downloadError = new Error('Download Failed')
    replicateRunSpy.mockResolvedValueOnce([fakeVideoUrl]) // <--- Мокируем шпиона
    mocks.downloadMock.downloadFile.mockRejectedValue(downloadError)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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

    expect(mocks.replicateClientMock.run).toHaveBeenCalledOnce()
    expect(mocks.downloadMock.downloadFile).toHaveBeenCalledWith(fakeVideoUrl)
    expect(mocks.fsPromisesMocks.writeFile).not.toHaveBeenCalled()
    expect(mocks.supabaseMock.saveVideoUrlToSupabase).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      downloadError.message
    )
    // ---> Проверяем вызов спая <---
    expect(processBalanceSpy).toHaveBeenCalledOnce()
  })

  it('✅ [Кейс 3.4] Проверка вызова errorMessageAdmin при ошибке создания директории', async () => {
    const fakeVideoUrl = 'http://replicate.com/video_mkdir_fail.mp4'
    const mkdirError = new Error('Mkdir Failed')
    mocks.replicateClientMock.run.mockResolvedValue([fakeVideoUrl])
    mocks.downloadMock.downloadFile.mockResolvedValue(Buffer.from('fake data'))
    mocks.fsPromisesMocks.mkdir.mockRejectedValue(mkdirError)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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

    expect(mocks.replicateClientMock.run).toHaveBeenCalledOnce()
    expect(mocks.downloadMock.downloadFile).toHaveBeenCalledWith(fakeVideoUrl)
    expect(mocks.fsPromisesMocks.mkdir).toHaveBeenCalledOnce()
    expect(mocks.fsPromisesMocks.writeFile).not.toHaveBeenCalled()
    expect(mocks.supabaseMock.saveVideoUrlToSupabase).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      mkdirError.message
    )
    // ---> Проверяем вызов спая <---
    expect(processBalanceSpy).toHaveBeenCalledOnce()
  })

  it('✅ [Кейс 3.4] Проверка вызова errorMessageAdmin при ошибке записи файла', async () => {
    const fakeVideoUrl = 'http://replicate.com/video_write_fail.mp4'
    const writeError = new Error('Write Failed')
    mocks.replicateClientMock.run.mockResolvedValue([fakeVideoUrl])
    mocks.downloadMock.downloadFile.mockResolvedValue(Buffer.from('fake data'))
    mocks.fsPromisesMocks.mkdir.mockResolvedValue(undefined as any)
    mocks.fsPromisesMocks.writeFile.mockRejectedValue(writeError)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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

    expect(mocks.replicateClientMock.run).toHaveBeenCalledOnce()
    expect(mocks.downloadMock.downloadFile).toHaveBeenCalledWith(fakeVideoUrl)
    expect(mocks.fsPromisesMocks.mkdir).toHaveBeenCalledOnce()
    expect(mocks.fsPromisesMocks.writeFile).toHaveBeenCalledOnce()
    expect(mocks.supabaseMock.saveVideoUrlToSupabase).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      writeError.message
    )
    // ---> Проверяем вызов спая <---
    expect(processBalanceSpy).toHaveBeenCalledOnce()
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

    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(
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
    processBalanceSpy.mockResolvedValueOnce(
      // Once - важно для этого теста
      mockBalanceResultSuccess
    )

    mocks.replicateClientMock.run.mockResolvedValueOnce([fakeVideoUrl])
    mocks.downloadMock.downloadFile.mockResolvedValue(
      Buffer.from('fake video data')
    )
    mocks.fsPromisesMocks.mkdir.mockResolvedValue(undefined as any)
    mocks.fsPromisesMocks.writeFile.mockResolvedValue(undefined)
    mocks.supabaseMock.saveVideoUrlToSupabase.mockResolvedValue(undefined)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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

    // ---> Проверяем вызов спая <---
    expect(processBalanceSpy).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledOnce()
    const messageArgs = mockSendMessage.mock.calls[0]
    expect(messageArgs[0]).toBe(telegram_id)
    const messageText = messageArgs[1]
    // Use the values from the *explicit* mock we defined above
    const { modePrice: resultModePrice, newBalance: resultNewBalance } =
      mockBalanceResultSuccess
    expect(messageText).toContain(
      `Стоимость: ${resultModePrice.toFixed(2)} ⭐️`
    )
    expect(messageText).toContain(
      `Ваш новый баланс: ${resultNewBalance.toFixed(2)} ⭐️`
    )
    expect(mockSendVideo).toHaveBeenCalledTimes(1)
    expect(mocks.fsPromisesMocks.mkdir).toHaveBeenCalledOnce()
    expect(mocks.fsPromisesMocks.writeFile).toHaveBeenCalledOnce()
    expect(mocks.supabaseMock.saveVideoUrlToSupabase).toHaveBeenCalledWith(
      telegram_id,
      fakeVideoUrl,
      expect.stringMatching(/uploads\/12345\/image-to-video\/.+\.mp4$/),
      videoModel
    )
  })

  it('✅ [Кейс 3.7] Обработка ошибки, когда пользователь не найден в БД', async () => {
    mocks.supabaseMock.getUserByTelegramId.mockResolvedValue(null)
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
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
    ).rejects.toThrow('Пользователь не найден в базе данных')

    // ---> Баланс НЕ должен проверяться спаем <---
    expect(processBalanceSpy).not.toHaveBeenCalled()
    expect(getUserBalanceSpy).not.toHaveBeenCalled()
    expect(mocks.supabaseMock.getUserByTelegramId).toHaveBeenCalledWith(ctx)
    expect(mocks.replicateClientMock.run).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      'Пользователь не найден в базе данных'
    )
  })

  it('✅ [Кейс 3.8] Обработка ошибки, когда модель не найдена в конфиге', async () => {
    const nonExistentModel = 'non-existent-model'
    const expectedError = `Серверная ошибка: Конфигурация для модели ${nonExistentModel} не найдена.`
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

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

    // ---> Баланс НЕ должен проверяться спаем <---
    expect(processBalanceSpy).not.toHaveBeenCalled()
    expect(getUserBalanceSpy).not.toHaveBeenCalled()
    expect(mocks.replicateClientMock.run).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      expectedError
    )
  })

  it('✅ [Кейс 3.9] Обработка ошибки, когда у модели нет цены (basePrice)', async () => {
    const modelWithoutPrice = 'model-no-price'
    const expectedError = `Серверная ошибка: Отсутствует basePrice в конфигурации для модели ${modelWithoutPrice}`
    mocks.errorAdminMock.errorMessageAdmin.mockClear()
    mockSendMessage.mockClear()
    mockSendVideo.mockClear()

    // Установка мока для getUserBalance не нужна, т.к. ошибка раньше
    // Установка мока для processBalanceSpy не нужна, т.к. ошибка раньше

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
    ).rejects.toThrow(expectedError)

    // ---> Баланс НЕ должен проверяться спаем <---
    expect(processBalanceSpy).not.toHaveBeenCalled()
    expect(getUserBalanceSpy).not.toHaveBeenCalled()
    expect(mocks.replicateClientMock.run).not.toHaveBeenCalled()
    expect(mocks.errorAdminMock.errorMessageAdmin).toHaveBeenCalledOnce()
    expect(mocks.errorAdminMock.errorMessageAdmin.mock.calls[0][0]).toContain(
      expectedError
    )
  })

  // Пример использования calculateFinalPrice (если он используется в каком-то тесте этого файла)
  it('Пример теста с использованием calculateFinalPrice', () => {
    const modelPrice = calculateFinalPrice(videoModel) // Теперь импорт работает
    expect(modelPrice).toBeDefined()
  })
})
