/**
 * Regression: the LIVE 'neuro_photo' wizard is neuroPhotoWizardV2 (it registers
 * the same scene id as V1 and is added AFTER V1 in the Stage, so it shadows V1 —
 * the 10,688-star / 747-op mainstream paid path). Its rewrite dropped the
 * in-flight guard, so a second prompt during the ~10-30s paid generation
 * re-entered neuroPhotoPromptStep and started a SECOND charged
 * generateNeuroPhotoHybrid (bypass_payment_check:false, ~7.5 stars) = double
 * charge. #1342. Mirror of the V1 test neuroPhotoDoubleCharge.test.ts.
 *
 * Drives the REAL V2 step through the scene middleware; only the paid service
 * edge and IO helpers are mocked.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/services/generateNeuroPhotoHybrid', () => ({
  generateNeuroPhotoHybrid: vi.fn(),
}))
vi.mock('@/services/generateNeuroPhotoMulti', () => ({
  generateNeuroPhotoMulti: vi.fn(),
}))
vi.mock('@/core/supabase', () => ({
  supabase: {},
  getUserData: vi.fn(async () => ({ gender: 'male' })),
  getAspectRatio: vi.fn(async () => '1:1'),
}))
vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'neuro_blogger_bot' })),
}))
vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(async () => false),
  showMainMenu: vi.fn(async () => {}),
  getMainMenuText: vi.fn(() => '🏠 Main menu'),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { neuroPhotoWizardV2 } from '@/scenes/neuroPhotoWizardV2'
import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'

const gen = generateNeuroPhotoHybrid as unknown as Mock

function makeCtx(
  session: Record<string, unknown>,
  cursor: number,
  text: string
) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      text,
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    sendMessage: async () => ({ message_id: 2 }),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'neuro_blogger_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    current: { id: 'neuro_photo' },
    state: {},
    session: { cursor },
  }
  ctx.wizard = { next: () => {}, selectStep: () => {}, cursor }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (neuroPhotoWizardV2 as any).middleware()(ctx, async () => {})

const readySession = (): Record<string, unknown> => ({
  userModel: { model_url: 'owner/model:abc', trigger_word: 'TOK' },
})

describe('neuroPhotoV2 (live neuro_photo): a double submission charges once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gen.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ success: true, urls: ['u'] }), 50)
        )
    )
  })

  it('runs generateNeuroPhotoHybrid once when two prompts arrive concurrently', async () => {
    const session = readySession()
    await Promise.all([
      run(makeCtx(session, 1, 'a wizard on a hill')),
      run(makeCtx(session, 1, 'a wizard on a hill')),
    ])
    expect(gen).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a run so a later prompt generates again', async () => {
    const session = readySession()
    await run(makeCtx(session, 1, 'a wizard on a hill'))
    expect(gen).toHaveBeenCalledTimes(1)
    expect(session.neuroPhotoInProgress).toBe(false)

    await run(makeCtx(readySession(), 1, 'a wizard on a hill'))
    expect(gen).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when generation throws, so the user can retry', async () => {
    gen.mockRejectedValue(new Error('provider down'))
    const session = readySession()
    // The step has no catch (only the guard's finally); a gen throw propagates
    // to the middleware. What matters is the finally RELEASED the flag so the
    // user is not locked out.
    await run(makeCtx(session, 1, 'a wizard on a hill')).catch(() => {})
    expect(session.neuroPhotoInProgress).toBe(false)
  })
})
