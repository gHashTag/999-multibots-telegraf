/**
 * Regression test: two taps on a number button in the text-to-image repeat
 * step must run generateTextToImageDirect ONCE, not twice.
 *
 * generateTextToImageDirect charges the user (processBalanceOperation). The
 * repeat-generation button step deliberately stays put after a generation so
 * the user can generate again, so a second tap that arrives while the first
 * generation is in flight ran it again — a double charge and two image batches.
 * Same shape as the sibling guards.
 *
 * Drives the REAL wizard step through the scene middleware with a real Telegraf
 * Context (cursor at the repeat step); only the paid service edge is mocked.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(async () => false),
  sendGenericErrorMessage: vi.fn(async () => {}),
  createHelpCancelKeyboard: vi.fn(() => ({ reply_markup: {} })),
  getMainMenuText: vi.fn(() => '🏠 Main menu'),
  showMainMenu: vi.fn(async () => {}),
}))
vi.mock('@/services/generateTextToImageDirect', () => ({
  generateTextToImageDirect: vi.fn(),
}))
vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(async () => 100),
  updateUserBalance: vi.fn(async () => ({ error: null })),
}))
vi.mock('@/price/models', () => ({ imageModelPrices: {} }))
vi.mock('@/price/helpers', () => ({
  sendBalanceMessage: vi.fn(async () => {}),
  validateAndCalculateImageModelPrice: vi.fn(async () => 5),
}))
vi.mock('@/db/userSettings', () => ({
  getUserProfileAndSettings: vi.fn(async () => ({ profile: {}, settings: {} })),
}))
vi.mock('@/utils/cancelKeyboard', () => ({
  createCancelOnlyKeyboard: vi.fn(() => ({ reply_markup: {} })),
}))
vi.mock('@/scenes/improvePromptWizard', () => ({
  improvePromptWizard: { id: 'improve_prompt' },
}))
vi.mock('@/scenes/sizeWizard', () => ({
  sizeWizard: { id: 'size' },
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { textToImageWizard } from '@/scenes/textToImageWizard'
import { generateTextToImageDirect } from '@/services/generateTextToImageDirect'

const gen = generateTextToImageDirect as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      text: '2️⃣',
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    sendMessage: async () => ({ message_id: 2 }),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    reenter: async () => {},
    current: { id: 'text_to_image' },
    state: {},
    session: { cursor: 3 }, // run step 4 (repeat-generation button step)
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (textToImageWizard as any).middleware()(ctx, async () => {})

function readySession(): Record<string, unknown> {
  return { prompt: 'a cat', selectedImageModel: 'flux-schnell' }
}

describe('text-to-image: a double tap on a number button charges once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gen.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(undefined), 50))
    )
  })

  it('runs generateTextToImageDirect once when two taps arrive concurrently', async () => {
    const session = readySession()
    await Promise.all([run(makeCtx(session)), run(makeCtx(session))])
    expect(gen).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a run so a later tap generates again', async () => {
    const session = readySession()
    await run(makeCtx(session))
    expect(gen).toHaveBeenCalledTimes(1)
    expect(session.textToImageInProgress).toBe(false)

    await run(makeCtx(readySession()))
    expect(gen).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when generation fails, so the user can retry', async () => {
    gen.mockRejectedValue(new Error('provider down'))
    const session = readySession()
    await run(makeCtx(session))
    expect(session.textToImageInProgress).toBe(false)
  })
})
