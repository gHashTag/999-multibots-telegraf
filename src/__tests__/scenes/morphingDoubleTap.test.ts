/**
 * Regression test: a fast double-tap on a morphing prompt-preset button must
 * charge once, not twice.
 *
 * The balance charge lives inside startMorphingGeneration and SIX buttons reach
 * it (confirm loop/linear + four prompt presets). answerCbQuery does not stop a
 * second callback — Telegram delivers both — so without an in-flight guard the
 * user paid the full morphing price twice and two generations started.
 *
 * This drives the REAL registered action handler through the scene middleware
 * with a real Telegraf Context; only the money/provider edges are mocked, so no
 * network and no money.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({ handleHelpCancel: vi.fn(async () => false) }))
vi.mock('@/services/generateMorphing', () => ({
  generateMorphing: vi.fn(),
}))
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
import { morphingWizard } from '@/scenes/morphingWizard'
import { processBalanceVideoOperationHelper } from '@/modules/videoGenerator/helpers/priceHelper'
import { generateMorphing } from '@/services/generateMorphing'

const charge = processBalanceVideoOperationHelper as unknown as Mock
const generate = generateMorphing as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    callback_query: {
      id: '1',
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } },
      chat_instance: 'ci',
      data: 'morphing_prompt_cinematic',
    },
  }
  const telegram: any = {
    answerCbQuery: async () => true,
    sendMessage: async () => ({ message_id: 2 }),
    editMessageText: async () => true,
    sendVideo: async () => ({ message_id: 3 }),
    callApi: async () => ({}),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    current: { id: 'morphing_wizard' },
    state: {},
    session: { cursor: 0 },
  }
  ctx.session = session
  return ctx
}

function twoImages() {
  return [
    { buffer: Buffer.from('a'), filename: 'a.jpg' },
    { buffer: Buffer.from('b'), filename: 'b.jpg' },
  ]
}

const run = (ctx: any) =>
  (morphingWizard as any).middleware()(ctx, async () => {})

describe('morphing prompt preset: double-tap must charge once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    charge.mockResolvedValue({
      success: true,
      paymentAmount: 15,
      newBalance: 85,
    })
    // Keep the generation pending so the second tap lands while the first is
    // still in flight — exactly the real double-tap race.
    generate.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ success: true, videoUrl: 'u' }), 50)
        )
    )
  })

  it('charges once when the button is tapped twice concurrently', async () => {
    const session: Record<string, unknown> = {
      morphingImages: twoImages(),
      morphingType: 'linear',
    }
    // Same session object, as Telegram would deliver two callbacks for one user.
    await Promise.all([run(makeCtx(session)), run(makeCtx(session))])

    expect(charge).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('charges once per tap when taps are sequential (guard released)', async () => {
    const session: Record<string, unknown> = {
      morphingImages: twoImages(),
      morphingType: 'linear',
    }
    await run(makeCtx(session))
    expect(charge).toHaveBeenCalledTimes(1)
    expect(session.morphingGenerationInProgress).toBe(false)

    // A completed run clears the wizard's images, so a legitimate second run
    // starts from a fresh upload. The point here is that the guard does not
    // wedge it: the charge happens again.
    session.morphingImages = twoImages()
    await run(makeCtx(session))
    expect(charge).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when generation fails, so the user can retry', async () => {
    generate.mockRejectedValue(new Error('provider down'))
    const session: Record<string, unknown> = {
      morphingImages: twoImages(),
      morphingType: 'linear',
    }

    await run(makeCtx(session))

    expect(session.morphingGenerationInProgress).toBe(false)
  })
})
