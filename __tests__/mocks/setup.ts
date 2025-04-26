import { vi } from 'vitest'
import type { Mock } from 'vitest'
import { MemorySessionStore } from '../helpers/MemorySessionStore'

// Mock process.env before other imports that might use it
process.env.SUBSCRIBE_CHANNEL_ID = '-1001234567890' // Replace with a realistic mock ID
process.env.ADMIN_IDS_ARRAY = '["123456789", "987654321"]'
process.env.BOT_TOKEN = 'mock_bot_token'
// Add other necessary environment variables here

// --- Создаем вручную наш мок для Markup, который будет использоваться всеми тестами ---
const MockMarkup = {
  keyboard: (buttons: any[][]) => ({
    resize: () => ({
      reply_markup: { keyboard: buttons, resize_keyboard: true },
    }),
    oneTime: () => ({
      reply_markup: { keyboard: buttons, one_time_keyboard: true },
    }),
  }),
  inlineKeyboard: (buttons: any[][]) => ({
    reply_markup: { inline_keyboard: buttons },
  }),
  removeKeyboard: () => ({
    reply_markup: { remove_keyboard: true },
  }),
  forceReply: () => ({
    reply_markup: { force_reply: true },
  }),
}

// --- Мокируем модуль telegraf перед объявлением других переменных ---
vi.mock('telegraf', () => {
  return {
    Telegraf: vi.fn().mockImplementation(() => ({
      use: vi.fn(),
      start: vi.fn(),
      command: vi.fn(),
      action: vi.fn(),
      launch: vi.fn(),
      catch: vi.fn(),
      on: vi.fn(),
    })),
    Markup: MockMarkup,
    Scenes: {
      WizardScene: vi.fn().mockImplementation(() => ({
        enter: vi.fn(),
        leave: vi.fn(),
        command: vi.fn(),
        action: vi.fn(),
        on: vi.fn(),
      })),
      Stage: vi.fn().mockImplementation(() => ({
        register: vi.fn(),
      })),
    },
    session: vi.fn(),
  }
})

// --- Объявление переменных для мок-функций ---
// Мы экспортируем их, чтобы тесты могли их настраивать
export let mockGetUserDetailsSubscription: Mock
export let mockCreateUser: Mock
export let mockGetReferalsCountAndUserData: Mock
export let mockGetTranslation: Mock
export let mockIsRussian: Mock
export let mockSendMessage: Mock
export let mockGetBotByName: Mock
export let mockMainMenu: Mock
export let mockGetPhotoUrl: Mock
export let mockLoggerInfo: Mock
export let mockLoggerWarn: Mock
export let mockLoggerError: Mock
export let mockCallApi: Mock

// --- Функция инициализации моков (будет вызываться в beforeEach тестов) ---
export function initializeMocks() {
  mockGetUserDetailsSubscription = vi.fn()
  mockCreateUser = vi.fn()
  mockGetReferalsCountAndUserData = vi.fn()
  mockGetTranslation = vi.fn()
  mockIsRussian = vi.fn()
  mockSendMessage = vi.fn()
  mockGetBotByName = vi.fn()
  mockMainMenu = vi
    .fn()
    .mockReturnValue(MockMarkup.keyboard([['mock_level0_button']]).resize())
  mockGetPhotoUrl = vi.fn()
  mockLoggerInfo = vi.fn()
  mockLoggerWarn = vi.fn()
  mockLoggerError = vi.fn()
  mockCallApi = vi.fn().mockResolvedValue({ ok: true, result: {} })
}

// --- Непосредственное мокирование модулей с использованием фабрик ---
// Фабрики ссылаются на экспортируемые переменные
vi.mock('@/core/supabase/getUserDetailsSubscription', () => ({
  getUserDetailsSubscription: (...args: any[]) =>
    mockGetUserDetailsSubscription(...args),
}))
// Removed global mock for user module
// vi.mock('@/core/supabase/user', () => ({
//   createUser: (...args: any[]) => mockCreateUser(...args),
// }))
vi.mock('@/core/supabase/referral', () => ({
  getReferalsCountAndUserData: (...args: any[]) =>
    mockGetReferalsCountAndUserData(...args),
}))
vi.mock('@/utils/localization', () => ({
  getTranslation: (...args: any[]) => mockGetTranslation(...args),
}))
vi.mock('@/menu/index', () => ({
  startMenu: MockMarkup.keyboard([]).resize(),
}))
vi.mock('@/menu/mainMenu', () => ({
  mainMenu: (...args: any[]) => mockMainMenu(...args),
  levels: {
    103: { title_ru: 'Техподдержка', title_en: 'Support' },
    105: { title_ru: 'Оформить подписку', title_en: 'Subscribe' },
  },
}))
vi.mock('@/helpers/language', () => ({
  isRussian: (...args: any[]) => mockIsRussian(...args),
}))
vi.mock('@/core/bot/index', () => ({
  BOT_URLS: { ai_koshey_bot: 'some_tutorial_url' },
  bots: [
    {
      telegram: { sendMessage: (...args: any[]) => mockSendMessage(...args) },
      options: { username: 'ai_koshey_bot' },
    },
  ],
  getBotByName: (...args: any[]) => mockGetBotByName(...args),
}))
vi.mock('@/handlers/getPhotoUrl', () => ({
  getPhotoUrl: (...args: any[]) => mockGetPhotoUrl(...args),
}))
vi.mock('@/utils/logger', () => {
  // Мок для логгера
  const mockLoggerInfoFn = vi.fn()
  const mockLoggerWarnFn = vi.fn()
  const mockLoggerErrorFn = vi.fn()
  const mockLoggerDebugFn = vi.fn()
  const mockLoggerHttpFn = vi.fn()

  return {
    logger: {
      info: mockLoggerInfoFn,
      warn: mockLoggerWarnFn,
      error: mockLoggerErrorFn,
      debug: mockLoggerDebugFn,
      http: mockLoggerHttpFn,
    },
    // Экспортируем моки для проверок в тестах
    __mocks: {
      mockLoggerInfo: mockLoggerInfoFn,
      mockLoggerWarn: mockLoggerWarnFn,
      mockLoggerError: mockLoggerErrorFn,
      mockLoggerDebug: mockLoggerDebugFn,
      mockLoggerHttp: mockLoggerHttpFn,
    },
  }
})

// Экспортируем MockMarkup для использования в тестах
export { MockMarkup }

console.log('--- Mocks setup file loaded ---')
