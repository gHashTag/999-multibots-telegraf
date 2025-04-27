import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Markup } from 'telegraf'
import { startMenu } from '@/menu/startMenu'
import { levels } from '@/menu/mainMenu'
import { createMockContext } from '../helpers/context.ts'
import { Mock } from 'vitest'

// Mock the telegraf Markup object
vi.mock('telegraf', async importOriginal => {
  const original = await importOriginal<typeof import('telegraf')>()
  return {
    ...original, // Keep original exports
    Markup: {
      keyboard: vi.fn(buttons => ({
        resize: vi.fn(() => ({
          // Mock the resize method
          // Include the buttons in the mock for assertion
          buttons: buttons,
          // Ensure resize() returns the object itself or a similar structure
          resize: vi.fn(),
        })),
        // Also include buttons directly for easier access if resize isn't called/asserted deeply
        buttons: buttons,
      })),
    },
  }
})

describe('startMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()(
      // Clear mocks for Markup specifically if needed between tests
      Markup.keyboard as Mock
    ).mockClear()
    // If you mocked resize separately, clear it too
    // vi.mocked(Markup.keyboard([]).resize).mockClear() // Example if resize was a separate mock fn
  })

  it('should reply with Russian text and button when isRu is true', async () => {
    const ctx = createMockContext()
    const isRu = true
    const expectedText = 'Добро пожаловать в главное меню!'
    // Ensure levels[104] exists and has title_ru
    const expectedButtonText = levels[104]?.title_ru
    expect(
      expectedButtonText,
      'levels[104].title_ru should exist'
    ).toBeDefined()

    // Mock the reply function on the context
    ctx.reply = vi.fn()

    // ACT
    await startMenu(ctx as any, isRu)

    // ASSERT
    expect(ctx.reply).toHaveBeenCalledTimes(1)

    // Check the arguments passed to reply
    const [replyText, replyMarkup] = (ctx.reply as Mock).mock.calls[0]

    expect(replyText).toBe(expectedText)

    // Check the structure of the keyboard markup returned by the mock
    expect(replyMarkup).toBeDefined()
    // Check the buttons property we added to the mock in setup.ts
    expect(replyMarkup.buttons).toEqual([[expectedButtonText]])
    // Check if the resize method exists on the returned object (from the mock)
    expect(replyMarkup.resize).toBeDefined()
    expect(typeof replyMarkup.resize).toBe('function')

    // Optionally, if the mock for resize returns the object itself:
    // expect(replyMarkup.resize()).toBe(replyMarkup);
  })

  it('should reply with English text and button when isRu is false', async () => {
    const ctx = createMockContext()
    const isRu = false
    const expectedText = 'Welcome to the main menu!'
    // Ensure levels[104] exists and has title_en
    const expectedButtonText = levels[104]?.title_en
    expect(
      expectedButtonText,
      'levels[104].title_en should exist'
    ).toBeDefined()

    // Mock the reply function on the context
    ctx.reply = vi.fn()

    // ACT
    await startMenu(ctx as any, isRu)

    // ASSERT
    expect(ctx.reply).toHaveBeenCalledTimes(1)

    // Check the arguments passed to reply
    const [replyText, replyMarkup] = (ctx.reply as Mock).mock.calls[0]

    expect(replyText).toBe(expectedText)

    // Check the structure of the keyboard markup returned by the mock
    expect(replyMarkup).toBeDefined()
    // Check the buttons property we added to the mock in setup.ts
    expect(replyMarkup.buttons).toEqual([[expectedButtonText]])
    // Check if the resize method exists on the returned object (from the mock)
    expect(replyMarkup.resize).toBeDefined()
    expect(typeof replyMarkup.resize).toBe('function')
  })

  // Add more tests if needed, e.g., for different levels or edge cases
})
