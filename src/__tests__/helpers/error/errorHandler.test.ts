/**
 * Tests for errorHandler.ts
 *
 * Telegram API error handler setup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'

// Mock dependencies BEFORE imports
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { setupErrorHandler } from '@/helpers/error/errorHandler'
import { logger } from '@/utils/logger'

describe('setupErrorHandler', () => {
  let mockBot: Telegraf<MyContext>
  let catchHandler: (err: Error, ctx: any) => Promise<void>

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock bot
    mockBot = {
      catch: vi.fn(handler => {
        catchHandler = handler
      }),
    } as unknown as Telegraf<MyContext>
  })

  describe('setup', () => {
    it('should register catch handler on bot', () => {
      setupErrorHandler(mockBot)

      expect(mockBot.catch).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('error handling', () => {
    const createMockContext = (overrides = {}) => ({
      from: { id: 123456789, username: 'testuser' },
      chat: { id: 123456789 },
      botInfo: { username: 'testbot' },
      telegram: { token: 'test-token-12345' },
      update: { update_id: 1 },
      ...overrides,
    })

    beforeEach(() => {
      setupErrorHandler(mockBot)
    })

    it('should handle blocked user error', async () => {
      const ctx = createMockContext()
      const error = new Error('403: Forbidden: bot was blocked by the user')

      await catchHandler(error, ctx)

      expect(logger.warn).toHaveBeenCalledWith(
        '🚫 Пользователь заблокировал бота:',
        expect.objectContaining({
          description: 'User blocked the bot',
          user_id: 123456789,
        })
      )
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('should handle 401 Unauthorized error', async () => {
      const ctx = createMockContext()
      const error = new Error('401: Unauthorized')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        '🔐 Ошибка авторизации Telegram API:',
        expect.objectContaining({
          description: 'Telegram API Authorization Error',
        })
      )
    })

    it('should handle 403 Forbidden error (not blocked) AT A LEVEL THE OWNER RECEIVES', async () => {
      /*
       * This asserted `logger.warn` until 2026-09-08, and it was right at the
       * time: the branch wrote a warn for the file and reached the owner by
       * calling telegramLogService directly.
       *
       * That direct call was one of three duplicate delivery paths, and the
       * only one that bypassed the alert throttle. Removing it from a
       * warn-only branch would have silenced the branch completely, because
       * winston forwards `error` and nothing else -- so the level moved with
       * the call. A 403 that is NOT "the user blocked the bot" (handled
       * separately and deliberately unreported) means the bot cannot act for
       * somebody, which is worth knowing once.
       *
       * So this now pins the OPPOSITE of what it used to, on purpose, and the
       * old assertion is kept below as the thing that must not come back.
       */
      const ctx = createMockContext()
      const error = new Error('403: Forbidden: chat not found')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        '🔒 Ошибка доступа Telegram API:',
        expect.objectContaining({
          description: 'Telegram API Forbidden Error',
        })
      )
      expect(logger.warn).not.toHaveBeenCalledWith(
        '🔒 Ошибка доступа Telegram API:',
        expect.anything()
      )
    })

    it('should handle generic errors', async () => {
      const ctx = createMockContext()
      const error = new Error('Some other error')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        '❌ Ошибка Telegram API:',
        expect.objectContaining({
          description: 'Telegram API Error',
          error: 'Some other error',
        })
      )
    })

    it('should include user information in logs', async () => {
      const ctx = createMockContext({
        from: { id: 987654321, username: 'anotheruser' },
        chat: { id: 111222333 },
      })
      const error = new Error('Some error')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          user_id: 987654321,
          username: 'anotheruser',
          chat_id: 111222333,
        })
      )
    })

    it('should include bot name in logs', async () => {
      const ctx = createMockContext({
        botInfo: { username: 'mybot' },
      })
      const error = new Error('Some error')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          bot_name: 'mybot',
        })
      )
    })

    it('should handle missing context gracefully', async () => {
      const ctx = {}
      const error = new Error('Some error')

      await expect(catchHandler(error, ctx)).resolves.not.toThrow()
    })

    it('should handle undefined from in context', async () => {
      const ctx = createMockContext({ from: undefined })
      const error = new Error('Some error')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          user_id: undefined,
          username: undefined,
        })
      )
    })

    it('should return Promise<void>', async () => {
      const ctx = createMockContext()
      const error = new Error('Some error')

      const result = await catchHandler(error, ctx)

      expect(result).toBeUndefined()
    })

    it('should include method info from error', async () => {
      const ctx = createMockContext()
      const error = {
        message: 'Some error',
        on: { method: 'sendMessage' },
      }

      await catchHandler(error as any, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'sendMessage',
        })
      )
    })

    it('should mask token in auth error logs', async () => {
      const ctx = createMockContext({
        telegram: { token: '1234567890:ABCdefGHIjklMNOpqrstUVWxyz' },
      })
      const error = new Error('401: Unauthorized')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          token_prefix: '1234567890...',
        })
      )
    })
  })
})
