/**
 * THE WORD IN THE ALERT MUST AGREE WITH THE DECISION TO SEND IT.
 *
 * `utils/logger.ts` binds the Telegram transport at level 'error', so the level
 * is a routing decision: error wakes the owner, warn writes it down. The line
 * he then reads is built from a SECOND answer -- the label
 * `classifyGenerationFailure` sorts the same failure into -- and the two used to
 * be computed from different rules. They could therefore contradict each other
 * on one string:
 *
 *   'Failed to process generated image: safety checker service unavailable'
 *     label: bare includes('safety') -> NSFW_DETECTED, retry via fallback
 *     level: isContentRefusal -> false, so it paged
 *
 * An outage in our own safety hop woke the owner under a headline blaming the
 * customer's picture and promising a retry nobody had scheduled -- which is the
 * one shape of alert that teaches an operator to ignore the next one.
 *
 * The other half is the wallet. The pre-check refused with a bare
 * `new Error('Insufficient balance')`, so the catch had to re-read the verdict
 * out of that sentence -- and in this repository the identical phrase means the
 * OPPOSITE when it comes from a provider: kie-ai-webhook.routes.ts:71 treats
 * 'insufficient balance' as OUR account running dry, which must page.
 *
 * These tests DRIVE the generator. Three doors to the outside world are
 * replaced (the user row, the balance, the model call) and nothing else:
 * classifyGenerationFailure, isContentRefusal, isBalanceRefusal and
 * BalanceRefusedError are the subject, not scaffolding.
 *
 * Every "goes quiet" case is paired with a failure of OURS on the same code
 * path that must still page, because a demotion is only a fix if the machinery
 * still shouts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const TID = '144022504'

const { getUser, getBalance, getAspect, run } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getBalance: vi.fn(),
  getAspect: vi.fn(),
  run: vi.fn(),
}))

/*
 * Mocked at the LEAF modules, not at the '@/core/supabase' barrel: this graph
 * is cyclic, and putting the real barrel inside a mock factory makes the result
 * depend on import order (the note in anEmptyWalletDoesNotWakeTheOwner.test.ts
 * records that being paid for once already).
 */
vi.mock('@/core/supabase/getUserByTelegramIdString', () => ({
  getUserByTelegramIdString: getUser,
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: getBalance,
  invalidateBalanceCache: vi.fn(),
  BalanceUnavailableError: class BalanceUnavailableError extends Error {},
}))

vi.mock('@/core/supabase/getAspectRatio', () => ({
  getAspectRatio: getAspect,
}))

vi.mock('@/core/replicate', () => ({
  replicate: { run },
}))

import { logger } from '@/utils/logger'
import { generateSeeDream45 } from '@/services/generateSeeDream45'
import {
  BalanceRefusedError,
  INSUFFICIENT_FUNDS_SENTINEL,
} from '@/price/helpers/refuseUnpaidGeneration'

function makeCtx() {
  const sent: { text: string; extra: any }[] = []
  return {
    sent,
    ctx: {
      reply: vi.fn(async (text: string, extra: any) => {
        sent.push({ text, extra })
        return { message_id: sent.length }
      }),
      telegram: { deleteMessage: vi.fn(async () => true) },
      botInfo: { username: 'test_bot' },
      from: { id: Number(TID), language_code: 'en' },
      session: {},
    } as any,
  }
}

/** Every callback_data under a message's keyboard, whatever shape it came in. */
function buttons(extra: any): string[] {
  const rows = extra?.reply_markup?.inline_keyboard ?? []
  return rows.flat().map((b: any) => b?.callback_data ?? '')
}

/** The first argument of every call: the sentence the owner would see. */
function messages(spy: { mock: { calls: any[][] } }): string[] {
  return spy.mock.calls.map(c => String(c[0]))
}

const call = (ctx: any) =>
  generateSeeDream45({
    prompt: 'a portrait in the style of a 17th century engraving',
    telegram_id: TID,
    username: 'u',
    is_ru: false,
    ctx,
    size: '2K',
  })

let error: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // Spied on the real logger object -- the same instance the Telegram transport
  // is attached to, so "which method" is the whole question.
  error = vi.spyOn(logger, 'error').mockImplementation(() => logger as any)
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger as any)
  vi.spyOn(logger, 'info').mockImplementation(() => logger as any)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)

  getUser.mockReset()
  getUser.mockResolvedValue({ id: 1, telegram_id: TID, level: 1 })
  getAspect.mockReset()
  getAspect.mockResolvedValue('9:16')
  getBalance.mockReset()
  getBalance.mockResolvedValue(0)
  run.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the pre-check refuses an empty wallet with a TYPE', () => {
  it('throws BalanceRefusedError, so the five typed catch sites recognise it', async () => {
    const { ctx } = makeCtx()

    const caught = await call(ctx).then(
      () => null,
      (e: unknown) => e
    )

    // registerCommands.ts:1897, imageUpscalerWizard:111, aiPhotoshopScene:2352
    // and :5581, generateFluxKontext.ts:1110 all ask exactly this pair. A bare
    // `new Error('Insufficient balance')` answered none of them, so each of
    // those scenes paged and told the customer to try again later.
    expect(caught).toBeInstanceOf(BalanceRefusedError)
    expect((caught as BalanceRefusedError).insufficientFunds).toBe(true)
    expect((caught as BalanceRefusedError).userAlreadyNotified).toBe(true)
    expect((caught as Error).message).toBe(INSUFFICIENT_FUNDS_SENTINEL)
    // The numbers that made the decision survive in the reason, not in a label.
    expect((caught as BalanceRefusedError).reason).toContain('pre-check')
  })

  it('does not page the owner, and still offers the way to pay', async () => {
    const { ctx, sent } = makeCtx()

    await expect(call(ctx)).rejects.toThrow()

    expect(
      messages(error),
      'an empty wallet reached the Telegram transport'
    ).toEqual([])
    expect(messages(warn).join('\n')).toContain(
      '[SeeDream4.5] INSUFFICIENT_BALANCE'
    )
    expect(
      buttons(sent[0].extra),
      'the refusal must carry the way to pay'
    ).toContain('act:topup')
  })

  it('STILL pages when the PROVIDER account is the one out of credit', async () => {
    // The same three words, the opposite fact and the opposite duty: every
    // generation stops until somebody tops OUR account up. Read off the string
    // this was a customer with no stars and went quiet.
    getBalance.mockResolvedValue(1000)
    run.mockRejectedValue(
      new Error('Insufficient balance or no resource package')
    )
    const { ctx } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('Insufficient balance')

    expect(
      messages(error).join('\n'),
      'our own provider account ran dry and nobody was told'
    ).toContain('[SeeDream4.5]')
  })

  it('STILL pages when our own machinery fails on the same path', async () => {
    getUser.mockResolvedValue(null)
    const { ctx } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('does not exist')

    expect(messages(error).join('\n')).toContain('[SeeDream4.5] USER_NOT_FOUND')
  })
})

describe('the label agrees with the level', () => {
  it('does not blame the picture for an outage in the safety hop', async () => {
    getBalance.mockResolvedValue(1000)
    run.mockRejectedValue(
      new Error(
        'Failed to process generated image: safety checker service unavailable'
      )
    )
    const { ctx } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('safety checker')

    const paged = messages(error).join('\n')
    expect(paged, 'the safety hop broke and nobody was told').toContain(
      '[SeeDream4.5]'
    )
    expect(
      paged,
      "the owner was paged about the customer's picture for our own outage"
    ).not.toContain('NSFW_DETECTED')
    // UNKNOWN is the branch that appends the real message, which is the only
    // thing here an operator can act on.
    expect(paged).toContain('[SeeDream4.5] UNKNOWN')
    expect(paged).toContain('safety checker service unavailable')
  })

  it('still calls a real refusal a refusal, and goes quiet about it', async () => {
    getBalance.mockResolvedValue(1000)
    run.mockRejectedValue(new Error('E005: image flagged as sensitive'))
    const { ctx } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('E005')

    expect(messages(error), 'a refused selfie woke the owner again').toEqual([])
    expect(messages(warn).join('\n')).toContain('[SeeDream4.5] NSFW_DETECTED')
  })
})
