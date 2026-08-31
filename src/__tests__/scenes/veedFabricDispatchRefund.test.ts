/**
 * Regression test: veed-fabric confirm must not MINT when the async job is
 * already dispatched (#1329).
 *
 * The charge is taken upfront (updateUserBalance MONEY_OUTCOME). The generation
 * is dispatched via asyncLipSyncManager.startAsyncGeneration, which returns a
 * jobId and thereafter OWNS the money outcome (it refunds job.cost on failure,
 * does not re-charge on success). The genError catch wraps BOTH the dispatch and
 * the "Generation started" reply, so if the dispatch succeeds but that reply
 * throws (Telegram hiccup / user blocked the bot), the old code refunded anyway
 * -- video delivered + refunded = mint.
 *
 * Drives the REAL Step-3 confirm handler; only the money/provider edges are
 * mocked. The post-dispatch reply is made to throw. With the `dispatched` guard,
 * case 1 does NOT refund; case 2 (pre-dispatch throw) still does. Reverting the
 * guard makes case 1 refund and fails the test.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(async () => 1000),
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(async () => true),
}))
vi.mock('@/price/helpers/refundAndTell', () => ({
  refundAndTell: vi.fn(async () => {}),
}))
vi.mock('@/core/lipsync/schemas/lipsync-schemas', () => ({
  LipSyncInputBuilder: { forFalVeedFabric: vi.fn(() => ({})) },
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

// async manager: startAsyncGeneration is swapped per-case below
const startAsyncGeneration = vi.fn()
vi.mock('@/core/lipsync/async-lipsync-manager', () => ({
  asyncLipSyncManager: {
    setBotInstance: vi.fn(),
    startAsyncGeneration: (...a: unknown[]) => startAsyncGeneration(...a),
  },
}))

import { Context } from 'telegraf'
import { veedFabricWizard } from '@/scenes/lipSyncWizard/veed-fabric-wizard'
import { refundAndTell } from '@/price/helpers/refundAndTell'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'

const refund = refundAndTell as unknown as Mock
const charge = updateUserBalance as unknown as Mock

// ctx.reply throws once the job has been dispatched, to simulate the
// "Generation started" reply failing AFTER a successful async start.
let dispatched = false

function makeCtx() {
  const update: any = {
    update_id: 1,
    callback_query: {
      id: '1',
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } },
      chat_instance: 'ci',
      data: 'veed_fabric_confirm',
    },
  }
  const telegram: any = {
    answerCbQuery: async () => true,
    sendMessage: async () => ({ message_id: 2 }),
    callApi: async () => ({}),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.reply = vi.fn(async () => {
    if (dispatched) throw new Error('telegram: message failed')
    return { message_id: 2 }
  })
  ctx.scene = {
    leave: async () => {},
    current: { id: 'veed_fabric_lipsync' },
    state: {},
    session: { cursor: 3 }, // Step 3: confirm handler
  }
  ctx.session = {
    veedFabric: {
      imageUrl: 'https://example.com/i.png',
      text: 'hello world',
      audioUrl: 'https://example.com/a.mp3', // present -> skip TTS branch
      cost: 42,
      duration: 5,
    },
  }
  return ctx
}

const run = (ctx: any) =>
  (veedFabricWizard as any).middleware()(ctx, async () => {})

describe('veed-fabric confirm: no refund after the job is dispatched', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dispatched = false
  })

  it('does NOT refund when dispatch succeeds but the confirmation reply throws', async () => {
    startAsyncGeneration.mockImplementation(async () => {
      dispatched = true // any reply after this throws
      return 'lipsync_1712_abcd1234'
    })

    await run(makeCtx()).catch(() => {})

    expect(charge.mock.calls.length).toBe(1) // charged upfront
    expect(startAsyncGeneration).toHaveBeenCalledTimes(1) // job dispatched
    expect(refund).not.toHaveBeenCalled() // and NOT refunded -> no mint
  })

  it('still refunds when the dispatch itself throws (pre-dispatch)', async () => {
    startAsyncGeneration.mockImplementation(async () => {
      throw new Error('fal down')
    })

    await run(makeCtx()).catch(() => {})

    expect(startAsyncGeneration).toHaveBeenCalledTimes(1)
    expect(refund).toHaveBeenCalledTimes(1) // legit pre-dispatch refund
  })
})
