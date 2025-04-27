// __tests__/minimal_bot/button.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  // handleTestButtonCommand, // No longer needed directly
  testButtonCallbackData,
  testButtonCommand, // Import command name
} from '@/minimal_bot/button_handler'
import type { MyContext } from '@/interfaces/context.interface'
import type { Mock } from 'vitest'
import { logger } from '@/utils/logger'
import { mockCommandHandlers } from './setup' // Import handler storage
import '@/minimal_bot/bot' // Import bot to trigger command registration

// Mock the logger
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Minimal mock context specifically for this test
const createMinimalMockContext = (
  overrides: Partial<MyContext> = {}
): MyContext => {
  const defaultContext: Partial<MyContext> = {
    reply: vi.fn().mockResolvedValue(true),
    // Add other minimal properties if needed by the handler
    from: { id: 1, is_bot: false, first_name: 'Test' },
    chat: { id: 1, type: 'private' },
  }
  return { ...defaultContext, ...overrides } as MyContext
}

describe('Minimal Button Test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear handlers between tests if needed, though unlikely here
    // Object.keys(mockCommandHandlers).forEach(key => delete mockCommandHandlers[key]);
  })

  it('should reply with text and an inline button', async () => {
    const ctx = createMinimalMockContext()
    const expectedText = 'Press the button!'
    const expectedButtonText = 'Test Me'
    const expectedErrorText = 'Произошла ошибка.'

    // Get the registered handler
    const handler = mockCommandHandlers[testButtonCommand]
    expect(handler).toBeDefined() // Ensure handler was registered

    // Call the registered handler
    await handler(ctx)

    expect(ctx.reply).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()

    const replyArgs = (ctx.reply as Mock).mock.calls[0]
    expect(replyArgs).toBeDefined()
    expect(Array.isArray(replyArgs)).toBe(true)
    expect(replyArgs).toHaveLength(2)

    const replyText = replyArgs[0]
    const replyMarkup = replyArgs[1]

    expect(replyText).toBe(expectedText)
    expect(replyText).not.toBe(expectedErrorText)

    expect(replyMarkup).toBeDefined()
    expect(replyMarkup.inline_keyboard).toBeDefined()
    expect(replyMarkup.inline_keyboard).toHaveLength(1)
    expect(replyMarkup.inline_keyboard[0]).toHaveLength(1)
    expect(replyMarkup.inline_keyboard[0][0].text).toBe(expectedButtonText)
    expect(replyMarkup.inline_keyboard[0][0].callback_data).toBe(
      testButtonCallbackData
    )
  })
})
