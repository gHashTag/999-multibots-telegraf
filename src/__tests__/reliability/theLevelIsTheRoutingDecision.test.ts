/**
 * THE ASSUMPTION THE WHOLE ALERT-NOISE CHANGE RESTS ON, PINNED.
 *
 * `utils/logger.ts` attaches TelegramLogTransport at level 'error', so in this
 * repository the LEVEL IS A ROUTING DECISION: `logger.error` is a push
 * notification to the owner's phone, `logger.warn` and `logger.info` are not.
 * Every demotion made for alert noise -- an empty wallet, a provider refusing
 * a customer's prompt, a stale button, a blocked bot -- is only a fix because
 * of that binding.
 *
 * Nothing pinned it. Adding `level: 'warn'` to the transport, or dropping the
 * `info.level === 'error'` guard, would turn dozens of deliberate demotions
 * back into pages in one line, and every existing test would stay green:
 * the call sites still say `warn`, the transport still exists, the alerts just
 * come back. So the binding is asserted here BEHAVIOURALLY -- by driving the
 * real winston logger through the real transport and watching what reaches the
 * delivery service -- rather than by reading the source for a literal.
 *
 * The companion invariant is the classifier: which Telegram rejections are the
 * customer's doing and therefore must never wake anyone. That list is a closed
 * one on purpose (see helpers/telegramErrors.ts) and its edges are the whole
 * point, so they are driven with real Telegram payloads.
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

import { logger } from '@/utils/logger'
import { isUserCausedTelegramError, isChatGone } from '@/helpers/telegramErrors'

/**
 * The transport is found the way production finds it -- on the logger -- so the
 * test breaks if it is ever detached, renamed or re-levelled.
 *
 * Its reference to the delivery service is then primed by hand. In production
 * the constructor's lazy `import()` does that; under vitest that import never
 * settles, so the transport parks records in `pendingLogs` instead of sending
 * and nothing observable happens. Priming the reference is the one concession
 * to the test environment: every other link in the chain below is the real one
 * -- winston's level filter, the transport's own `info.level` guard, the
 * fingerprint throttle, and `sendToTelegram`.
 */
const transport = (logger as unknown as { transports: any[] }).transports.find(
  t => t.constructor.name === 'TelegramLogTransport'
)

/** Winston hands work to a transport through setImmediate; let it land. */
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

/** A distinct message per call: the transport throttles repeats by fingerprint. */
let n = 0
const unique = (what: string) => `[routing-test] ${what} ${(n += 1)}`

describe('the level is the routing decision', () => {
  it('the Telegram transport is attached to the logger at level error', () => {
    // The literal that makes every demotion in this change a fix. If it ever
    // becomes 'warn', the pages come back and nothing else would notice.
    expect(
      transport,
      'TelegramLogTransport is no longer on the logger'
    ).toBeDefined()
    expect(transport.level).toBe('error')
  })

  beforeEach(() => {
    logError.mockClear()
    transport.telegramLogService = {
      isReady: () => true,
      logError,
    }
    transport.isInitialized = true
  })

  it('logger.error reaches the owner', async () => {
    logger.error(unique('a database write failed'), {
      context: 'routing-test',
    })
    await settle()
    expect(
      logError,
      'the owner must still be paged for our own machinery failing'
    ).toHaveBeenCalledTimes(1)
  })

  it('logger.warn does NOT reach the owner', async () => {
    logger.warn(unique('the customer has no stars'), {
      context: 'routing-test',
    })
    await settle()
    expect(
      logError,
      'if warn starts paging, every demotion made for alert noise silently reverts'
    ).not.toHaveBeenCalled()
  })

  it('logger.info does NOT reach the owner', async () => {
    // refuseUnpaidGeneration logs the empty wallet at info for exactly this
    // reason (price/helpers/refuseUnpaidGeneration.ts:94).
    logger.info(unique('refused: the balance is short'), {
      context: 'routing-test',
    })
    await settle()
    expect(logError).not.toHaveBeenCalled()
  })

  it('one incident is one page: a repeat inside the window is counted, not resent', async () => {
    const message = unique('the same provider is still refusing')
    logger.error(message, { context: 'routing-test' })
    await settle()
    logger.error(message, { context: 'routing-test' })
    await settle()
    expect(logError).toHaveBeenCalledTimes(1)
  })
})

describe('a Telegram rejection the customer caused never wakes anyone', () => {
  /** The shape Telegraf throws: the API answer hangs off `response`. */
  const telegramError = (code: number, description: string) =>
    Object.assign(new Error(`${code}: ${description}`), {
      response: { ok: false, error_code: code, description },
    })

  it.each([
    [
      400,
      'Bad Request: query is too old and response timeout expired or query ID is invalid',
    ],
    [400, 'Bad Request: message is not modified'],
    [400, 'Bad Request: message to edit not found'],
    [400, 'Bad Request: message to delete not found'],
    [400, "Bad Request: message can't be deleted for everyone"],
    [400, 'Bad Request: have no rights to send a message'],
    [403, 'Forbidden: bot was blocked by the user'],
    [403, 'Forbidden: user is deactivated'],
    [400, 'Bad Request: chat not found'],
    [429, 'Too Many Requests: retry after 12'],
  ])('%i %s is the customer, not an incident', (code, description) => {
    expect(isUserCausedTelegramError(telegramError(code, description))).toBe(
      true
    )
  })

  it.each([
    [400, "Bad Request: can't parse entities: unexpected end tag"],
    [400, 'Bad Request: file is too big'],
    [401, 'Unauthorized'],
    [500, 'Internal Server Error'],
    [502, 'Bad Gateway'],
  ])('%i %s is OURS and must keep paging', (code, description) => {
    expect(isUserCausedTelegramError(telegramError(code, description))).toBe(
      false
    )
  })

  it('a plain thrown Error is not a Telegram rejection and must keep paging', () => {
    // A TypeError from a handler lands in the same catch. Classifying it as
    // "the customer" is how an alert-noise fix turns into a silent crash.
    expect(
      isUserCausedTelegramError(new TypeError('x is not a function'))
    ).toBe(false)
    expect(isUserCausedTelegramError(undefined)).toBe(false)
  })

  it('is a superset of isChatGone: a dead chat is also the customer', () => {
    for (const [code, description] of [
      [403, 'Forbidden: bot was blocked by the user'],
      [400, 'Bad Request: chat not found'],
    ] as Array<[number, string]>) {
      const error = telegramError(code, description)
      expect(isChatGone(error)).toBe(true)
      expect(isUserCausedTelegramError(error)).toBe(true)
    }
  })

  it("'can't parse entities' is the edge the closed list exists for", () => {
    // It is a 400 like the others, and it is broken markup WE built. A rule of
    // "any 400 is the customer" would hide it for ever, which is why the list
    // names its members instead.
    const ours = telegramError(400, "Bad Request: can't parse entities")
    expect(isChatGone(ours)).toBe(false)
    expect(isUserCausedTelegramError(ours)).toBe(false)
  })
})
