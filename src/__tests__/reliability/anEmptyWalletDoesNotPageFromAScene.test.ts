/**
 * AN EMPTY WALLET IS NOT AN OUTAGE, AND TWO PAID SCENES USED TO SAY IT WAS.
 *
 * `utils/logger.ts` binds TelegramLogTransport at level 'error', so in this
 * repository the LEVEL IS A ROUTING DECISION: `logger.error` rings the owner's
 * phone and `logger.warn` does not. Both scenes below already held the
 * discriminator when they chose the level and did not read it:
 *
 *   - morphingWizard read `balanceResult.insufficientFunds` ten lines further
 *     down, to decide whether to attach a top-up keyboard, while logging the
 *     same event at error unconditionally.
 *   - imageUpscalerWizard caught the `BalanceRefusedError` that
 *     refuseUnpaidGeneration throws for a short balance, logged it at error --
 *     the SECOND page for one refusal -- and then told the customer the system
 *     had broken and to try again later, which is false and points them away
 *     from the one action that would help: paying.
 *
 * WHY THIS IS DRIVEN AND NOT GREPPED. A source-scanning test would pass on
 * `logger[cond ? 'warn' : 'error']` no matter which way `cond` runs, and the
 * whole defect was a condition that existed and was not applied. So each case
 * below runs the REAL registered handler through the scene middleware with a
 * real Telegraf Context and asserts on what the logger was actually asked to
 * do. Only the money and provider edges are mocked: no network, no money.
 *
 * THE OTHER HALF IS THE POINT. Each demotion is paired with its machinery twin
 * -- a failed balance WRITE, a provider outage -- which must still page. A
 * change that silenced both would pass a one-sided test and lose the alert
 * that matters.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(async () => false),
  createHelpCancelKeyboard: vi.fn(() => ({ reply_markup: {} })),
  showMainMenu: vi.fn(async () => {}),
}))
vi.mock('@/services/imageUpscaler', () => ({ upscaleImage: vi.fn() }))
vi.mock('@/services/generateMorphing', () => ({ generateMorphing: vi.fn() }))
vi.mock('@/price/helpers/calculateFinalPrice', () => ({
  calculateFinalPrice: vi.fn(() => 15),
}))
vi.mock('@/modules/videoGenerator/helpers/priceHelper', () => ({
  processBalanceVideoOperationHelper: vi.fn(),
}))
vi.mock('@/price/helpers/refundUser', () => ({ refundUser: vi.fn() }))
vi.mock('@/helpers/images', () => ({ isValidImage: vi.fn(async () => true) }))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/handlers/getBotToken', () => ({ getBotToken: vi.fn(() => 'tok') }))
vi.mock('@/core/bot/shouldShowRubles', () => ({
  shouldShowRubles: vi.fn(() => false),
}))
vi.mock('@/config/unified-video-models.config', () => ({
  getModelsByInputType: vi.fn(() => [{ id: 'morph-model', name: 'M' }]),
}))

import { Context } from 'telegraf'
import { logger } from '@/utils/logger'
import { morphingWizard } from '@/scenes/morphingWizard'
import { imageUpscalerWizard } from '@/scenes/imageUpscalerWizard'
import { upscaleImage } from '@/services/imageUpscaler'
import { processBalanceVideoOperationHelper } from '@/modules/videoGenerator/helpers/priceHelper'
// The real class, deliberately not mocked: the scenes decide with `instanceof`,
// so a stand-in would prove nothing about the branch that ships.
import { BalanceRefusedError } from '@/price/helpers/refuseUnpaidGeneration'

const paged = logger.error as unknown as Mock
const quiet = logger.warn as unknown as Mock
const upscale = upscaleImage as unknown as Mock
const charge = processBalanceVideoOperationHelper as unknown as Mock

/** What refuseUnpaidGeneration throws when the person is short of stars. */
const shortBalance = () =>
  new BalanceRefusedError({
    message: 'Not enough stars',
    insufficientFunds: true,
    reason: 'Insufficient funds. Top up and we continue.',
    userAlreadyNotified: true,
  })

/** What it throws when the charge failed for a reason that is OURS. */
const chargeBroke = () =>
  new BalanceRefusedError({
    message: 'Charge failed: balance write failed',
    insufficientFunds: false,
    reason: 'balance write failed',
    userAlreadyNotified: false,
  })

const from = { id: 223757230, is_bot: false, first_name: 'U', username: 'u' }

function baseTelegram(): any {
  return {
    answerCbQuery: async () => true,
    sendMessage: async () => ({ message_id: 2 }),
    editMessageText: async () => true,
    sendVideo: async () => ({ message_id: 3 }),
    sendPhoto: async () => ({ message_id: 4 }),
    getFileLink: async () => new URL('https://example.com/photo.jpg'),
    callApi: async () => ({}),
  }
}

/** A photo message parked on step 1 of the upscaler wizard. */
function upscalerCtx() {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from,
      photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 10, height: 10 }],
    },
  }
  const ctx: any = new Context(update, baseTelegram(), {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: vi.fn(async () => {}),
    current: { id: 'image_upscaler' },
    state: {},
    // Step 1 is the one that takes the photo and pays for the upscale.
    session: { cursor: 1 },
  }
  ctx.session = {}
  ctx.reply = vi.fn(async () => ({ message_id: 9 }))
  return ctx
}

/** A tap on one of the morphing prompt presets, which charges. */
function morphingCtx() {
  const update: any = {
    update_id: 1,
    callback_query: {
      id: '1',
      from,
      message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } },
      chat_instance: 'ci',
      data: 'morphing_prompt_cinematic',
    },
  }
  const ctx: any = new Context(update, baseTelegram(), {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: vi.fn(async () => {}),
    current: { id: 'morphing_wizard' },
    state: {},
    session: { cursor: 0 },
  }
  ctx.session = {
    morphingImages: [
      { buffer: Buffer.from('a'), filename: 'a.jpg' },
      { buffer: Buffer.from('b'), filename: 'b.jpg' },
    ],
    morphingType: 'linear',
  }
  ctx.reply = vi.fn(async () => ({ message_id: 9 }))
  return ctx
}

const runUpscaler = (ctx: any) =>
  (imageUpscalerWizard as any).middleware()(ctx, async () => {})
const runMorphing = (ctx: any) =>
  (morphingWizard as any).middleware()(ctx, async () => {})

/** Every message the owner would have been paged about, as plain text. */
const pages = () => paged.mock.calls.map(c => String(c[0]))
const warnings = () => quiet.mock.calls.map(c => String(c[0]))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('imageUpscalerWizard: a short balance is not an incident', () => {
  it('does not page the owner when the customer cannot pay', async () => {
    upscale.mockRejectedValue(shortBalance())
    const ctx = upscalerCtx()

    await runUpscaler(ctx)

    expect(upscale).toHaveBeenCalledTimes(1)
    expect(
      pages(),
      'a customer three stars short must not ring the phone'
    ).toEqual([])
    expect(warnings().join(' ')).toMatch(/balance is short/i)
  })

  it('does not tell the customer the system broke', async () => {
    upscale.mockRejectedValue(shortBalance())
    const ctx = upscalerCtx()

    await runUpscaler(ctx)

    // refuseUnpaidGeneration already told them, with a top-up button under it.
    // The apology contradicted that message and pointed at retrying. The
    // language mock at the top of this file pins the English branch of that
    // apology (imageUpscalerWizard/index.ts:127), so matching its wording is
    // the whole surface; its Russian twin is the line above it.
    const said = ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join(' ')
    expect(said).not.toMatch(/error occurred|try again later/i)
  })

  it('still leaves the scene and releases the in-flight guard', async () => {
    upscale.mockRejectedValue(shortBalance())
    const ctx = upscalerCtx()

    await runUpscaler(ctx)

    // The demotion must not cost the exit: a bare `return` here would have
    // parked the person inside the wizard for ever.
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.session.imageUpscalerInProgress).toBe(false)
  })

  it('STILL pages when the charge failed for an operator reason', async () => {
    upscale.mockRejectedValue(chargeBroke())
    const ctx = upscalerCtx()

    await runUpscaler(ctx)

    expect(
      pages().join(' '),
      'insufficientFunds:false is a failed balance write -- money did not move'
    ).toMatch(/Error in imageUpscalerWizard/)
  })

  it('STILL pages, and still apologises, when the provider is down', async () => {
    upscale.mockRejectedValue(new Error('replicate 503'))
    const ctx = upscalerCtx()

    await runUpscaler(ctx)

    expect(pages().join(' ')).toMatch(/Error in imageUpscalerWizard/)
    const said = ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join(' ')
    expect(said).toMatch(/error occurred/i)
  })
})

describe('morphingWizard: the flag that picks the button also picks the level', () => {
  it('does not page the owner for an empty wallet', async () => {
    charge.mockResolvedValue({
      success: false,
      insufficientFunds: true,
      error: 'Insufficient funds. Top up and we continue.',
    })
    const ctx = morphingCtx()

    await runMorphing(ctx)

    expect(charge).toHaveBeenCalledTimes(1)
    expect(pages(), 'a wallet is not a balance-service outage').toEqual([])
    expect(warnings().join(' ')).toMatch(/Balance check failed/)
  })

  it('still offers the customer a way to pay', async () => {
    charge.mockResolvedValue({
      success: false,
      insufficientFunds: true,
      error: 'Insufficient funds. Top up and we continue.',
    })
    const ctx = morphingCtx()

    await runMorphing(ctx)

    // The top-up keyboard is the whole reason the flag was being read.
    const withButtons = ctx.reply.mock.calls.find((c: any[]) => c[1])
    expect(
      withButtons,
      'the refusal must still carry a top-up keyboard'
    ).toBeTruthy()
  })

  it('STILL pages when the balance WRITE failed', async () => {
    // Same shape, no flag: the helper answers this way for an unknown model, a
    // non-positive price and a failed write. The customer may well have had the
    // stars, so only an operator can settle it.
    charge.mockResolvedValue({
      success: false,
      error: 'Failed to update balance',
    })
    const ctx = morphingCtx()

    await runMorphing(ctx)

    expect(pages().join(' ')).toMatch(/Balance check failed/)
  })
})
