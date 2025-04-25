import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest'
import type { Mock } from 'vitest'

// Импортируем ЧАСТЬ необходимых моков ИЗ SETUP
import {
  initializeMocks,
  mockGetUserDetailsSubscription,
  mockIsRussian,
  mockSendMessage,
  mockMainMenu,
  mockGetPhotoUrl,
  mockCallApi,
  mockLoggerInfo,
  mockLoggerError,
} from '../mocks/setup'

// Импортируем оригинальные функции и ТИПЫ для мокирования и тестирования
// Используем ОТНОСИТЕЛЬНЫЕ ПУТИ
import {
  processStartCommand,
  startScene,
} from '../../src/scenes/startScene/index'
import type {
  ProcessStartData,
  ProcessStartDependencies,
} from '../../src/scenes/startScene/index'

import { Context as TelegrafContext } from 'telegraf'
import { Message, User, Update, UserFromGetMe } from '@telegraf/types'

// Функция для создания mock-контекста Telegraf
export const createMockTelegrafContext = (
  overrides: Partial<{
    message: Partial<Message.TextMessage>
    from: Partial<User>
    // Добавьте другие части контекста, которые вам могут понадобиться
  }> = {}
): TelegrafContext & {
  message: Message.TextMessage
  from: User
  // Определите другие ожидаемые свойства контекста
} => {
  const defaultUser: User = {
    id: 12345,
    is_bot: false,
    first_name: 'Test',
    username: 'testuser',
    language_code: 'en',
    ...overrides.from,
  }

  const defaultMessage: Message.TextMessage = {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: 12345, type: 'private' },
    from: defaultUser,
    text: '/start',
    ...overrides.message,
  }

  const mockContext: Partial<TelegrafContext> = {
    botInfo: {
      id: 54321,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot_username',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
    } as UserFromGetMe,
    message: defaultMessage,
    from: defaultUser,
    chat: defaultMessage.chat,
    reply: vi.fn((text, extra) => {
      console.log(`Mock reply: "${text}"`, extra || '')
      return Promise.resolve({} as any) // Возвращаем пустой промис
    }),
    sendMessage: vi
      .fn()
      .mockImplementation(
        async (chatId: string | number, text: string, extra?: any) => {
          console.log(`Mock sendMessage to ${chatId}: "${text}"`, extra || '')
          // Возвращаем объект, соответствующий Message.TextMessage
          return Promise.resolve({
            message_id: 1,
            date: Date.now(),
            chat: { id: Number(chatId), type: 'private' },
            text: text,
            from: defaultUser, // Используем defaultUser или другой подходящий мок
          } as Message.TextMessage)
        }
      ),
    // Добавьте другие необходимые методы и свойства контекста
    // Например:
    // session: {},
    // scene: { enter: vi.fn(), leave: vi.fn() },
    // state: {},
    // ...
  }

  // Типизируем контекст, чтобы он соответствовал ожиданиям
  return mockContext as TelegrafContext & {
    message: Message.TextMessage
    from: User
  }
}

// --- Остальные импорты ---
import { Markup } from 'telegraf'
import { logger as actualLogger } from '../../src/utils/logger'

// Мокируем модуль getUserDetailsSubscription
vi.mock('../../src/core/supabase/getUserDetailsSubscription')

// Локально мокируем createUser
const mockCreateUser = vi.fn()
vi.mock('../../src/core/supabase/user', () => ({
  createUser: mockCreateUser,
  // Если есть другие экспорты из user.ts, которые не нужно мокать, добавьте их здесь
  // например: someOtherExport: vi.importActual('../../src/core/supabase/user').someOtherExport
}))

// Мокируем модули, чьи функции передаются как зависимости
vi.mock('../../src/core/supabase/referral', () => ({
  getReferalsCountAndUserData: vi.fn(),
}))
vi.mock('../../src/utils/localization', () => ({
  getTranslation: vi.fn(),
}))
vi.mock('../../src/handlers/getPhotoUrl', () => ({
  getPhotoUrl: vi.fn(),
}))
vi.mock('../../src/helpers/language', () => ({
  isRussian: vi.fn(),
}))
vi.mock('../../src/core/bot', () => ({
  BOT_URLS: { test_bot_username: 'http://tutorial.url' },
  callApi: vi.fn(),
}))

// Мокируем mainMenu
vi.mock('../../src/menu/mainMenu')

// Мокируем index (для startMenu)
vi.mock('../../src/menu/index')

// Глобальный мок для process.env (если используется SUBSCRIBE_CHANNEL_ID)
vi.stubGlobal('process', {
  ...process,
  env: {
    ...process.env,
    SUBSCRIBE_CHANNEL_ID: '-100987654321',
  },
})

describe('processStartCommand', () => {
  let mockCtx: any
  let mockGetUserDetailsSubscription: Mock
  let mockGetReferalsCountAndUserData: Mock
  let mockGetTranslation: Mock
  let mockMainMenu: Mock
  let mockStartMenu: Mock
  let mockIsRussian: Mock
  let mockLoggerInfo: Mock
  let mockLoggerWarn: Mock
  let mockLoggerError: Mock

  let loggerModule: { logger: typeof actualLogger } | undefined

  let mockDependencies: ProcessStartDependencies

  beforeEach(async () => {
    // Импортируем мокированные функции напрямую
    const getUserDetailsSubscriptionImport = await import(
      '../../src/core/supabase/getUserDetailsSubscription'
    )
    const referralModuleImport = await import(
      '../../src/core/supabase/referral'
    )
    const localizationModuleImport = await import(
      '../../src/utils/localization'
    )
    const mainMenuModuleImport = await import('../../src/menu/mainMenu')
    const menuIndexModuleImport = await import('../../src/menu/index')
    const languageHelperModuleImport = await import(
      '../../src/helpers/language'
    )
    const loggerModuleImport = await import('../../src/utils/logger')

    // Присваиваем моки переменным
    mockGetUserDetailsSubscription =
      getUserDetailsSubscriptionImport.getUserDetailsSubscription as Mock
    mockGetReferalsCountAndUserData =
      referralModuleImport.getReferalsCountAndUserData as Mock
    mockGetTranslation = localizationModuleImport.getTranslation as Mock
    mockMainMenu = mainMenuModuleImport.mainMenu as Mock
    mockStartMenu = menuIndexModuleImport.startMenu as Mock
    mockIsRussian = languageHelperModuleImport.isRussian as Mock
    loggerModule = loggerModuleImport

    // Мокируем методы логгера
    vi.resetAllMocks()
    mockLoggerInfo = vi.fn()
    mockLoggerWarn = vi.fn()
    mockLoggerError = vi.fn()
    if (loggerModule?.logger) {
      loggerModule.logger.info = mockLoggerInfo
      loggerModule.logger.warn = mockLoggerWarn
      loggerModule.logger.error = mockLoggerError
    } else {
      console.warn(
        'Не удалось правильно мокировать logger. Проверьте экспорт в logger.ts'
      )
    }

    vi.clearAllMocks()

    // Сначала создаем mockCtx
    mockCtx = createMockTelegrafContext({
      message: { text: '/start', from: { id: 12345, language_code: 'en' } },
    })

    // Затем инициализируем mockDependencies, используя mockCtx
    mockDependencies = {
      getUserDetailsSubscription: mockGetUserDetailsSubscription,
      createUser: mockCreateUser,
      getReferalsCountAndUserData: mockGetReferalsCountAndUserData,
      getTranslation: mockGetTranslation,
      isRussian: mockIsRussian,
      getPhotoUrl: vi.fn(),
      reply: mockCtx.reply,
      replyWithPhoto: vi.fn(),
      sendMessage: mockCtx.sendMessage,
      logger:
        loggerModule?.logger ||
        ({
          info: mockLoggerInfo,
          warn: mockLoggerWarn,
          error: mockLoggerError,
        } as any),
    }

    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: false,
      isSubscriptionActive: false,
      subscriptionType: null,
      stars: 0,
      subscriptionStartDate: null,
      user: null,
    })
    mockGetTranslation.mockImplementation((key: string) => key)
    mockIsRussian.mockReturnValue(false)
    mockMainMenu.mockReturnValue({
      text: 'main-menu',
      reply_markup: { keyboard: [] },
    })
    mockStartMenu.mockReturnValue({
      text: 'start-menu',
      reply_markup: { inline_keyboard: [] },
    })
  })

  it('should handle a new user correctly (no referral, with tutorial)', async () => {
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

    const mockUserDetailsResult = { isExist: false }
    const mockTranslationResult = { translation: 'Welcome!', url: 'photo_url' }
    const mockReferalsResult = { count: 0, userData: {} }

    // Настраиваем моки зависимостей
    mockGetUserDetailsSubscription.mockResolvedValue(mockUserDetailsResult)
    mockCreateUser.mockResolvedValue([true, null]) // Успешное создание
    mockGetTranslation.mockResolvedValue(mockTranslationResult)
    mockIsRussian.mockReturnValue(false)
    mockGetReferalsCountAndUserData.mockResolvedValue(mockReferalsResult)
    // mockGetPhoto уже не нужен здесь, т.к. photoUrl передается в inputData

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(true) // Ожидаем успешного выполнения
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('12345')
    // Вызов getReferalsCountAndUserData для нового пользователя без инвайта НЕ нужен по новой логике
    // expect(mockGetReferalsCountAndUserData).toHaveBeenCalledWith('12345') // Проверяем вызов для ID пользователя, если нет инвайт кода (логика изменилась?)
    expect(mockGetReferalsCountAndUserData).not.toHaveBeenCalled() // Убедимся, что для реферала НЕ вызывалось

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram_id: '12345',
        username: 'testuser',
        bot_name: 'test_bot_username',
        photo_url: 'mock_photo_url',
        inviter: null,
      }),
      null // Передаем null вместо ctx
    )
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      '✅ Avatar created successfully! Welcome!'
    ) // Проверка сообщения о создании

    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      bot_name: 'test_bot_username',
      language_code: 'en',
    })
    expect(mockIsRussian).toHaveBeenCalledWith('en')
    expect(mockDependencies.replyWithPhoto).toHaveBeenCalledWith(
      mockTranslationResult.url,
      {
        caption: mockTranslationResult.translation,
      }
    )
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      expect.stringContaining('Watch this [tutorial video]'), // Проверяем англ. текст туториала
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
    // Проверяем уведомление админа (без реферала)
    expect(mockDependencies.sendMessage).toHaveBeenCalledWith(
      process.env.SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(`🔗 Новый пользователь @testuser (ID: 12345)`)
    )
    expect(mockDependencies.sendMessage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('по реф. от')
    )
  })

  it('should handle an existing user correctly', async () => {
    // 1. Arrange
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

    const mockUserDetailsResult = { isExist: true } // Пользователь существует
    const mockTranslationResult = {
      translation: 'С возвращением!',
      url: 'возврат_фото_url',
    }

    mockGetUserDetailsSubscription.mockResolvedValue(mockUserDetailsResult)
    mockGetTranslation.mockResolvedValue(mockTranslationResult)
    mockIsRussian.mockReturnValue(true) // Русский язык

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(true)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('54321')
    expect(mockCreateUser).not.toHaveBeenCalled() // Создание не должно вызываться
    expect(mockGetReferalsCountAndUserData).not.toHaveBeenCalled() // Рефералы не должны проверяться

    expect(mockDependencies.reply).not.toHaveBeenCalledWith(
      expect.stringContaining('Аватар успешно создан')
    ) // Сообщения о создании быть не должно

    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      bot_name: 'test_bot_username',
      language_code: 'ru',
    })
    expect(mockIsRussian).toHaveBeenCalledWith('ru')
    expect(mockDependencies.replyWithPhoto).toHaveBeenCalledWith(
      mockTranslationResult.url,
      {
        caption: mockTranslationResult.translation,
      }
    )
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      expect.stringContaining('Посмотрите [видео-инструкцию]'), // Проверяем русский текст туториала
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
    // Проверяем уведомление админа (перезапуск)
    expect(mockDependencies.sendMessage).toHaveBeenCalledWith(
      process.env.SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(
        `🔄 Пользователь @existinguser (ID: 54321) перезапустил бота`
      )
    )
  })

  it('should handle a new user with a referral code', async () => {
    // 1. Arrange
    const inputData: ProcessStartData = {
      telegramId: '13579',
      username: 'refuser',
      firstName: 'Ref',
      languageCode: 'ru',
      inviteCode: '98765', // Код приглашения
      botName: 'test_bot_username',
      photoUrl: 'ref_photo_url',
      chatId: 13579,
    }
    const mockUserDetailsResult = { isExist: false }
    const mockTranslationResult = {
      translation: 'Привет по рефералу!',
      url: 'реф_фото',
    }
    const mockReferalsResult = {
      count: 5,
      userData: { user_id: 'ref_user_id', username: 'referrer' },
    }

    mockGetUserDetailsSubscription.mockResolvedValue(mockUserDetailsResult)
    mockCreateUser.mockResolvedValue([true, null])
    mockGetTranslation.mockResolvedValue(mockTranslationResult)
    mockIsRussian.mockReturnValue(true)
    mockGetReferalsCountAndUserData.mockResolvedValue(mockReferalsResult) // Мок для рефералов

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(true)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('13579')
    expect(mockGetReferalsCountAndUserData).toHaveBeenCalledWith('98765') // Проверяем вызов с inviteCode

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ inviter: 'ref_user_id' }), // Проверяем ID пригласившего
      null
    )
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      '✅ Аватар успешно создан! Добро пожаловать!'
    )

    // Уведомление рефереру
    expect(mockDependencies.sendMessage).toHaveBeenCalledWith(
      '98765', // ID реферера (из inviteCode)
      expect.stringContaining(
        `🔗 Новый пользователь @refuser зарегистрировался по вашей ссылке.\n🆔 Уровень: 5`
      )
    )
    // Уведомление админу (с рефералом)
    expect(mockDependencies.sendMessage).toHaveBeenCalledWith(
      process.env.SUBSCRIBE_CHANNEL_ID,
      expect.stringContaining(
        `🔗 Новый пользователь @refuser (ID: 13579) по реф. от @referrer`
      )
    )

    expect(mockGetTranslation).toHaveBeenCalledWith({
      key: 'start',
      bot_name: 'test_bot_username',
      language_code: 'ru',
    })
    expect(mockDependencies.replyWithPhoto).toHaveBeenCalledWith(
      mockTranslationResult.url,
      {
        caption: mockTranslationResult.translation,
      }
    )
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      expect.stringContaining('Посмотрите [видео-инструкцию]'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    )
  })

  it('should return false and reply on user check error', async () => {
    // 1. Arrange
    const inputData: ProcessStartData = {
      telegramId: 'err1',
      botName: 'b',
      languageCode: 'en',
    }
    const testError = new Error('DB Check Failed')
    mockGetUserDetailsSubscription.mockRejectedValue(testError)

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(false)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('err1')
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      '❌ An error occurred while loading data. Please try again later.'
    )
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('Error checking user details'),
      expect.objectContaining({ error: testError })
    )
  })

  it('should return false and reply on user creation error', async () => {
    // 1. Arrange
    const inputData: ProcessStartData = {
      telegramId: 'err2',
      botName: 'b',
      languageCode: 'ru',
    }
    const mockUserDetailsResult = { isExist: false }
    const testError = new Error('DB Create Failed')
    mockGetUserDetailsSubscription.mockResolvedValue(mockUserDetailsResult)
    mockCreateUser.mockRejectedValue(testError)
    mockGetReferalsCountAndUserData.mockResolvedValue({
      count: 0,
      userData: {},
    })

    // 2. Act
    const result = await processStartCommand(inputData, mockDependencies)

    // 3. Assert
    expect(result).toBe(false)
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('err2')
    expect(mockCreateUser).toHaveBeenCalled()
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      '❌ An error occurred during registration. Please try again later.'
    )
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.stringContaining('Error creating user'),
      expect.objectContaining({ error: testError })
    )
  })
})
