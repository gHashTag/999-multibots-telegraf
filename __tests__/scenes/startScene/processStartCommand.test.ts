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

  // TODO: Добавить тесты для:
  // - Нового пользователя С реферальным кодом
  // - Существующего пользователя
  // - Случая, когда getTranslation возвращает URL
  // - Случая, когда createUser возвращает ошибку
  // - Случая, когда getReferalsCountAndUserData возвращает ошибку
  // - Случая, когда getUserDetailsSubscription возвращает ошибку
  // - Русского языка (isRussian = true)
})
