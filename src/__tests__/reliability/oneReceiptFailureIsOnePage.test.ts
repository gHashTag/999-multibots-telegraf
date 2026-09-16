/**
 * ONE FAILED RECEIPT IS AT MOST ONE PAGE, AND USUALLY NONE.
 *
 * Every direct payment ends by sending the customer a receipt, and that send
 * goes through two nested try/catch blocks in one file:
 *
 *   sendTransactionNotification      -- catch, logger.error, RETHROW
 *   sendTransactionNotificationTest  -- catch, logger.error, return {success:false}
 *   directPayment                    -- catch, logger.error   (unreachable)
 *
 * `logger.error` is bound to the Telegram transport, so each of those is a push
 * to the owner's group. A customer who blocked the bot -- who is still charged,
 * and for whom the receipt attempt is still made -- produced two pushes per
 * payment, neither of which anybody could act on.
 *
 * Two rules, and the second is the one that keeps the gate honest:
 *   1. a catch that RETHROWS reports at `warn`; the caller that swallows the
 *      error owns the routing decision;
 *   2. that caller decides by CAUSE, not by convenience -- a missing bot
 *      instance or a rejected token still wakes somebody, because then every
 *      customer's receipt is failing at once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

const ROOT = path.join(__dirname, '..', '..', '..')

vi.mock('@/core/bot', () => ({
  getBotByName: vi.fn(),
}))

import { logger } from '@/utils/logger'
import { getBotByName } from '@/core/bot'
import { sendTransactionNotificationTest } from '@/helpers/sendTransactionNotification'

const PARAMS = {
  telegram_id: 1900592465,
  operationId: 'op-77123',
  amount: -9,
  currentBalance: 120,
  newBalance: 111,
  description: 'Reels render',
  isRu: true,
  bot_name: 'neuro_blogger_bot',
}

/** A Telegraf error as Telegram actually returns it. */
const telegramError = (code: number, description: string) =>
  Object.assign(new Error(`${code}: ${description}`), {
    response: { error_code: code, description },
  })

/** A bot whose sendMessage rejects with `err`. */
const botThatFails = (err: unknown) => ({
  bot: { telegram: { sendMessage: vi.fn().mockRejectedValue(err) } },
  error: null,
})

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let previousEnv: string | undefined

beforeEach(() => {
  // The helper short-circuits to a mock under NODE_ENV=test, which is exactly
  // the branch that never runs in production. Take the production path.
  previousEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger)
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger)
  vi.mocked(getBotByName).mockReset()
})

afterEach(() => {
  process.env.NODE_ENV = previousEnv
  vi.restoreAllMocks()
})

describe('a customer who blocked the bot does not page the owner', () => {
  it.each([
    [403, 'Forbidden: bot was blocked by the user'],
    [400, 'Bad Request: chat not found'],
    [400, 'Bad Request: user is deactivated'],
    [429, 'Too Many Requests: retry after 31'],
  ])('%i %s is reported at warn, not error', async (code, description) => {
    vi.mocked(getBotByName).mockReturnValue(
      botThatFails(telegramError(code, description)) as never
    )

    const result = await sendTransactionNotificationTest(PARAMS)

    expect(result).toEqual({ success: false })
    expect(
      errorSpy,
      `"${description}" still pushes to the owner's group`
    ).not.toHaveBeenCalled()
    expect(warnSpy, 'the failure vanished entirely').toHaveBeenCalled()
  })
})

describe('a failure that IS ours still wakes somebody', () => {
  /*
   * THE CONTROL THAT CAN FAIL. Silencing the whole path would pass every test
   * above and leave receipts failing for every customer with nothing said.
   */
  it('a missing bot instance pages exactly once', async () => {
    vi.mocked(getBotByName).mockReturnValue({
      bot: null,
      error: 'not registered',
    } as never)

    await sendTransactionNotificationTest(PARAMS)

    expect(errorSpy, 'a broken bot registry must page').toHaveBeenCalledTimes(1)
  })

  it('a rejected token pages exactly once, not twice', async () => {
    vi.mocked(getBotByName).mockReturnValue(
      botThatFails(telegramError(401, 'Unauthorized')) as never
    )

    await sendTransactionNotificationTest(PARAMS)

    // The number IS the defect: it used to be two for every single failure.
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("broken markup we built is not the customer's fault and keeps paging", async () => {
    // `can't parse entities` is also a 400. It means this code produced
    // invalid markup, and it is deliberately absent from the user-caused list.
    vi.mocked(getBotByName).mockReturnValue(
      botThatFails(
        telegramError(400, "Bad Request: can't parse entities: unclosed entity")
      ) as never
    )

    await sendTransactionNotificationTest(PARAMS)

    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

describe('the shape that caused it cannot come back', () => {
  it('the rethrowing catch does not also page', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/helpers/sendTransactionNotification.ts'),
      'utf8'
    )
    // One logger.error in the file: the single caller that owns the decision.
    expect(
      (src.match(/logger\.error\(/g) || []).length,
      'a second logger.error is a second push for one event'
    ).toBe(1)
    expect(src).toContain('isUserCausedTelegramError')
  })

  it('directPayment does not restate the verdict a third time', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/core/supabase/directPayment.ts'),
      'utf8'
    )
    // sliceFrom, not slice(indexOf(...)): if the catch is renamed, a missing
    // anchor yields the file's LAST CHARACTER, and `.not.toMatch` over '\n'
    // passes for ever. This throws instead and names the anchor.
    const notifyCatch = sliceFrom(src, '} catch (notifyError) {', 900)
    expect(notifyCatch, 'the notify catch is back to logger.error').not.toMatch(
      /logger\.error\(/
    )
    expect(notifyCatch).toMatch(/logger\.warn\(/)
  })
})
