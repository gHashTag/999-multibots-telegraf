/**
 * Regression test: a double submission in the neuroPhoto wizard must run the
 * paid generateNeuroPhotoHybrid ONCE, not twice.
 *
 * generateNeuroPhotoHybrid charges the user (bypass_payment_check:false, ~7.5
 * stars). Both live entry points kept the wizard cursor on the same step across
 * the ~10-30s generation await, so a second message that arrived while the
 * first generation was in flight re-entered the step and started a second paid
 * generation — a double charge and two images from one intended request:
 *   - the prompt step (a second text prompt), and
 *   - the repeat-generation button step (a second number-button tap).
 * Same shape as the sibling guards (textToImage / voiceAvatar / morphing / …).
 *
 * Drives the REAL wizard steps through the scene middleware with a real
 * Telegraf Context; only the paid service edge and IO helpers are mocked.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/services/generateNeuroPhotoHybrid', () => ({
  generateNeuroPhotoHybrid: vi.fn(),
}))
vi.mock('@/core/supabase', () => ({
  supabase: {},
  getUserData: vi.fn(async () => ({ gender: 'male' })),
  getAspectRatio: vi.fn(async () => '1:1'),
  getActiveUserModelsByType: vi.fn(async () => []),
  getReferalsCountAndUserData: vi.fn(async () => ({})),
}))
vi.mock('@/core/supabase/getActiveUserModelsByTypeForHaim', () => ({
  getActiveUserModelsByTypeForHaim: vi.fn(async () => []),
}))
vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'neuro_blogger_bot' })),
  getBotNameByUsername: vi.fn(() => ({ bot_name: 'neuro_blogger_bot' })),
}))
vi.mock('@/navigation', () => ({
  sendGenericErrorMessage: vi.fn(async () => {}),
  sendPhotoDescriptionRequest: vi.fn(async () => {}),
  getButtonTextsByMode: vi.fn(() => []),
  createMainMenuKeyboard: vi.fn(() => ({ reply_markup: {} })),
  handleHelpCancel: vi.fn(async () => false),
  getMainMenuText: vi.fn(() => '🏠 Main menu'),
  CancelButtonService: { executeMainMenu: vi.fn(async () => {}) },
  showMainMenu: vi.fn(async () => {}),
}))
vi.mock('@/handlers/getUserInfo', () => ({
  getUserInfo: vi.fn(() => ({ telegramId: '223757230' })),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { neuroPhotoWizard } from '@/scenes/neuroPhotoWizard'
import { ModeEnum } from '@/interfaces/modes'
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
    reenter: async () => {},
    current: { id: ModeEnum.NeuroPhoto },
    state: {},
    session: { cursor },
  }
  ctx.wizard = {
    next: () => {},
    selectStep: () => {},
    cursor,
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (neuroPhotoWizard as any).middleware()(ctx, async () => {})

function readySession(): Record<string, unknown> {
  return {
    prompt: 'a wizard on a hill',
    userModel: { model_url: 'owner/model:abc', trigger_word: 'TOK' },
  }
}

describe('neuroPhoto: a double submission charges once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gen.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ success: true, urls: ['u'] }), 50)
        )
    )
  })

  // --- prompt step (cursor 1): a second text prompt during generation ---

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
    await run(makeCtx(session, 1, 'a wizard on a hill'))
    expect(session.neuroPhotoInProgress).toBe(false)
  })

  // --- button step (cursor 2): a second number-button tap during generation ---

  it('runs generateNeuroPhotoHybrid once when two number taps arrive concurrently', async () => {
    const session = readySession()
    await Promise.all([
      run(makeCtx(session, 2, '2️⃣')),
      run(makeCtx(session, 2, '2️⃣')),
    ])
    expect(gen).toHaveBeenCalledTimes(1)
  })
})
