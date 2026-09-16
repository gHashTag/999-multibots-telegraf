/**
 * Tests for errorHandler.ts
 *
 * Telegram API error handler setup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { secretFingerprint } from '@/utils/secretFingerprint'

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
      telegram: { token: 'test-token-12345' }, // secret-guard-ok: invented fixture, never issued
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
      /*
       * THIS TEST USED TO PIN THE LEAK IT IS NAMED AFTER.
       *
       * It asserted `token_prefix: '1234567890...'` -- the first ten
       * characters of a live bot token -- and called that a mask. This alert
       * is a `logger.error`, which `utils/logger.ts` forwards to the owner's
       * Telegram group, a group with ordinary members in it. A prefix is not
       * a mask; it is the front of the secret, published.
       *
       * The digest answers the only question a 401 actually raises -- "is the
       * running token the one I think it is?" -- and answers nothing else.
       */
      const TOKEN = '1234567890:ABCdefGHIjklMNOpqrstUVWxyz'
      const ctx = createMockContext({ telegram: { token: TOKEN } })
      const error = new Error('401: Unauthorized')

      await catchHandler(error, ctx)

      expect(logger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ token: secretFingerprint(TOKEN) }) // secret-guard-ok: a call, not a value; `secretFingerprint` is 17 chars and clears the 16-char floor
      )

      // And the control that matters: no fragment of the token is anywhere in
      // what was sent, under any key. A digest that ships alongside a prefix
      // has bought nothing.
      const sent = JSON.stringify(vi.mocked(logger.error).mock.calls.at(-1))
      expect(sent).not.toContain('ABCdefGHI')
      expect(sent).not.toContain('1234567890:')
    })
  })

  /*
   * WHAT WOULD THE OWNER DO WITH THIS AT 3AM?
   *
   * `utils/logger.ts` binds the Telegram transport at level 'error', so the
   * level chosen in bot.catch decides whether a phone buzzes. The fallback
   * branch classified nothing: it tested the message for '401: Unauthorized'
   * and '403: Forbidden' and sent EVERYTHING else -- including the 400s a
   * customer causes by pressing a stale button -- to logger.error.
   *
   * These cases drive the real handler with Telegraf-shaped errors (Telegraf
   * hangs the API answer off `error.response` and builds the message as
   * `${error_code}: ${description}`), so they fail if the classification is
   * removed, and they say nothing about how it is spelled.
   */
  describe('the level is the routing decision, not a severity adjective', () => {
    let catchHandler: (err: Error, ctx: any) => Promise<void>

    const telegramError = (error_code: number, description: string) =>
      Object.assign(new Error(`${error_code}: ${description}`), {
        response: { ok: false, error_code, description },
        on: { method: 'answerCbQuery' },
      })

    const ctx = () => ({
      from: { id: 123456789, username: 'testuser' },
      chat: { id: 123456789 },
      botInfo: { username: 'testbot' },
      telegram: { token: 'test-token-12345' }, // secret-guard-ok: invented fixture, never issued
      update: { update_id: 1 },
    })

    beforeEach(() => {
      vi.clearAllMocks()
      const bot = {
        catch: vi.fn(handler => {
          catchHandler = handler
        }),
      } as unknown as Telegraf<MyContext>
      setupErrorHandler(bot)
    })

    // A press on yesterday's message. The press is already lost; there is
    // nothing for anybody to do about it, tonight or ever.
    it('does not page for a callback query that expired', async () => {
      await catchHandler(
        telegramError(
          400,
          'Bad Request: query is too old and response timeout expired or query ID is invalid'
        ),
        ctx()
      )

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          description: 'User-caused Telegram rejection',
          error_code: 400,
          user_id: 123456789,
        })
      )
    })

    // The same toggle tapped twice.
    it('does not page when the message is unchanged', async () => {
      await catchHandler(
        telegramError(
          400,
          'Bad Request: message is not modified: specified new message content and reply markup are exactly the same'
        ),
        ctx()
      )

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalled()
    })

    // A wizard cancelled after the customer cleared the chat.
    it('does not page when the message to edit is gone', async () => {
      await catchHandler(
        telegramError(400, 'Bad Request: message to edit not found'),
        ctx()
      )

      expect(logger.error).not.toHaveBeenCalled()
    })

    // Telegram throttling us. Real, but retry_after fixes it, not a human.
    it('does not page for 429 rate limiting', async () => {
      await catchHandler(
        telegramError(429, 'Too Many Requests: retry after 5'),
        ctx()
      )

      expect(logger.error).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalled()
    })

    /*
     * The other half of the contract, and the more important one: the list is
     * closed, so OUR defects keep the owner's phone. Broken markup is a 400
     * too -- it is a message this code built wrong -- and a TypeError thrown
     * inside a handler carries no Telegram response at all.
     */
    it('still pages when WE built a malformed message', async () => {
      await catchHandler(
        telegramError(
          400,
          "Bad Request: can't parse entities: Can't find end of the entity starting at byte offset 42"
        ),
        ctx()
      )

      expect(logger.error).toHaveBeenCalledWith(
        '❌ Ошибка Telegram API:',
        expect.objectContaining({
          description: 'Telegram API Error',
          error_code: 400,
        })
      )
    })

    it('still pages for a crash inside a handler', async () => {
      await catchHandler(
        new TypeError("Cannot read properties of undefined (reading 'id')"),
        ctx()
      )

      expect(logger.error).toHaveBeenCalledWith(
        '❌ Ошибка Telegram API:',
        expect.objectContaining({ description: 'Telegram API Error' })
      )
      expect(logger.warn).not.toHaveBeenCalled()
    })

    // Callback data over 64 bytes: a button THIS code generated wrong.
    it('still pages when WE built an invalid button', async () => {
      await catchHandler(
        telegramError(400, 'Bad Request: BUTTON_DATA_INVALID'),
        ctx()
      )

      expect(logger.error).toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })
})
