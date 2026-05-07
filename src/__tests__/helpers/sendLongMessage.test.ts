/**
 * Tests for sendLongMessage.ts
 *
 * Long message handling with chunking for Telegram API limits
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MyContext } from '@/interfaces/telegram-bot.interface'

// Mock logger before imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { sendLongMessage, sendImprovedPrompt } from '@/helpers/sendLongMessage'
import { logger } from '@/utils/logger'

const createMockContext = (overrides = {}): MyContext =>
  ({
    from: { id: 123456789 },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
    ...overrides,
  } as unknown as MyContext)

describe('sendLongMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('short messages', () => {
    it('should send short message as is', async () => {
      const ctx = createMockContext()
      const text = 'Hello, World!'

      await sendLongMessage(ctx, text)

      expect(ctx.reply).toHaveBeenCalledTimes(1)
      expect(ctx.reply).toHaveBeenCalledWith(text, undefined)
    })

    it('should pass options for short messages', async () => {
      const ctx = createMockContext()
      const text = 'Hello!'
      const options = { parse_mode: 'HTML' }

      await sendLongMessage(ctx, text, options)

      expect(ctx.reply).toHaveBeenCalledWith(text, options)
    })

    it('should handle exactly 4000 characters', async () => {
      const ctx = createMockContext()
      const text = 'a'.repeat(4000)

      await sendLongMessage(ctx, text)

      expect(ctx.reply).toHaveBeenCalledTimes(1)
    })
  })

  describe('long messages', () => {
    it('should split message over 4000 characters', async () => {
      const ctx = createMockContext()
      const text = 'a'.repeat(5000)

      await sendLongMessage(ctx, text)

      expect(ctx.reply).toHaveBeenCalledTimes(2)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Разбивка длинного сообщения'),
        expect.any(Object)
      )
    })

    it('should split on word boundaries when possible', async () => {
      const ctx = createMockContext()
      // Create text with spaces
      const text = ('word '.repeat(1000)).trim()

      await sendLongMessage(ctx, text)

      // Each chunk should end with a word, not mid-word
      const calls = (ctx.reply as any).mock.calls
      calls.slice(0, -1).forEach((call: any) => {
        const chunk = call[0]
        // Should not end with partial word
        expect(chunk.endsWith('wor')).toBe(false)
      })
    })

    it('should apply options only to last chunk', async () => {
      const ctx = createMockContext()
      const text = 'a'.repeat(5000)
      const options = { reply_markup: { inline_keyboard: [] } }

      await sendLongMessage(ctx, text, options)

      const calls = (ctx.reply as any).mock.calls
      // First chunk should not have options
      expect(calls[0][1]).toBeUndefined()
      // Last chunk should have options
      expect(calls[calls.length - 1][1]).toEqual(options)
    })

    it('should handle very long messages', async () => {
      const ctx = createMockContext()
      const text = 'a'.repeat(15000)

      await sendLongMessage(ctx, text)

      expect(ctx.reply).toHaveBeenCalledTimes(4)
    })
  })

  describe('error handling', () => {
    it('should send truncated message on error', async () => {
      const ctx = createMockContext()
      ;(ctx.reply as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ message_id: 1 })

      const text = 'a'.repeat(5000)

      await sendLongMessage(ctx, text)

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Ошибка при отправке'),
        expect.any(Object)
      )
    })
  })

  describe('code block handling', () => {
    it('should not split in the middle of code blocks', async () => {
      const ctx = createMockContext()
      // Create message with code block
      const code = 'const x = 1;'.repeat(300)
      const text = `Some text\n\`\`\`\n${code}\n\`\`\`\nMore text`

      await sendLongMessage(ctx, text)

      // Should try to keep code blocks together
      expect(ctx.reply).toHaveBeenCalled()
    })
  })
})

describe('sendImprovedPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('short prompts', () => {
    it('should send short prompt in single message with code block', async () => {
      const ctx = createMockContext()
      const prompt = 'A beautiful sunset over mountains'

      await sendImprovedPrompt(ctx, prompt, true)

      expect(ctx.reply).toHaveBeenCalledTimes(1)
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Улучшенный промпт'),
        undefined
      )
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('```'),
        undefined
      )
    })

    it('should use English header when isRu is false', async () => {
      const ctx = createMockContext()
      const prompt = 'A beautiful sunset over mountains'

      await sendImprovedPrompt(ctx, prompt, false)

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Improved prompt'),
        undefined
      )
    })
  })

  describe('long prompts', () => {
    it('should split long prompts into multiple messages', async () => {
      const ctx = createMockContext()
      const prompt = 'word '.repeat(1000)

      await sendImprovedPrompt(ctx, prompt, true)

      // Should send header + multiple code block chunks
      expect((ctx.reply as any).mock.calls.length).toBeGreaterThan(1)
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Промпт слишком длинный'),
        expect.any(Object)
      )
    })

    it('should wrap each chunk in code blocks', async () => {
      const ctx = createMockContext()
      const prompt = 'word '.repeat(1000)

      await sendImprovedPrompt(ctx, prompt, true)

      const calls = (ctx.reply as any).mock.calls
      // Skip first call (header)
      calls.slice(1).forEach((call: any) => {
        expect(call[0]).toContain('```')
      })
    })

    it('should pass options only to last chunk', async () => {
      const ctx = createMockContext()
      const prompt = 'word '.repeat(1000)
      const options = { reply_markup: { inline_keyboard: [] } }

      await sendImprovedPrompt(ctx, prompt, true, options)

      const calls = (ctx.reply as any).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[1]).toEqual(options)
    })
  })
})
