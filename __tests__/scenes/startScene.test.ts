import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest'
import type { Mock } from 'vitest'
import { startMenu } from '../../src/menu'
import { levels } from '../../src/menu/mainMenu'

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

import { Context as TelegrafContext, Scenes } from 'telegraf'
import type { Message, User, Update, UserFromGetMe, Chat } from '@telegraf/types'
import type { MyContext } from '../../src/interfaces'

// Функция для создания mock-контекста Telegraf
export const createMockTelegrafContext = (
  overrides: Partial<{
    message: Partial<Message.TextMessage>
    from: Partial<User>
    chat: Partial<Chat>
    scene: Partial<Scenes.SceneContext<MyContext>>
    wizard: Partial<Scenes.WizardContextWizard<MyContext>>
    session: Partial<Scenes.WizardSession<Scenes.WizardSessionData>>
    botInfo: Partial<UserFromGetMe>
  }> = {}
): MyContext => {
  const defaultUser: User = {
    id: 12345,
    is_bot: false,
    first_name: 'Test',
    username: 'testuser',
    language_code: 'en',
    ...overrides.from,
  }

  const defaultChat: Chat.PrivateChat = {
    id: 12345,
    type: 'private',
    first_name: 'Test',
  }

  const defaultMessage: Message.TextMessage = {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: defaultChat,
    from: defaultUser,
    text: '/start',
    ...overrides.message,
  }

  const defaultScene: Scenes.SceneContext = {
    scene: {
      enter: vi.fn(),
      leave: vi.fn(),
      reenter: vi.fn(),
      state: {},
      ctx: {} as any,
      scenes: new Map(),
      options: {},
      session: {} as any,
      steps: [],
      current: undefined,
      enterOpts: undefined,
    },
    ...overrides.scene,
  }

  const defaultWizard: Scenes.WizardContextWizard<MyContext> = {
    next: vi.fn(),
    back: vi.fn(),
    state: overrides.wizard?.state ?? {},
    step: undefined,
    cursor: 0,
    selectStep: vi.fn(),
    steps: [],
    ...overrides.wizard,
  }

  const defaultSession: Scenes.WizardSession<Scenes.WizardSessionData> = {
    __scenes: { cursor: 0 },
    ...overrides.session,
  }

  const mockContext: Partial<MyContext> = {
    botInfo: {
      id: 54321,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'test_bot_username',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      ...overrides.botInfo,
    } as UserFromGetMe,
    message: defaultMessage as any,
    from: defaultUser,
    chat: defaultChat,
    reply: vi.fn((text, extra) => {
      console.log(`Mock reply: "${text}"`, extra || '')
      return Promise.resolve({} as any)
    }),
    replyWithPhoto: vi.fn((photo, extra) => {
      console.log(
        `Mock replyWithPhoto: "${extra?.caption}"`,
        photo,
        extra || ''
      )
      return Promise.resolve({} as any)
    }),
    sendMessage: vi
      .fn()
      .mockImplementation(
        async (chatId: string | number, text: string, extra?: any) => {
          console.log(`Mock sendMessage to ${chatId}: "${text}"`, extra || '')
          return Promise.resolve({
            message_id: 1,
            date: Date.now(),
            chat: { id: Number(chatId), type: 'private' },
            text: text,
            from: defaultUser,
          } as any)
        }
      ),
    ...defaultScene,
    ...(defaultWizard as any),
    session: defaultSession as any,
  }

  return mockContext as MyContext
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
// vi.mock('../../src/menu/index')

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
      message: {
        text: '/start',
        from: {
          id: 12345,
          language_code: 'en',
          is_bot: false,
          first_name: 'Test',
        },
      },
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
      replyWithPhoto: mockCtx.replyWithPhoto,
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
    // Arrange: User check fails
    const checkError = new Error('DB connection failed')
    const mockData: ProcessStartData = {
      telegramId: 'err1',
      botName: 'test_bot_username',
    }
    // Mock getUserDetailsSubscription to throw an error
    // NOTE: The function catches the error and logs it, then returns false
    // So we expect the outer catch block in processStartCommand to trigger
    mockGetUserDetailsSubscription.mockRejectedValueOnce(checkError)
    mockIsRussian.mockReturnValue(false) // Use English for error message

    // Act
    const result = await processStartCommand(mockData, mockDependencies)
    await Promise.resolve()

    // Assert
    expect(result).toBe(false) // Should fail
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[ProcessStart] Critical error in start scene', // Expecting the outer catch
      expect.objectContaining({
        error: checkError.message,
      })
    )
    expect(mockGetUserDetailsSubscription).toHaveBeenCalledWith('err1')
    expect(mockCreateUser).not.toHaveBeenCalled()
    // Check the critical error fallback message
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      '❌ An internal error occurred. Please try again later or contact support.'
    )
    expect(mockDependencies.reply).toHaveBeenCalledTimes(1) // Only one reply expected
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

  it('should handle error during referral processing', async () => {
    // Arrange: New user with invite code, but referral check fails
    const referralError = new Error('Failed to get referral data')
    const mockData: ProcessStartData = {
      telegramId: 'newref-err',
      username: 'refErrUser',
      firstName: 'Ref',
      lastName: 'Error',
      isBot: false,
      languageCode: 'ru',
      chatId: 11111,
      inviteCode: 'REF_ERR_CODE',
      botName: 'test_bot_username',
    }
    mockGetUserDetailsSubscription.mockResolvedValueOnce({
      isExist: false,
      user: null,
    })
    const referralModule = await import('../../src/core/supabase/referral')
    ;(referralModule.getReferalsCountAndUserData as Mock).mockRejectedValueOnce(
      referralError
    )
    mockCreateUser.mockResolvedValueOnce([
      true,
      { id: 'user-uuid', telegram_id: 'newref-err' },
    ])
    mockIsRussian.mockReturnValue(true)
    // Mock only the tutorial translation
    const tutorialTextMock = '🎬 Туториал {{videoUrl}}'
    const tutorialUrlMock = 'http://tutorial.url'
    mockGetTranslation.mockResolvedValueOnce({
      translation: tutorialTextMock,
      url: tutorialUrlMock,
    })

    // Act
    const result = await processStartCommand(mockData, mockDependencies)
    await Promise.resolve()

    // Assert
    expect(result).toBe(true)
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[ProcessStart] Error processing referral logic',
      expect.objectContaining({ error: referralError })
    )
    expect(mockDependencies.sendMessage).not.toHaveBeenCalledWith(
      '-100987654321',
      expect.any(String)
    )
    expect(mockCreateUser).toHaveBeenCalledTimes(1)
    // Check for the correct welcome message
    expect(mockDependencies.reply).toHaveBeenCalledWith(
      '✅ Аватар успешно создан! Добро пожаловать!'
    )
    // Check for the tutorial message text and extra options
    const expectedTutorialMsg = `🎬 Посмотрите [видео-инструкцию](${tutorialUrlMock}), как создавать нейрофото в этом боте.\n\nВ этом видео вы научитесь тренировать свою модель (Цифровое тело аватара), создавать фотографии и получать prompt из любого фото, которым вы вдохновились.`

    expect(mockDependencies.reply).toHaveBeenNthCalledWith(
      2,
      expectedTutorialMsg,
      expect.objectContaining({
        parse_mode: 'Markdown',
        reply_markup: Markup.keyboard([
          [Markup.button.text(levels[105].title_ru)], // Subscribe
          [Markup.button.text(levels[103].title_ru)], // Support
        ]).resize().reply_markup,
      })
    )
    // Ensure reply was called exactly twice
    expect(mockDependencies.reply).toHaveBeenCalledTimes(2)
  })
})
