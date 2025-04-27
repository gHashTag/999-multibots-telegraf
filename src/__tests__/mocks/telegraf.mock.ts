// src/__tests__/mocks/telegraf.mock.ts
import { vi } from 'vitest'

// Store registered command handlers globally
export const mockCommandHandlers: Record<string, Function> = {}
// Store other handlers if needed (e.g., action, hears)

// Set a dummy token for the test environment globally
// Consider moving this to a .env.test file and loading it in vitest.config.mts
process.env.BOT_TOKEN = 'test-token'

// Global Telegraf mock
vi.mock('telegraf', async importOriginal => {
  const original = await importOriginal<typeof import('telegraf')>()

  // --- Мок для bot.telegram ---
  const mockTelegram = {
    callApi: vi.fn(async (method, payload) => {
      console.log(`Mock Telegram API call: ${method}`, payload)
      // Базовая имитация ответа для getMe
      if (method === 'getMe') {
        return {
          id: 1,
          is_bot: true,
          first_name: 'MockBot',
          username: 'mock_bot',
        }
      }
      // Возвращаем пустой объект или true для других вызовов по умолчанию
      return {}
    }),
    // Добавить другие методы telegram по необходимости (sendMessage, etc.)
  }
  // ---------------------------

  // Mock Markup
  const mockMarkup = {
    inlineKeyboard: vi.fn(buttons => ({ inline_keyboard: buttons })),
    button: {
      callback: vi.fn((text, data) => ({ text: text, callback_data: data })),
      // Add other button types if needed by the handler
    },
    keyboard: vi.fn().mockReturnValue({ resize: vi.fn(), oneTime: vi.fn() }),
    removeKeyboard: vi.fn(),
    forceReply: vi.fn(),
  }

  // Mock the Telegraf class instance methods
  const mockBotInstance = {
    command: vi.fn((commandName, handler) => {
      if (typeof commandName === 'string') {
        mockCommandHandlers[commandName] = handler
      } else if (Array.isArray(commandName)) {
        commandName.forEach(cmd => (mockCommandHandlers[cmd] = handler))
      }
    }),
    action: vi.fn(),
    hears: vi.fn(),
    on: vi.fn(),
    use: vi.fn((...args: any[]) => {
      // Простая имитация вызова middleware, если нужно
      console.log('Middleware registered with bot.use')
      // В реальном тесте может потребоваться более сложная логика
    }),
    catch: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    // Добавляем мок для telegram
    telegram: mockTelegram,
    // Добавляем базовый context для bot.context() в тесте
    context: (update: any) => ({
      update,
      telegram: mockTelegram,
      reply: vi.fn(),
      // ... другие базовые свойства контекста ...
    }),
  }

  // Mock the Telegraf constructor
  const TelegrafMock = vi.fn(() => mockBotInstance)

  return {
    ...original,
    Telegraf: TelegrafMock,
    Markup: mockMarkup,
    // Экспортируем session как есть, если он не требует сложного мокирования
    session: original.session,
  }
})

console.log('--- Global Telegraf Mock Initialized ---')
