import { vi, Mock } from 'vitest'
import { Markup } from 'telegraf'
import { MemorySessionStore } from '../helpers/MemorySessionStore'
import { logger } from '@/utils/logger'

// Mock process.env before other imports that might use it
process.env.SUBSCRIBE_CHANNEL_ID = '-1001234567890' // Replace with a realistic mock ID
process.env.ADMIN_IDS_ARRAY = '["123456789", "987654321"]'
process.env.BOT_TOKEN = 'mock_bot_token'
// Add other necessary environment variables here

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
    .mockReturnValue(Markup.keyboard([['mock_level0_button']]).resize())
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
  startMenu: Markup.keyboard([]).resize(),
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
  const mockLoggerInfo = vi.fn()
  const mockLoggerWarn = vi.fn()
  const mockLoggerError = vi.fn()
  const mockLoggerDebug = vi.fn()
  const mockLoggerHttp = vi.fn()

  return {
    logger: {
      info: mockLoggerInfo,
      warn: mockLoggerWarn,
      error: mockLoggerError,
      debug: mockLoggerDebug,
      http: mockLoggerHttp,
    },
    // Экспортируем моки для проверок в тестах
    __mocks: {
      mockLoggerInfo,
      mockLoggerWarn,
      mockLoggerError,
      mockLoggerDebug,
      mockLoggerHttp,
    },
  }
})

// Мокируем Telegraf API вызовы (необязательно, если используем interceptors)
// vi.mock('telegraf', async (importOriginal) => {
//   const actual = await importOriginal<typeof import('telegraf')>()
//   actual.Telegraf.prototype.callApi = mockCallApi;
//   return actual;
// });

console.log('--- Mocks setup file loaded ---')
