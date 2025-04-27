import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import {
  processStartCommand,
  type ProcessStartData,
  type ProcessStartDependencies,
} from '../../../src/scenes/startScene/index'
import {
  // Импортируем все необходимые моки
  mockReply,
  mockReplyWithPhoto,
  mockSendMessage,
  mockGetUserDetailsSubscription,
  mockCreateUser,
  mockGetReferalsCountAndUserData,
  mockGetTranslation,
  mockIsRussian,
  mockGetPhotoUrl,
} from '../../setup'
import type { UserType } from '@/interfaces'
import { logger } from '../../../src/utils/logger'

describe('processStartCommand', () => {
  let dependencies: ProcessStartDependencies
  let data: ProcessStartData

  beforeEach(() => {
    vi.clearAllMocks()

    // Настройка моков зависимостей по умолчанию
    dependencies = {
      getUserDetailsSubscription: mockGetUserDetailsSubscription,
      createUser: mockCreateUser,
      getReferalsCountAndUserData: mockGetReferalsCountAndUserData,
      getTranslation: mockGetTranslation,
      isRussian: mockIsRussian,
      getPhotoUrl: mockGetPhotoUrl,
      reply: mockReply,
      replyWithPhoto: mockReplyWithPhoto,
      sendMessage: mockSendMessage,
      logger: logger,
    }

    // Настройка данных по умолчанию
    data = {
      telegramId: '12345',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      isBot: false,
      languageCode: 'en',
      chatId: 12345,
      inviteCode: null,
      botName: 'test_bot_username',
      photoUrl: null,
    }

    // Настройка ответов моков по умолчанию для успешного сценария
    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: false, // Новый пользователь
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    })
    mockCreateUser.mockResolvedValue([true, null]) // Успешное создание
    mockGetReferalsCountAndUserData.mockResolvedValue({
      count: 0,
      userData: null,
    }) // Нет реферера по умолчанию
    mockGetTranslation.mockResolvedValue({
      translation: 'Mock Welcome Text',
      url: null,
    })
    mockIsRussian.mockReturnValue(false)
    mockGetPhotoUrl.mockReturnValue(null)
    // Убедимся, что моки reply/replyWithPhoto сброшены
    mockReply.mockClear()
    mockReplyWithPhoto.mockClear()
  })

  it('should handle a new user without referral code', async () => {
    // Arrange (используем дефолтные настройки beforeEach)

    // Act
    const result = await processStartCommand(data, dependencies)

    // Assert
    expect(result).toBe(true)
    // Проверка вызова getUserDetailsSubscription
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith(data.telegramId)
    // Проверка вызова createUser
    expect(mockCreateUser).toHaveBeenCalledTimes(1)
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: data.telegramId,
        username: data.username,
        inviter: null, // Нет реферера
      }),
      null
    )
    // Проверка отправки сообщения новому пользователю
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('Avatar created successfully')
    )
    // Проверка вызова getTranslation для приветствия
    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      bot_name: data.botName,
      language_code: data.languageCode,
    })
    // Проверка отправки приветственного сообщения
    expect(mockReply).toHaveBeenCalledWith(
      'Mock Welcome Text',
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
    // Проверка отсутствия вызова replyWithPhoto (т.к. url=null)
    expect(mockReplyWithPhoto).not.toHaveBeenCalled()
    // Проверка отсутствия вызова sendMessage для реферера
    expect(mockSendMessage).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('registered via your link')
    )
  })

  it('should handle a new user WITH referral code', async () => {
    // Arrange
    const inviteCode = 'ref123'
    const referrerTelegramId = '98765'
    const referrerUsername = 'referrerUser'
    const initialReferralCount = 5
    data.inviteCode = inviteCode // Устанавливаем код приглашения

    // Настраиваем мок для рефералов
    mockGetReferalsCountAndUserData.mockResolvedValue({
      count: initialReferralCount + 1,
      userData: {
        id: 123n,
        created_at: new Date(),
        user_id: referrerTelegramId,
        telegram_id: BigInt(referrerTelegramId),
        username: referrerUsername,
        // ... другие поля UserType по необходимости
      } as UserType,
    })

    // Act
    const result = await processStartCommand(data, dependencies)

    // Assert
    expect(result).toBe(true)
    // Проверка getUserDetailsSubscription
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith(data.telegramId)
    // Проверка getReferalsCountAndUserData
    expect(mockGetReferalsCountAndUserData).toHaveBeenCalledTimes(1)
    expect(mockGetReferalsCountAndUserData).toHaveBeenCalledWith(inviteCode)
    // Проверка уведомления реферера
    expect(mockSendMessage).toHaveBeenCalledWith(
      inviteCode, // В коде используется inviteCode как chatId реферера
      expect.stringContaining(`@${data.username} registered via your link`)
    )
    // Проверка createUser с inviter
    expect(mockCreateUser).toHaveBeenCalledTimes(1)
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: data.telegramId,
        inviter: referrerTelegramId, // Проверяем ID реферера
      }),
      null
    )
    // Проверка первого сообщения пользователю
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('Avatar created successfully')
    )
    // Проверка приветственного сообщения
    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      bot_name: data.botName,
      language_code: data.languageCode,
    })
    expect(mockReply).toHaveBeenCalledWith(
      'Mock Welcome Text',
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
  })

  it('should handle an existing user', async () => {
    // Arrange
    // Настраиваем мок, что пользователь существует
    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: true,
      stars: 100, // Пример баланса
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    })

    // Мокируем process.env.SUBSCRIBE_CHANNEL_ID для этого теста
    const adminChannel = '@admin_test_channel'
    vi.stubGlobal('process', {
      ...process, // Сохраняем остальные свойства process
      env: {
        ...process.env, // Сохраняем остальные переменные окружения
        SUBSCRIBE_CHANNEL_ID: adminChannel,
      },
    })

    // Act
    const result = await processStartCommand(data, dependencies)

    // Assert
    expect(result).toBe(true)
    // Проверка getUserDetailsSubscription
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith(data.telegramId)
    // Убеждаемся, что пользователь НЕ создавался
    expect(mockCreateUser).not.toHaveBeenCalled()
    // Убеждаемся, что рефералы НЕ проверялись
    expect(mockGetReferalsCountAndUserData).not.toHaveBeenCalled()
    // Проверка уведомления админа о перезапуске
    expect(mockSendMessage).toHaveBeenCalledWith(
      adminChannel,
      // Уточняем проверку сообщения
      expect.stringContaining(
        `🔄 Пользователь @${data.username} (ID: ${data.telegramId}) перезапустил бота (/start)`
      )
    )
    // Проверка вызова getTranslation для приветствия
    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      bot_name: data.botName,
      language_code: data.languageCode,
    })
    // Проверка отправки приветственного сообщения
    expect(mockReply).toHaveBeenCalledWith(
      'Mock Welcome Text',
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
    // Проверка отсутствия вызова replyWithPhoto (т.к. url=null по умолчанию)
    expect(mockReplyWithPhoto).not.toHaveBeenCalled()

    // Восстанавливаем оригинальный process.env
    vi.unstubAllGlobals()
  })

  it('should handle error during getUserDetailsSubscription', async () => {
    // Arrange
    const error = new Error('Database connection failed')
    mockGetUserDetailsSubscription.mockRejectedValue(error)

    // Act
    const result = await processStartCommand(data, dependencies)

    // Assert
    expect(result).toBe(false) // Ожидаем, что функция вернет false
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith(data.telegramId)
    // Проверяем, что отправлено сообщение об общей ошибке
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('internal error occurred') // Общая ошибка
    )
    // Убеждаемся, что другие критические шаги не выполнялись
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockGetTranslation).not.toHaveBeenCalled()
  })

  it('should handle error during getReferalsCountAndUserData but continue', async () => {
    // Arrange
    const error = new Error('Referral lookup failed')
    data.inviteCode = 'ref123' // Нужен код для запуска реферальной логики
    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: false,
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    }) // Новый пользователь
    mockGetReferalsCountAndUserData.mockRejectedValue(error) // Мокируем ошибку
    mockCreateUser.mockResolvedValue([true, null]) // Предполагаем, что создание пользователя успешно
    mockGetTranslation.mockResolvedValue({
      translation: 'Mock Welcome',
      url: null,
    }) // Для приветствия

    // Act
    const result = await processStartCommand(data, dependencies)

    // Assert
    expect(result).toBe(true) // Ожидаем, что функция вернет true, несмотря на ошибку реферала
    expect(mockGetUserDetailsSubscription).toHaveBeenCalled()
    expect(mockGetReferalsCountAndUserData).toHaveBeenCalledWith(
      data.inviteCode
    )
    expect(mockSendMessage).not.toHaveBeenCalledWith(
      // Уведомление рефереру не должно отправляться
      data.inviteCode,
      expect.any(String)
    )
    // Проверяем, что пользователь был создан (без inviter)
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ inviter: null }),
      null
    )
    // Проверяем, что приветственное сообщение было отправлено
    expect(mockReply).toHaveBeenCalledWith('Mock Welcome', expect.any(Object))
    // Проверяем, что сообщение об ошибке регистрации НЕ отправлялось
    expect(mockReply).not.toHaveBeenCalledWith(
      expect.stringContaining('error occurred during registration')
    )
  })

  it('should handle error during createUser', async () => {
    // Arrange
    const error = new Error('Failed to insert user')
    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: false,
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    }) // Новый пользователь
    mockCreateUser.mockRejectedValue(error) // Мокируем ошибку создания

    // Act
    const result = await processStartCommand(data, dependencies)

    // Assert
    expect(result).toBe(false) // Ожидаем, что функция вернет false
    expect(mockGetUserDetailsSubscription).toHaveBeenCalled()
    expect(mockCreateUser).toHaveBeenCalled()
    // Проверяем, что отправлено сообщение об ошибке регистрации
    expect(mockReply).toHaveBeenCalledWith(
      expect.stringContaining('error occurred during registration')
    )
    // Убеждаемся, что приветственное сообщение не отправлялось
    expect(mockGetTranslation).not.toHaveBeenCalledWith({ key: 'start' })
    expect(mockReply).not.toHaveBeenCalledWith(
      'Mock Welcome Text',
      expect.any(Object)
    )
    expect(mockReplyWithPhoto).not.toHaveBeenCalled()
  })

  it('should handle Russian language correctly for a new user with referral', async () => {
    // Arrange
    const inviteCode = 'ref456'
    const referrerTelegramId = '54321'
    const referrerUsername = 'ruReferrer'
    data.inviteCode = inviteCode
    data.languageCode = 'ru' // Устанавливаем русский язык

    // Мокируем зависимости
    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: false,
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    })
    mockGetReferalsCountAndUserData.mockResolvedValue({
      count: 1,
      userData: {
        id: 456n,
        created_at: new Date(),
        user_id: referrerTelegramId,
        telegram_id: BigInt(referrerTelegramId),
        username: referrerUsername,
      } as UserType,
    })
    mockCreateUser.mockResolvedValue([true, null])
    mockGetTranslation.mockResolvedValue({
      translation: 'Приветствие!',
      url: null,
    }) // Для приветствия
    mockIsRussian.mockReturnValue(true) // Мокируем isRussian = true

    // Act
    const result = await processStartCommand(data, dependencies)

    // Assert
    expect(result).toBe(true)
    // Проверяем вызов isRussian
    expect(mockIsRussian).toHaveBeenCalledWith(data.languageCode)

    // Проверяем уведомление рефереру на русском
    expect(mockSendMessage).toHaveBeenCalledWith(
      inviteCode,
      expect.stringContaining(
        `🔗 Новый пользователь @${data.username} зарегистрировался по вашей ссылке.`
      )
    )

    // Проверяем сообщение о создании аватара на русском
    expect(mockReply).toHaveBeenCalledWith(
      '✅ Аватар успешно создан! Добро пожаловать!'
      // Проверяем без опций, т.к. в коде их нет
    )

    // Проверяем приветственное сообщение (зависит от getTranslation, не от isRu)
    expect(mockReply).toHaveBeenCalledWith('Приветствие!', expect.any(Object))
  })

  // TODO: Добавить тесты для:
  // - Случая, когда getTranslation возвращает URL
  // - Случая, когда getReferalsCountAndUserData возвращает ошибку
  // - Русского языка (isRussian = true)
})
