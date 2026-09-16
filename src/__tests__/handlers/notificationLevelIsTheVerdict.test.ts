/**
 * THE VERDICT MUST BE COMPUTED BEFORE THE PAGE, NOT AFTER IT.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error', so in this
 * repository the level is a routing decision: `logger.error` is a push
 * notification to the owner's phone and `logger.warn` is not.
 *
 * Every Supabase update site in notificationHandler called `logger.error`
 * unconditionally and only THEN asked whether the cause was a transient fetch
 * failure, adding a quieter `logger.warn` underneath. The branch existed
 * precisely to keep a 60-second sweep's network blip off the owner's phone, and
 * it ran one line too late to prevent anything. This poller alone was measured
 * at 1440 messages a day while Supabase was unreachable.
 *
 * So the assertions below are on WHAT REACHES THE OWNER, not on which method
 * was called: the handler is driven with a fake Supabase, the real logger and
 * the real transport, and the delivery service is watched. Every case here goes
 * red if the classifier is moved back below the log.
 *
 * The other half is not silenced and is pinned just as hard: a write that fails
 * for a schema, permission or constraint reason is a real failure, the
 * pending_messages queue stalls behind it, and it must still page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const logError = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: {
    isReady: () => true,
    logError,
    initializeOnce: vi.fn(),
    log: vi.fn(),
  },
}))

/** What the fake Supabase does on the next call. */
const next: { returns: any; throws: any } = { returns: null, throws: null }

vi.mock('@/core/supabase', () => {
  const answer = async () => {
    if (next.throws) throw next.throws
    return { error: next.returns }
  }
  return {
    supabase: {
      from: () => ({
        update: () => ({ eq: answer }),
        delete: () => ({ eq: () => ({ lt: answer }) }),
      }),
    },
  }
})

import { logger } from '@/utils/logger'
import { NotificationHandler } from '@/handlers/notificationHandler'

const transport = (logger as unknown as { transports: any[] }).transports.find(
  t => t.constructor.name === 'TelegramLogTransport'
) as any

const settle = () => new Promise(resolve => setTimeout(resolve, 10))

/** What the owner would have received, if anything. */
const paged = () => logError.mock.calls.length
const alert = () => logError.mock.calls.at(-1)![0] as Record<string, string>

const handler = () => new NotificationHandler({} as any)

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'row-alpha',
  telegram_id: '1613501411',
  message: 'hi',
  message_type: 'info',
  created_at: '',
  priority: 'medium' as const,
  attempts: 0,
  sent: false,
  ...overrides,
})

beforeEach(() => {
  logError.mockClear()
  next.returns = null
  next.throws = null
  transport.telegramLogService = { isReady: () => true, logError }
  transport.isInitialized = true
  /*
   * The headlines no longer carry a row id, which is the point of half of this
   * file -- so two cases in a row would otherwise collide in the transport's
   * ten-minute window and the second would be counted rather than sent. The
   * throttle is real and is tested elsewhere; here it is reset between cases.
   */
  transport.seen.clear()
})

const TRANSIENT = Object.assign(new TypeError('fetch failed'), {
  code: undefined,
})
const SCHEMA_FAULT = {
  message: 'column "sent" of relation "pending_messages" does not exist',
  code: '42703',
  details: null,
  hint: null,
}

describe('a network blip does not wake the owner', () => {
  it('markMessageAsSent: a returned fetch failure is a warn, not a page', async () => {
    next.returns = { message: 'TypeError: fetch failed', code: undefined }
    await (handler() as any).markMessageAsSent('row-alpha')
    await settle()
    expect(
      paged(),
      'the transient branch still runs after the page has been sent'
    ).toBe(0)
  })

  it('markMessageAsSent: PGRST301 is a warn, not a page', async () => {
    next.returns = { message: 'JWT expired', code: 'PGRST301' }
    await (handler() as any).markMessageAsSent('row-alpha')
    await settle()
    expect(paged()).toBe(0)
  })

  it('markMessageAsSent: a THROWN fetch failure is a warn, not a page', async () => {
    next.throws = TRANSIENT
    await (handler() as any).markMessageAsSent('row-alpha')
    await settle()
    expect(paged()).toBe(0)
  })

  it('markMessageAsFailed: a returned fetch failure is a warn, not a page', async () => {
    next.returns = { message: 'TypeError: fetch failed', code: undefined }
    await (handler() as any).markMessageAsFailed(message(), new Error('403'))
    await settle()
    expect(paged()).toBe(0)
  })

  it('markMessageAsFailed: a THROWN fetch failure is a warn, not a page', async () => {
    next.throws = TRANSIENT
    await (handler() as any).markMessageAsFailed(message(), new Error('403'))
    await settle()
    expect(paged()).toBe(0)
  })

  it('cleanupOldMessages: hourly, so a blip here is 24 pages a day', async () => {
    next.returns = { message: 'TypeError: fetch failed', code: undefined }
    await handler().cleanupOldMessages()
    await settle()
    expect(paged()).toBe(0)
  })

  it.each([
    ['ETIMEDOUT', 'connect ETIMEDOUT 104.18.38.10:443'],
    ['ECONNRESET', 'read ECONNRESET'],
    ['ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:54321'],
    ['EAI_AGAIN', 'getaddrinfo EAI_AGAIN db.supabase.co'],
  ])('%s is the same class of nothing-to-do', async (_name, text) => {
    next.returns = { message: text, code: undefined }
    await (handler() as any).markMessageAsSent('row-alpha')
    await settle()
    expect(paged()).toBe(0)
  })
})

describe('a real write failure still pages, and carries the row id', () => {
  it('markMessageAsSent: a schema fault is an incident', async () => {
    next.returns = SCHEMA_FAULT
    await (handler() as any).markMessageAsSent('row-alpha')
    await settle()
    expect(
      paged(),
      'a broken write stalls the pending_messages queue and must page'
    ).toBe(1)
    expect(alert().details).toContain('42703')
    expect(alert().details, 'the id was dropped instead of moved').toContain(
      'row-alpha'
    )
  })

  it('markMessageAsFailed: a permission fault is an incident', async () => {
    next.returns = {
      message: 'permission denied for table pending_messages',
      code: '42501',
      details: null,
      hint: null,
    }
    await (handler() as any).markMessageAsFailed(message(), new Error('403'))
    await settle()
    expect(paged()).toBe(1)
    expect(alert().details).toContain('42501')
  })

  it('a thrown non-network error still pages WITH its detail attached', async () => {
    /*
     * A native Error's own fields are non-enumerable, so the old
     * `logger.error(title, error)` gave detailsForAlert nothing to iterate and
     * the alert arrived as a bare headline. The fields are named explicitly now.
     */
    next.throws = new TypeError('supabase.from(...).update is not a function')
    await (handler() as any).markMessageAsSent('row-alpha')
    await settle()
    expect(paged()).toBe(1)
    expect(alert().details, 'the alert arrived with no diagnosis').toContain(
      'is not a function'
    )
    expect(alert().details).toContain('row-alpha')
  })
})

describe('the row id is in the meta, not in the headline', () => {
  it('two rows failing the same way are one incident, not two pages', async () => {
    /*
     * THE CONTROL THAT CAN FAIL. The title used to interpolate the row id, and
     * the throttle fingerprints on the title. It masks uuids and long hex runs,
     * so it happened to collapse a uuid id -- but an id of any other shape, and
     * this table is written by hand in more than one place, made every repeat a
     * fresh incident. The fix does not depend on the mask: the title is the same
     * string whatever the id looks like.
     */
    next.returns = SCHEMA_FAULT
    await (handler() as any).markMessageAsSent('row-alpha')
    await settle()
    await (handler() as any).markMessageAsSent('row-beta')
    await settle()
    expect(
      paged(),
      'the row id is back in the headline: every row is a new incident'
    ).toBe(1)
    expect(alert().error).not.toContain('row-alpha')
  })
})

describe('a customer who blocked the bot is not an incident', () => {
  const telegramError = (code: number, description: string) =>
    Object.assign(new Error(`${code}: ${description}`), {
      response: { ok: false, error_code: code, description },
    })

  const deliveryFails = async (error: unknown) => {
    const bot = {
      telegram: {
        sendMessage: async () => {
          throw error
        },
      },
    }
    await (new NotificationHandler(bot as any) as any).processMessage(message())
    await settle()
  }

  it.each([
    [403, 'Forbidden: bot was blocked by the user'],
    [403, 'Forbidden: user is deactivated'],
    [400, 'Bad Request: chat not found'],
    [429, 'Too Many Requests: retry after 12'],
  ])('%i %s is the customer, so nobody is woken', async (code, description) => {
    await deliveryFails(telegramError(code, description))
    expect(paged()).toBe(0)
  })

  it.each([
    [401, 'Unauthorized'],
    [400, "Bad Request: can't parse entities: unexpected end tag"],
    [500, 'Internal Server Error'],
  ])('%i %s is OURS and must keep paging', async (code, description) => {
    await deliveryFails(telegramError(code, description))
    expect(paged(), 'an alert-noise fix must not swallow our own defect').toBe(
      1
    )
  })

  it('a plain thrown Error is not a Telegram rejection and keeps paging', async () => {
    await deliveryFails(new TypeError('this.bot.telegram is undefined'))
    expect(paged()).toBe(1)
    expect(
      alert().details,
      'the alert arrived without the crash it is reporting'
    ).toContain('this.bot.telegram is undefined')
  })
})
