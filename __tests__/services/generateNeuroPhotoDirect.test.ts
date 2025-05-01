import {
  describe,
  test as it,
  expect,
  mock,
  jest,
  beforeEach,
  afterEach,
} from 'bun:test'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { mockGetBotByName } from '../setup' // Импортируем мок из setup.ts

// --- Используем bun:test API для мокирования модулей ---
mock.module('@/utils/logger', () => ({
  logger: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
  },
}))
mock.module('@/core/supabase', () => ({
  getUserByTelegramId: mock(),
  getAspectRatio: mock(),
  savePromptDirect: mock(),
  updateUserLevelPlusOne: mock(),
  // Добавьте другие мокированные функции из @/core/supabase, если они нужны
}))
mock.module('@/core/supabase/directPayment', () => ({
  directPaymentProcessor: mock(),
}))
mock.module('@/core/replicate', () => ({
  replicate: {
    run: mock(),
  },
}))
// ------------------------------------------------------

import { generateNeuroPhotoDirect } from '@/services/generateNeuroPhotoDirect'
import { logger } from '@/utils/logger'
import * as supabaseCore from '@/core/supabase'
import * as paymentProcessor from '@/core/supabase/directPayment'
import * as replicateCore from '@/core/replicate'
import * as priceCalculator from '@/price/calculator'
// Импорт getBotByName не нужен, т.к. мок глобальный
import { SceneContext, WizardContext } from 'telegraf/scenes'
import { Update } from 'telegraf/types'

// Define types for mocked modules for better type safety (optional but recommended)
type MockedSupabaseCore = {
  [K in keyof typeof supabaseCore]: any // Use any for now
}
type MockedPaymentProcessor = {
  [K in keyof typeof paymentProcessor]: any // Use any for now
}
type MockedReplicateCore = {
  replicate: { run: any } // Use any for now
}
type MockedLogger = {
  logger: {
    info: any // Use any for now
    warn: any // Use any for now
    error: any // Use any for now
    debug: any // Use any for now
  }
}

describe('generateNeuroPhotoDirect', () => {
  // Use imported mocks with type casting
  const mockedSupabase = supabaseCore as MockedSupabaseCore
  const mockedPaymentProcessor = paymentProcessor as MockedPaymentProcessor
  const mockedReplicate = replicateCore as MockedReplicateCore
  const mockedLogger = logger as unknown as MockedLogger['logger'] // Cast logger

  const mockCtx = {
    from: { id: 12345, username: 'testuser', language_code: 'ru' },
    session: {},
    scene: {} as SceneContext,
    wizard: {} as WizardContext,
    update: {} as Update,
    reply: mock(), // Use mock() directly
    state: {},
  } as unknown as MyContext

  // Объявим локальный mockBotInstance, если он нужен для дефолтного значения
  const localMockSendMessage = mock() // Use mock()
  const localMockTelegram = { sendMessage: localMockSendMessage }
  const localMockBotInstance = {
    telegram: localMockTelegram,
  } as unknown as Telegraf<MyContext>

  const model_url = 'test_model_url'
  const numImages = 1
  const telegram_id = '12345'
  const botName = 'test_bot'

  beforeEach(() => {
    // Mocks created with mock() are reset automatically
    // Need to manually reset implementations for module mocks if they were changed in tests
    // or rely on mock.restore() in afterEach if full isolation is needed per test.
    // For now, we re-assign mock implementations here as was done before.

    // --- Переназначаем реализации для моков из setup (если нужно) ---
    // mockGetBotByName.mockReturnValue(...)
    // ...

    // --- Мокируем реализации для локальных моков ---
    mockedSupabase.getUserByTelegramId.mockResolvedValue({
      /* ... */
    } as any)
    mockedPaymentProcessor.directPaymentProcessor.mockResolvedValue({
      success: true,
      balanceChange: { before: 100, after: 90, difference: -10 },
      operation_id: 'op-12345',
    })
    mockedReplicate.replicate.run.mockResolvedValue([
      'http://example.com/image.png',
    ])
    mockedSupabase.getAspectRatio.mockResolvedValue('1:1')
    mockedSupabase.savePromptDirect.mockResolvedValue(1)
    mockedSupabase.updateUserLevelPlusOne.mockResolvedValue({
      data: null,
      error: null,
    } as any)
    mockGetBotByName.mockReturnValue({ bot: localMockBotInstance, error: null }) // Using global mock
    // Reset logger mocks (since they are module mocks)
    mockedLogger.info.mockClear()
    mockedLogger.warn.mockClear()
    mockedLogger.error.mockClear()
    mockedLogger.debug.mockClear()
    // Also reset other module mocks if necessary
    mockedSupabase.getUserByTelegramId.mockClear()
    // ... clear other mocks ...
  })

  // Optional: Add afterEach to restore module mocks if needed between tests
  // afterEach(() => {
  //   mock.restore(); // Restores original module implementations
  // });

  it('should throw an error if prompt is empty', async () => {
    const prompt = ''
    await expect(
      generateNeuroPhotoDirect(
        prompt,
        model_url,
        numImages,
        telegram_id,
        mockCtx,
        botName
      )
    ).rejects.toThrow('Prompt not found')

    // Проверяем вызов мока логгера
    expect(mockedLogger.error).toHaveBeenCalledWith(
      // Use the typed mock
      expect.objectContaining({
        message: '❌ [DIRECT] Отсутствует промпт для генерации',
      })
    )
  })

  it('should throw an error if model_url is empty', async () => {
    const prompt = 'a valid prompt'
    const model_url_empty = ''

    await expect(
      generateNeuroPhotoDirect(
        prompt,
        model_url_empty, // Используем пустой model_url
        numImages,
        telegram_id,
        mockCtx,
        botName
      )
    ).rejects.toThrow('Model URL not found')

    // Verify logger was called
    expect(mockedLogger.error).toHaveBeenCalledWith(
      // Use the typed mock
      expect.objectContaining({
        message: '❌ [DIRECT] Отсутствует URL модели для генерации',
      })
    )
  })

  it('should throw an error if bot is not found', async () => {
    const prompt = 'a valid prompt'
    // Используем импортированный мок для переопределения
    mockGetBotByName.mockReturnValue({
      bot: null,
      error: 'Bot not found error',
    })

    await expect(
      generateNeuroPhotoDirect(
        prompt,
        model_url,
        numImages,
        telegram_id,
        mockCtx,
        botName
      )
    ).rejects.toThrow(`Bot with name ${botName} not found`)

    expect(mockedLogger.error).toHaveBeenCalledWith(
      // Use the typed mock
      expect.objectContaining({
        message: '❌ [DIRECT] Бот не найден',
        error: 'Bot not found error',
        botName: botName,
      })
    )
  })

  // Add more tests here...
})
