/**
 * THE LAST CATCH BEHIND TWO DOZEN BUTTONS DECIDED EVERY ALERT.
 *
 * `withErrorHandling` in registerCommands.ts wraps 15 call sites -- 24
 * registered handlers, counting the two factories -- and it sent EVERY throw
 * to logger.error. `utils/logger.ts` binds the Telegram transport at level
 * 'error', so each of those was a push notification to the owner's phone.
 *
 * Two whole classes of throw arriving there are the customer's own situation
 * and carry nothing for anybody to do at 3am:
 *
 *   - an empty wallet, which `refuseUnpaidGeneration` already logged at info
 *     and already told the customer about, with top-up buttons attached;
 *   - a Telegram rejection the customer caused: a press on an expired query,
 *     a button on a message they had deleted.
 *
 * These tests drive the REAL registered handlers -- the same closures
 * `registerCommands` hands to Telegraf -- and assert where each failure is
 * routed. They are deliberately silent about the wording of any log line.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('@/services/generateFluxKontext', () => ({
  generateFluxKontext: vi.fn(),
  generateAdvancedFluxKontext: vi.fn(),
  upscaleFluxKontextImage: vi.fn(),
}))

import { logger } from '@/utils/logger'
import { upscaleFluxKontextImage } from '@/services/generateFluxKontext'
import { BalanceRefusedError } from '@/price/helpers/refuseUnpaidGeneration'

type Handler = (ctx: any) => Promise<unknown>

const handlers = new Map<string, Handler>()

/** A Telegram rejection the customer caused, shaped the way Telegraf shapes it. */
const customerRejection = (description: string) =>
  Object.assign(new Error(`400: ${description}`), {
    response: { ok: false, error_code: 400, description },
  })

beforeAll(async () => {
  const bot: any = {
    use: vi.fn(),
    command: vi.fn(),
    hears: vi.fn(),
    on: vi.fn(),
    action: vi.fn((pattern: unknown, ...rest: unknown[]) => {
      const handler = rest[rest.length - 1] as Handler
      if (typeof pattern === 'string') handlers.set(pattern, handler)
    }),
    telegram: {
      setMyCommands: vi.fn().mockResolvedValue(true),
      getMe: vi.fn().mockResolvedValue({ id: 1, username: 'testbot' }),
    },
    botInfo: { username: 'testbot' },
  }

  const { registerCommands } = await import('@/navigation/registerCommands')
  registerCommands({ bot })
})

describe('withErrorHandling routes a failure by what an operator could do about it', () => {
  let reply: ReturnType<typeof vi.fn>
  let answerCbQuery: ReturnType<typeof vi.fn>
  let sceneEnter: ReturnType<typeof vi.fn>

  const ctx = () =>
    ({
      from: { id: 123456, username: 'customer' },
      state: { userLanguage: 'en' },
      session: {
        lastGeneratedImageUrl: 'https://example.invalid/fresh.png',
        lastUpscaledImageUrl: undefined,
      },
      scene: { leave: vi.fn().mockResolvedValue(undefined), enter: sceneEnter },
      reply,
      answerCbQuery,
    }) as any

  beforeEach(() => {
    vi.clearAllMocks()
    reply = vi.fn().mockResolvedValue(undefined)
    answerCbQuery = vi.fn().mockResolvedValue(true)
    sceneEnter = vi.fn().mockResolvedValue(undefined)
  })

  it('registered the handlers these tests drive', () => {
    expect(handlers.get('upscale_image')).toBeTypeOf('function')
    expect(handlers.get('go_help')).toBeTypeOf('function')
  })

  /*
   * The reported path: a customer with an empty wallet presses ⬆️ Upscale.
   * refuseUnpaidGeneration logs it at info, sends the top-up prompt and
   * throws; the throw climbed out of the upscale service to this wrapper,
   * which paged the owner AND answered the top-up prompt with
   * '❌ An error occurred. Please try again later.'
   */
  it('does not page, and does not contradict the top-up prompt, for an empty wallet', async () => {
    ;(upscaleFluxKontextImage as any).mockRejectedValue(
      new BalanceRefusedError({
        message: 'Insufficient funds',
        insufficientFunds: true,
        reason: 'Недостаточно средств',
        userAlreadyNotified: true,
      })
    )

    await handlers.get('upscale_image')!(ctx())

    expect(upscaleFluxKontextImage).toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
    // warn, and specifically not info: this catch is the ECHO of a refusal the
    // source already logged and already told the customer about, and the echo
    // is what a warn-level count of refusals reads. The five scene catches
    // carrying this same sentence all warn; leaving this one at info split one
    // class across two levels and dropped two dozen registered actions out of
    // every such count. The convention lives at the top of the pre-write guard
    // in core/supabase/updateUserBalance.ts.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('upscale_image'),
      expect.objectContaining({ telegramId: 123456 })
    )
    expect(reply).not.toHaveBeenCalled()
  })

  /*
   * The opposite case, and the reason the test above is narrow: a charge that
   * failed for an OPERATOR reason carries insufficientFunds:false. Money that
   * did not move for our reasons must still reach the owner.
   */
  it('still pages when the charge failed for our reasons', async () => {
    ;(upscaleFluxKontextImage as any).mockRejectedValue(
      new BalanceRefusedError({
        message: 'Balance operation failed',
        insufficientFunds: false,
        reason: 'payment ledger unreachable',
        userAlreadyNotified: false,
      })
    )

    await handlers.get('upscale_image')!(ctx())

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('upscale_image'),
      expect.objectContaining({ telegramId: 123456 })
    )
    expect(reply).toHaveBeenCalled()
  })

  it('does not page when Telegram rejected the customer press', async () => {
    sceneEnter.mockRejectedValue(
      customerRejection(
        'Bad Request: query is too old and response timeout expired or query ID is invalid'
      )
    )

    await handlers.get('go_help')!(ctx())

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('go_help'),
      expect.objectContaining({ telegramId: 123456 })
    )
  })

  it('does not page when the message the customer deleted cannot be edited', async () => {
    sceneEnter.mockRejectedValue(
      customerRejection('Bad Request: message to edit not found')
    )

    await handlers.get('go_help')!(ctx())

    expect(logger.error).not.toHaveBeenCalled()
  })

  // The acknowledgement is not the work, in the factory too: eleven registered
  // actions are built by createSceneActionHandler.
  it('enters the scene even when the press cannot be acknowledged', async () => {
    answerCbQuery.mockRejectedValue(
      customerRejection(
        'Bad Request: query is too old and response timeout expired or query ID is invalid'
      )
    )

    await handlers.get('go_help')!(ctx())

    expect(sceneEnter).toHaveBeenCalledWith('helpScene')
    expect(logger.error).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  // And the half that must never be silenced: our own defect.
  it('still pages when a handler crashes', async () => {
    sceneEnter.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'id')")
    )

    await handlers.get('go_help')!(ctx())

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('go_help'),
      expect.objectContaining({ telegramId: 123456 })
    )
    expect(reply).toHaveBeenCalled()
  })
})
