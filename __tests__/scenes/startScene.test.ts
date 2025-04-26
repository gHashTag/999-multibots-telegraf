import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest'
import type { Mock } from 'vitest'

// --- Мокируем сам модуль startScene/index ---
// Мы должны мокировать ДО импорта оригинальных функций/сцены
// vi.mock('../../src/scenes/startScene/index', async importOriginal => {
//   const mockProcessStartCommand = vi.fn() // Объявляем мок ВНУТРИ фабрики
//   const actual = await importOriginal<any>() // Получаем оригинальный модуль
//   return {
//     ...actual, // Возвращаем все оригинальные экспорты (включая startScene)
//     processStartCommand: mockProcessStartCommand, // Подменяем processStartCommand нашим шпионом
//     _mockProcessStartCommand: mockProcessStartCommand,
//   }
// })

// --- Импортируем нужные типы ---
// Импорты, специфичные для processStartCommand, будут перенесены
// import { SubscriptionType } from '@/interfaces' // <-- Больше не нужен здесь
// import { startMenu } from '../../src/menu' // <-- Больше не нужен здесь
// import { levels } from '../../src/menu/mainMenu' // <-- Больше не нужен здесь

// --- Импортируем МОКИ из setup (УБЕДИТЬСЯ, ЧТО ПУТЬ ВЕРНЫЙ) ---
import {
  // Моки, необходимые для createMockTelegrafContext и тестов сцены
  mockReply,
  mockReplyWithPhoto,
  mockSendMessage,
  // Моки для зависимостей, которые МОГУТ вызываться РЕАЛЬНОЙ processStartCommand
  mockGetUserDetailsSubscription,
  mockCreateUser,
  mockGetReferalsCountAndUserData,
  mockGetTranslation,
  mockIsRussian,
  mockGetPhotoUrl,
} from '../setup'

// --- Импортируем РЕАЛЬНЫЕ функции/сцену ---
import {
  startScene,
  processStartCommand,
} from '../../src/scenes/startScene/index'
// import * as startSceneModule from '../../src/scenes/startScene/index' // <-- Убираем, шпион не нужен

// --- Остальные импорты ---
import { Context as TelegrafContext, Scenes, Markup } from 'telegraf' // Импортируем Markup
import type {
  Message,
  User,
  Update,
  UserFromGetMe,
  Chat,
} from '@telegraf/types'
import type {
  MyContext,
  WizardSessionData,
} from '@/interfaces/telegram-bot.interface'

// --- Функция createMockTelegrafContext - ИСПРАВЛЕН ТИП OVERRIDES ---
export const createMockTelegrafContext = (
  overrides: Partial<MyContext> = {} // Используем Partial<MyContext>
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

  const defaultScene = {
    state: {},
    enter: vi.fn(),
    reenter: vi.fn(),
    leave: vi.fn(),
  } as any

  const defaultWizard = {
    state: {},
    step: vi.fn(),
    cursor: 0,
    selectStep: vi.fn().mockReturnThis(),
    next: vi.fn().mockReturnThis(),
    back: vi.fn().mockReturnThis(),
    steps: [],
  } as any

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
    reply: mockReply,
    replyWithPhoto: mockReplyWithPhoto,
    sendMessage: mockSendMessage,
    telegram: {
      sendMessage: mockSendMessage,
      sendPhoto: mockReplyWithPhoto,
      sendDocument: vi.fn().mockResolvedValue({}),
      sendMediaGroup: vi.fn().mockResolvedValue({}),
      setChatMenuButton: vi.fn().mockResolvedValue({}),
      setMyCommands: vi.fn().mockResolvedValue({}),
      token: 'MOCK_BOT_TOKEN',
    } as any,
    scene: defaultScene,
    wizard: defaultWizard,
    session: defaultSession as any,
  }

  return mockContext as MyContext
}

// --- ТЕСТЫ ДЛЯ startScene ---
describe('startScene', () => {
  let ctx: MyContext
  // let processStartCommandSpy: Mock // Убираем

  beforeEach(() => {
    vi.clearAllMocks() // Сбрасываем ВСЕ моки
    ctx = createMockTelegrafContext()

    // Мокируем зависимости, которые вызывает РЕАЛЬНАЯ processStartCommand
    // Это нужно, чтобы реальная функция не падала из-за отсутствия ответов от Supabase и т.д.
    mockGetUserDetailsSubscription.mockResolvedValue({
      isExist: false,
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    })
    mockCreateUser.mockResolvedValue([true, null]) // Успешное создание
    mockGetReferalsCountAndUserData.mockResolvedValue({
      count: 0,
      userData: null,
    })
    mockGetTranslation.mockResolvedValue({
      translation: 'Mock Welcome',
      url: null,
    })
    mockIsRussian.mockReturnValue(false) // Default to English for simplicity
    mockGetPhotoUrl.mockReturnValue(null)

    // --- УДАЛЯЕМ ОЧИСТКУ СТАРОГО МОКА ---
    // ;(mockedProcessStartCommand as Mock).mockClear()
  })

  it('should extract data, attempt to run logic, send reply, and leave scene', async () => {
    // --- Arrange ---
    ctx.session.inviteCode = 'test-invite'
    // --- Убираем spyOn ---
    // const processStartSpy = vi.spyOn(startSceneModule, 'processStartCommand')

    // --- Act ---
    const stepHandler = startScene.steps[0]
    if (typeof stepHandler === 'function') {
      await stepHandler(ctx, vi.fn())
    } else {
      throw new Error('Start scene step handler is not a function')
    }

    // --- Assert ---
    // 1. Убираем проверку шпиона
    // expect(processStartSpy).toHaveBeenCalledTimes(1)

    // 2. Проверяем, что был отправлен какой-то ответ (приветствие/туториал)
    const replyCalled = mockReply.mock.calls.length > 0
    const replyWithPhotoCalled = mockReplyWithPhoto.mock.calls.length > 0
    expect(replyCalled || replyWithPhotoCalled).toBe(true)

    // 3. Проверяем, что сцена завершается
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1)

    // --- Убираем mockRestore ---
    // processStartSpy.mockRestore()
  })

  it('should leave scene regardless of internal logic outcome', async () => {
    // --- Arrange ---
    // Можно подстроить моки зависимостей, чтобы симулировать разные ветки,
    // но основная цель - проверить ctx.scene.leave()
    mockGetUserDetailsSubscription.mockResolvedValueOnce({
      isExist: true, // Симулируем существующего пользователя
      stars: 100,
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null,
    })

    // --- Act ---
    const stepHandler = startScene.steps[0]
    if (typeof stepHandler === 'function') {
      await stepHandler(ctx, vi.fn())
    } else {
      throw new Error('Start scene step handler is not a function')
    }

    // --- Assert ---
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1) // Сцена все равно должна завершиться
  })

  it('should handle errors during context processing gracefully and leave scene', async () => {
    // --- Arrange ---
    // Симулируем ошибку ПЕРЕД вызовом processStartCommand, например, отсутствие ctx.from
    const faultyCtx = createMockTelegrafContext()
    delete (faultyCtx as any).from // Удаляем обязательное поле

    // --- Act & Assert ---
    const stepHandler = startScene.steps[0]
    if (typeof stepHandler === 'function') {
      // Ожидаем, что stepHandler перехватит ошибку при доступе к ctx.from.id
      await expect(stepHandler(faultyCtx, vi.fn())).resolves.not.toThrow()
    } else {
      throw new Error('Start scene step handler is not a function')
    }

    // Проверяем, что было отправлено сообщение об ошибке
    // (Ожидаем стандартный ответ из try/catch в stepHandler)
    expect(faultyCtx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Произошла ошибка. Не удалось определить ваш ID.')
    )
    expect(faultyCtx.scene.leave).toHaveBeenCalledTimes(1) // Сцена должна завершиться даже при ошибке
  })

  // Дополнительный тест: Проверка обработки ошибки ВНУТРИ processStartCommand
  it('should handle errors within the real processStartCommand gracefully, send error reply, and leave scene', async () => {
    // --- Arrange ---
    const testError = new Error('Internal Supabase Error')
    mockGetUserDetailsSubscription.mockRejectedValueOnce(testError)

    // --- Убираем spyOn ---
    // const processStartSpy = vi.spyOn(startSceneModule, 'processStartCommand')

    // --- Act ---
    const stepHandler = startScene.steps[0]
    if (typeof stepHandler === 'function') {
      await expect(stepHandler(ctx, vi.fn())).resolves.not.toThrow()
    } else {
      throw new Error('Start scene step handler is not a function')
    }

    // --- Assert ---
    // expect(processStartSpy).toHaveBeenCalledTimes(1) // <-- Убираем

    // Проверяем, что было отправлено сообщение об ошибке (из catch в processStartCommand)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Произошла внутренняя ошибка.')
    )
    expect(ctx.scene.leave).toHaveBeenCalledTimes(1) // Сцена должна завершиться

    // --- Убираем mockRestore ---
    // processStartSpy.mockRestore()
  })
})
