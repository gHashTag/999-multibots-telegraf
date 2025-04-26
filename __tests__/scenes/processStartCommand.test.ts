import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Импортируем РЕАЛЬНУЮ функцию и типы ---
import {
  processStartCommand,
  type ProcessStartData,
  type ProcessStartDependencies,
} from '../../src/scenes/startScene/index'

// --- Импортируем МОКИ ЗАВИСИМОСТЕЙ из setup ---
import {
  mockGetUserDetailsSubscription,
  mockCreateUser,
  mockGetReferalsCountAndUserData,
  mockGetTranslation,
  mockIsRussian,
  mockGetPhotoUrl,
  mockLoggerInfo,
  mockLoggerError,
  mockReply,
  mockReplyWithPhoto,
  mockSendMessage,
} from '../setup'

// --- Мокируем ВНЕШНИЕ зависимости ---
vi.mock('@/core/supabase', () => ({
  getUserDetailsSubscription: mockGetUserDetailsSubscription,
  createUser: mockCreateUser,
  getReferalsCountAndUserData: mockGetReferalsCountAndUserData,
  getTranslation: mockGetTranslation,
}))

vi.mock('@/helpers/language', () => ({
  isRussian: mockIsRussian,
}))

vi.mock('@/handlers/getPhotoUrl', () => ({
  getPhotoUrl: mockGetPhotoUrl,
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: vi.fn(), // Мокаем warn тоже, на всякий случай
    debug: vi.fn(),
  },
}))

// --- Тесты для логики processStartCommand ---
describe('processStartCommand logic', () => {
  let mockDependencies: ProcessStartDependencies

  beforeEach(() => {
    vi.clearAllMocks()

    process.env.SUBSCRIBE_CHANNEL_ID = 'mock_admin_channel_id'

    // Собираем объект зависимостей с моками
    mockDependencies = {
      getUserDetailsSubscription: mockGetUserDetailsSubscription,
      createUser: mockCreateUser,
      getReferalsCountAndUserData: mockGetReferalsCountAndUserData,
      getTranslation: mockGetTranslation,
      isRussian: mockIsRussian,
      getPhotoUrl: mockGetPhotoUrl,
      reply: mockReply,
      replyWithPhoto: mockReplyWithPhoto,
      sendMessage: mockSendMessage,
      logger: {
        info: mockLoggerInfo,
        error: mockLoggerError,
      } as any, // Используем as any для упрощения мока логгера
    }

    // Настраиваем стандартное поведение моков
    mockGetTranslation.mockResolvedValue({
      translation: 'Mock Welcome',
      url: null,
    })
    mockIsRussian.mockReturnValue(false) // По умолчанию - не русский
    mockCreateUser.mockResolvedValue([true, null]) // По умолчанию создание успешно
    mockGetReferalsCountAndUserData.mockResolvedValue({
      count: 0,
      userData: null,
    }) // По умолчанию рефералов нет
    mockGetUserDetailsSubscription.mockResolvedValue({
      // По умолчанию пользователь не существует
      isExist: false,
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    })
    mockSendMessage.mockResolvedValue({}) // По умолчанию отправка сообщения успешна
  })

  it('should handle a new user correctly (no referral, with tutorial link)', async () => {
    // 1. Arrange
    const inputData: ProcessStartData = {
      telegramId: '12345',
      username: 'testuser',
      firstName: 'Test',
      languageCode: 'en',
      inviteCode: null,
      botName: 'test_bot_username',
      photoUrl: 'mock_photo_url',
      chatId: 12345,
    }
    const mockTranslationResult = { translation: 'Welcome!', url: null } // Нет URL фото
    const tutorialUrlMock = 'http://tutorial.url'
    process.env.TUTORIAL_URL_test_bot_username = tutorialUrlMock // Мокаем URL туториала через env

    // Переопределяем моки для этого теста
    mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false } as any)
    mockGetTranslation.mockResolvedValue(mockTranslationResult)
    mockIsRussian.mockReturnValue(false)

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(true)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('12345')
    expect(mockGetReferalsCountAndUserData).not.toHaveBeenCalled()
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ telegram_id: '12345', inviter: null }),
      null
    )
    // Проверяем вызовы reply (приветствие + текст с туториалом)
    expect(mockDependencies.reply).toHaveBeenCalledTimes(2)
    expect(mockDependencies.reply).toHaveBeenNthCalledWith(
      1,
      '✅ Avatar created successfully! Welcome!'
    )
    expect(mockDependencies.reply).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Watch this [tutorial video]'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
    expect(mockDependencies.replyWithPhoto).not.toHaveBeenCalled() // Фото не должно отправляться
    expect(mockDependencies.sendMessage).toHaveBeenCalledWith(
      process.env.SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(
        `[test_bot_username] 🔗 Новый пользователь @testuser`
      )
    ) // Уведомление админу

    delete process.env.TUTORIAL_URL_test_bot_username // Чистим env
  })

  it('should handle an existing user correctly (with photo and tutorial)', async () => {
    // Arrange
    const inputData: ProcessStartData = {
      telegramId: '54321',
      username: 'existinguser',
      firstName: 'Existing',
      languageCode: 'ru',
      inviteCode: null,
      botName: 'test_bot_username',
      photoUrl: 'existing_photo_url',
      chatId: 54321,
    }
    const mockUserDetailsResult = { isExist: true } as any
    const mockTranslationResult = {
      translation: 'С возвращением!',
      url: 'photo_url',
    }
    const tutorialUrlMock = 'http://tutorial.ru'
    process.env.TUTORIAL_URL_test_bot_username = tutorialUrlMock

    mockGetUserDetailsSubscription.mockResolvedValue(mockUserDetailsResult)
    mockGetTranslation.mockResolvedValue(mockTranslationResult)
    mockIsRussian.mockReturnValue(true)
    mockSendMessage.mockResolvedValue({}) // Убедимся, что отправка админу сработает

    // 2. Act
    await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('54321')
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockGetReferalsCountAndUserData).not.toHaveBeenCalled()
    // Проверяем уведомление админа (перезапуск)
    expect(mockDependencies.sendMessage).toHaveBeenCalledWith(
      process.env.SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(
        `[test_bot_username] 🔄 Пользователь @existinguser`
      )
    )
    // Проверяем отправку фото с приветствием
    expect(mockDependencies.replyWithPhoto).toHaveBeenCalledWith(
      mockTranslationResult.url,
      {
        caption: mockTranslationResult.translation,
      }
    )
    // Проверяем отправку туториала (единственный вызов reply)
    expect(mockDependencies.reply).toHaveBeenCalledTimes(1)
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      expect.stringContaining('Посмотрите [видео-инструкцию]'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    )

    delete process.env.TUTORIAL_URL_test_bot_username
  })

  it('should handle a new user with a referral code', async () => {
    // Arrange
    const inputData: ProcessStartData = {
      telegramId: '13579',
      username: 'refuser',
      firstName: 'Ref',
      languageCode: 'ru',
      inviteCode: '98765',
      botName: 'test_bot_username',
      photoUrl: 'ref_photo_url',
      chatId: 13579,
    }
    const mockTranslationResult = {
      translation: 'Привет по рефералу!',
      url: null,
    }
    const mockReferalsResult = {
      count: 5,
      userData: { user_id: '98765', username: 'referrer' },
    }
    const tutorialUrlMock = 'http://tutorial.ru'
    process.env.TUTORIAL_URL_test_bot_username = tutorialUrlMock

    mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false } as any)
    mockCreateUser.mockResolvedValue([true, null])
    mockGetTranslation.mockResolvedValue(mockTranslationResult)
    mockIsRussian.mockReturnValue(true)
    mockGetReferalsCountAndUserData.mockResolvedValue(mockReferalsResult)
    mockSendMessage.mockResolvedValue({}) // Убедимся, что отправка сработает

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(true)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('13579')
    expect(mockGetReferalsCountAndUserData).toHaveBeenCalledWith('98765')
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ inviter: '98765' }),
      null
    ) // Проверяем ID реферера
    // Проверяем оба вызова sendMessage
    expect(mockDependencies.sendMessage).toHaveBeenCalledTimes(2)
    // 1. Уведомление рефереру
    expect(mockDependencies.sendMessage).toHaveBeenNthCalledWith(
      1,
      '98765',
      expect.stringContaining(`🔗 Новый пользователь @refuser`)
    )
    // 2. Уведомление админу
    expect(mockDependencies.sendMessage).toHaveBeenNthCalledWith(
      2,
      process.env.SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(
        `[test_bot_username] 🔗 Новый пользователь @refuser (ID: 13579) по реф. от @referrer`
      )
    )
    // Проверяем reply (приветствие + текст с туториалом)
    expect(mockDependencies.reply).toHaveBeenCalledTimes(2)
    expect(mockDependencies.reply).toHaveBeenNthCalledWith(
      1,
      '✅ Аватар успешно создан! Добро пожаловать!'
    )
    expect(mockDependencies.reply).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Посмотрите [видео-инструкцию]'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
    expect(mockDependencies.replyWithPhoto).not.toHaveBeenCalled()

    delete process.env.TUTORIAL_URL_test_bot_username
  })

  it('should return false and reply on user check error', async () => {
    // Arrange
    const inputData: ProcessStartData = {
      telegramId: 'err-check',
      username: 'errCheckUser',
      botName: 'test_bot',
    }
    const dbError = new Error('DB connection failed')
    mockGetUserDetailsSubscription.mockRejectedValue(dbError) // Ошибка при проверке юзера

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(false)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('err-check')
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockDependencies.reply).toHaveBeenCalledTimes(1) // Только сообщение об ошибке
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      expect.stringContaining('internal error occurred')
    )
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('Critical error'),
      expect.any(Object)
    )
  })

  it('should return false and reply on user creation error', async () => {
    // Arrange
    const inputData: ProcessStartData = {
      telegramId: 'err-create',
      username: 'errCreateUser',
      botName: 'test_bot',
    }
    const createError = new Error('Failed to insert user')
    mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false } as any)
    mockCreateUser.mockRejectedValue(createError) // Ошибка при создании

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(false)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('err-create')
    expect(mockCreateUser).toHaveBeenCalled() // Попытка создания была
    expect(mockDependencies.reply).toHaveBeenCalledTimes(1) // Только сообщение об ошибке
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      expect.stringContaining('error occurred during registration')
    )
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('Error creating user'),
      expect.any(Object)
    )
  })

  it('should handle error during referral processing but continue', async () => {
    // Arrange
    const inputData: ProcessStartData = {
      telegramId: 'newref-err',
      username: 'refErrUser',
      languageCode: 'en',
      inviteCode: 'refErrCode',
      botName: 'test_bot',
      chatId: 111,
    }
    const referralError = new Error('Referral DB error')
    mockGetUserDetailsSubscription.mockResolvedValue({ isExist: false } as any)
    mockGetReferalsCountAndUserData.mockRejectedValue(referralError) // Ошибка при проверке реферала
    mockCreateUser.mockResolvedValue([true, null]) // Создание пользователя успешно
    mockGetTranslation.mockResolvedValue({
      translation: 'Welcome after ref error',
      url: null,
    })
    mockIsRussian.mockReturnValue(false)

    // Act
    const result = await processStartCommand(inputData, mockDependencies)

    // Assert
    expect(result).toBe(true) // Функция должна завершиться успешно, т.к. ошибка реферала перехватывается
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('newref-err')
    expect(mockGetReferalsCountAndUserData).toHaveBeenCalledWith('refErrCode')
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('Error processing referral logic'),
      expect.any(Object)
    )
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ inviter: null }),
      null
    ) // Inviter должен быть null
    expect(mockDependencies.reply).toHaveBeenCalledTimes(2) // Приветствие + Welcome after ref error
    expect(mockDependencies.reply).toHaveBeenNthCalledWith(
      1,
      '✅ Avatar created successfully! Welcome!'
    )
    expect(mockDependencies.reply).toHaveBeenNthCalledWith(
      2,
      'Welcome after ref error',
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
    expect(mockDependencies.replyWithPhoto).not.toHaveBeenCalled()
  })
})
