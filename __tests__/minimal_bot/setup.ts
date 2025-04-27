// __tests__/minimal_bot/setup.ts
import { vi } from 'vitest'

// Set a dummy token for the test environment
process.env.BOT_TOKEN = 'test-token'

console.log('--- Minimal Mocks Setup --- ')

// Store registered command handlers
export const mockCommandHandlers: Record<string, Function> = {}

// Minimal Telegraf mock for button test
vi.mock('telegraf', async importOriginal => {
  const original = await importOriginal<typeof import('telegraf')>()

  // Mock Markup specifically for inlineKeyboard and button.callback
  const mockMarkup = {
    // Restore returning the object with the correct key
    inlineKeyboard: vi.fn(buttons => ({ inline_keyboard: buttons })),
    button: {
      callback: vi.fn((text, data) => ({ text: text, callback_data: data })),
      // Add other button types if needed by the handler
    },
    // Add other Markup methods if the handler uses them (e.g., keyboard)
    keyboard: vi.fn().mockReturnValue({ resize: vi.fn(), oneTime: vi.fn() }), // Basic mock if needed
    removeKeyboard: vi.fn(),
    forceReply: vi.fn(),
  }

  // Mock the Telegraf class constructor and methods used by the bot setup
  const mockBotInstance = {
    // Store the handler when command is registered
    command: vi.fn((commandName, handler) => {
      mockCommandHandlers[commandName] = handler
    }),
    catch: vi.fn(),
    // Add other methods like use, action, on, launch, stop if they were used in bot.ts
  }
  const TelegrafMock = vi.fn(() => mockBotInstance)

  return {
    ...original, // Keep other exports like Types
    Telegraf: TelegrafMock,
    Markup: mockMarkup,
  }
})

// Mock logger if the handler uses it
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))
