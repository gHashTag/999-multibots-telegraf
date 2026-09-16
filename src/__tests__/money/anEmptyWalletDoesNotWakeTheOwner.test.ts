/**
 * A CUSTOMER WHO RAN OUT OF STARS MUST NOT RING THE OWNER'S PHONE -- AND MUST
 * STILL BE LEFT A WAY TO PAY.
 *
 * `src/utils/logger.ts` binds a Telegram transport at level 'error' (:231), so
 * every `logger.error` in this process is a push notification to the owner's
 * group. The level is a ROUTING decision, not an adjective. An empty wallet is
 * the customer's own business and there is nothing for an operator to do about
 * it at 3am; a failed balance WRITE, a missing credential or a crash is ours
 * and must keep paging.
 *
 * `refuseUnpaidGeneration` already draws that line once, at the only place
 * that knows the answer: info for the wallet, error for an operator reason
 * (price/helpers/refuseUnpaidGeneration.ts:94 and :110). The two upscalers and
 * the advanced FLUX handler then caught the very same refusal in their outer
 * catch-all and logged it AGAIN at error -- so the one broke customer the
 * helper had deliberately kept quiet about paged the owner anyway, once per
 * attempt. imageUpscaler added injury to it: the message it sent on the way
 * out carried `reply_markup: { remove_keyboard: true }`, so the single screen
 * where somebody is most willing to pay was the one screen with nothing to
 * press.
 *
 * These tests DRIVE the three functions rather than read them. The census in
 * refusalOffersAWayToPay.test.ts can see a keyboard in the source; only a run
 * can show which logger method was called and what actually reached Telegram.
 *
 * Both directions are pinned. Silencing a wallet is only correct if machinery
 * still shouts, so every "does not page" case is paired with a failure of OURS
 * on the same code path that must still page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const TID = '144022504'

const { charge, getUser, getBalance } = vi.hoisted(() => ({
  charge: vi.fn(),
  getUser: vi.fn(),
  getBalance: vi.fn(),
}))

/*
 * Only the three doors to the outside world are replaced, and each is mocked at
 * its own LEAF module rather than at the barrel it is re-exported from.
 *
 * That is not a style preference. Mocking '@/core/supabase' wholesale with
 * `importOriginal` puts the real barrel inside the factory, and this graph is
 * cyclic: with imageUpscaler imported first, generateFluxKontext bound to the
 * REAL getUserByTelegramIdString while imageUpscaler got the mock -- the same
 * three tests passed or failed depending on import order, which is a test that
 * measures the loader instead of the code. Leaves have no cycle to lose.
 *
 * refuseUnpaidGeneration and BalanceRefusedError stay REAL: they are the
 * subject, not scaffolding.
 */
vi.mock('@/core/supabase/getUserByTelegramIdString', () => ({
  getUserByTelegramIdString: getUser,
}))

vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: getBalance,
  invalidateBalanceCache: vi.fn(),
  BalanceUnavailableError: class BalanceUnavailableError extends Error {},
}))

vi.mock('@/price/helpers/processBalanceOperation', () => ({
  processBalanceOperation: charge,
}))

import { logger } from '@/utils/logger'
import { upscaleImage } from '@/services/imageUpscaler'
import {
  upscaleFluxKontextImage,
  generateAdvancedFluxKontext,
} from '@/services/generateFluxKontext'

/** What processBalanceOperation returns when the wallet is genuinely short. */
const EMPTY_WALLET = {
  success: false,
  error: 'Insufficient funds',
  insufficientFunds: true,
  currentBalance: 0,
  modePrice: 24,
}

/** ...and when the charge failed for a reason the customer did not cause. */
const OUR_FAULT = {
  success: false,
  error: 'balance update failed: connection terminated',
  insufficientFunds: false,
  currentBalance: 500,
  modePrice: 24,
}

type Sent = { text: string; extra: any }

function makeCtx() {
  const sent: Sent[] = []
  const ctx: any = {
    telegram: {
      sendMessage: vi.fn(async (_id: unknown, text: string, extra: any) => {
        sent.push({ text, extra })
        return { message_id: sent.length }
      }),
      sendPhoto: vi.fn(async () => ({ message_id: 1 })),
      sendDocument: vi.fn(async () => ({ message_id: 1 })),
    },
    botInfo: { username: 'test_bot' },
    from: { id: Number(TID), language_code: 'en' },
    session: {},
    reply: vi.fn(async () => ({ message_id: 1 })),
  }
  return { ctx, sent }
}

/** Every callback_data under a message's keyboard, whatever shape it came in. */
function buttons(extra: any): string[] {
  const rows = extra?.reply_markup?.inline_keyboard ?? []
  return rows.flat().map((b: any) => b?.callback_data ?? '')
}

/** The first argument of every call, which is the sentence the owner would see. */
function messages(spy: { mock: { calls: any[][] } }): string[] {
  return spy.mock.calls.map(c => String(c[0]))
}

let error: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>
let info: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // Spied on the real logger object: this is the same instance the Telegram
  // transport is attached to, so "which method" is the whole question.
  error = vi.spyOn(logger, 'error').mockImplementation(() => logger as any)
  warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger as any)
  info = vi.spyOn(logger, 'info').mockImplementation(() => logger as any)

  getUser.mockReset()
  getUser.mockResolvedValue({ id: 1, telegram_id: TID, level: 1 })
  getBalance.mockReset()
  getBalance.mockResolvedValue(0)
  charge.mockReset()
  charge.mockResolvedValue(EMPTY_WALLET)
})

afterEach(() => {
  error.mockRestore()
  warn.mockRestore()
  info.mockRestore()
})

describe('the standalone upscaler (services/imageUpscaler.ts)', () => {
  it('does not page the owner when the customer is out of stars', async () => {
    const { ctx, sent } = makeCtx()

    await expect(
      upscaleImage({
        imageUrl: 'https://example.invalid/a.png',
        telegram_id: TID,
        username: 'u',
        is_ru: false,
        ctx,
      })
    ).rejects.toThrow('Not enough stars')

    expect(
      messages(error),
      'an empty wallet reached the Telegram transport'
    ).toEqual([])
    expect(messages(warn)).toContain('Image upscaling failed')
    // The helper's own line still happens -- quietly, where it belongs.
    expect(messages(info)).toContain(
      '[ImageUpscaler] refused: the balance is short'
    )
  })

  it('leaves the refused customer a button to top up', async () => {
    const { ctx, sent } = makeCtx()

    await expect(
      upscaleImage({
        imageUrl: 'https://example.invalid/a.png',
        telegram_id: TID,
        username: 'u',
        is_ru: false,
        ctx,
      })
    ).rejects.toThrow()

    const last = sent[sent.length - 1]
    expect(last.text).toBe('❌ Not enough stars for image upscaling.')
    expect(
      buttons(last.extra),
      'the refusal must carry the way to pay'
    ).toContain('act:topup')
    expect(
      JSON.stringify(last.extra),
      'the keyboard was torn off the one screen that sells'
    ).not.toContain('remove_keyboard')
  })

  it('STILL pages when the charge failed for a reason we caused', async () => {
    charge.mockResolvedValue(OUR_FAULT)
    const { ctx, sent } = makeCtx()

    await expect(
      upscaleImage({
        imageUrl: 'https://example.invalid/a.png',
        telegram_id: TID,
        username: 'u',
        is_ru: false,
        ctx,
      })
    ).rejects.toThrow('Charge failed')

    expect(messages(error)).toContain(
      '[ImageUpscaler] the charge failed for an operator reason'
    )
    expect(
      messages(error),
      'the outer catch must keep paging for our own failures'
    ).toContain('Image upscaling failed')
    expect(
      sent[sent.length - 1].text,
      'a paying customer must not be told they are broke'
    ).not.toContain('Not enough stars')
  })
})

describe('the FLUX upscaler (services/generateFluxKontext.ts)', () => {
  const call = (ctx: any) =>
    upscaleFluxKontextImage({
      imageUrl: 'https://example.invalid/a.png',
      telegram_id: TID,
      username: 'u',
      is_ru: false,
      ctx,
    })

  it('does not page the owner when the customer is out of stars', async () => {
    const { ctx, sent } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('Not enough stars')

    expect(messages(error)).toEqual([])
    expect(messages(warn)).toContain('Image upscaling failed')
    expect(buttons(sent[sent.length - 1].extra)).toContain('act:topup')
  })

  it('STILL pages when the charge failed for a reason we caused', async () => {
    charge.mockResolvedValue(OUR_FAULT)
    const { ctx } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('Charge failed')

    expect(messages(error)).toContain('Image upscaling failed')
  })
})

describe('the advanced FLUX handler (generateAdvancedFluxKontext)', () => {
  const call = (ctx: any) =>
    generateAdvancedFluxKontext({
      prompt: 'make it brighter',
      mode: 'quick',
      imageA: 'https://example.invalid/a.png',
      modelType: 'pro',
      telegram_id: TID,
      username: 'u',
      is_ru: false,
      ctx,
    } as any)

  it('does not page the owner when the balance is below the price', async () => {
    getBalance.mockResolvedValue(0)
    const { ctx, sent } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('Not enough stars')

    expect(
      messages(error),
      'the pre-check refused politely and the catch-all shouted about it'
    ).toEqual([])
    expect(messages(warn)).toContain('Advanced FLUX Kontext editing failed')
    // Both the pre-check's refusal and the catch-all's carry the button.
    for (const s of sent) expect(buttons(s.extra)).toContain('act:topup')
  })

  it('STILL pages when something of ours breaks on the same path', async () => {
    getUser.mockResolvedValue(null)
    const { ctx } = makeCtx()

    await expect(call(ctx)).rejects.toThrow('does not exist')

    expect(messages(error)).toContain('Advanced FLUX Kontext editing failed')
  })
})
