/**
 * Regression test: a double photo submission in the face-swap wizard must run
 * the paid generateFaceSwap ONCE, not twice.
 *
 * Step 2 (the swap step) reads the balance, awaits generateFaceSwap (~10-30s),
 * then charges 10 stars — and never advances the cursor, it only leaves at the
 * end. So a second photo arriving while the first swap is in flight re-entered
 * step 2 and started a second paid swap: a double 10⭐ charge and two results.
 * Same shape as the sibling guards (neuroPhoto / textToImage / voiceAvatar / …).
 *
 * Drives the REAL wizard step through the scene middleware with a real Telegraf
 * Context (cursor at step 2); only the paid service edge and IO are mocked.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/services/generateFaceSwap', () => ({
  generateFaceSwap: vi.fn(),
}))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(async () => 100),
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(async () => true),
}))
vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: { MONEY_OUTCOME: 'money_outcome' },
}))
vi.mock('@/utils/cancelButton', () => ({
  createCancelButton: vi.fn(() => ['Cancel']),
  handleCancelButton: vi.fn(async () => false),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { faceSwapWizard } from '@/scenes/faceSwapWizard'
import { generateFaceSwap } from '@/services/generateFaceSwap'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'

const gen = generateFaceSwap as unknown as Mock
const charge = updateUserBalance as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 100, height: 100 }],
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    sendMessage: async () => ({ message_id: 2 }),
    sendPhoto: async () => ({ message_id: 3 }),
    getFile: async () => ({ file_path: 'photos/x.jpg' }),
    deleteMessage: async () => true,
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    reenter: async () => {},
    current: { id: 'faceSwapWizard' },
    state: {},
    session: { cursor: 2 }, // run step 2 (swap + paid generation)
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (faceSwapWizard as any).middleware()(ctx, async () => {})

function readySession(): Record<string, unknown> {
  return { targetImageUrl: 'https://t/target.jpg' }
}

describe('face-swap: a double photo submission charges once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    charge.mockResolvedValue(true)
    gen.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                success: true,
                resultUrl: 'https://t/result.jpg',
                processingTime: 1000,
              }),
            50
          )
        )
    )
  })

  it('runs generateFaceSwap once when two photos arrive concurrently', async () => {
    const session = readySession()
    await Promise.all([run(makeCtx(session)), run(makeCtx(session))])
    expect(gen).toHaveBeenCalledTimes(1)
    expect(charge).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a run so a later photo generates again', async () => {
    const session = readySession()
    await run(makeCtx(session))
    expect(gen).toHaveBeenCalledTimes(1)
    expect(session.faceSwapInProgress).toBe(false)

    await run(makeCtx(readySession()))
    expect(gen).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when generation throws, so the user can retry', async () => {
    gen.mockRejectedValue(new Error('provider down'))
    const session = readySession()
    await run(makeCtx(session)).catch(() => {})
    expect(session.faceSwapInProgress).toBe(false)
  })
})
