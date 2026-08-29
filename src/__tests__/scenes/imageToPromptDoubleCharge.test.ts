/**
 * Regression test: two photos sent in quick succession to the image-to-prompt
 * wizard must run generateImageToPrompt ONCE, not twice.
 *
 * generateImageToPrompt charges the user (MONEY_OUTCOME) and runs the caption
 * pipeline; step 2 only leaves the scene after it resolves. A second photo that
 * arrives during that window is dispatched to step 2 again, so without an
 * in-flight guard the user was charged twice and got two prompt results. Same
 * shape as the voice-avatar / morphing / AI-cover guards.
 *
 * Drives the REAL wizard step through the scene middleware with a real Telegraf
 * Context (cursor at step 2); only the paid service edge is mocked.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(async () => false),
  createHelpCancelKeyboard: vi.fn(() => ({ reply_markup: {} })),
}))
vi.mock('@/services/generateImageToPrompt', () => ({
  generateImageToPrompt: vi.fn(),
}))
vi.mock('@/handlers', () => ({
  getBotToken: vi.fn(() => 'test-token'),
}))
vi.mock('@/core/bot', () => ({
  getBotNameByToken: vi.fn(() => ({ bot_name: 'test_bot' })),
}))

import { Context } from 'telegraf'
import { imageToPromptWizard } from '@/scenes/imageToPromptWizard'
import { generateImageToPrompt } from '@/services/generateImageToPrompt'

const gen = generateImageToPrompt as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      photo: [{ file_id: 'p1', file_unique_id: 'u1', width: 90, height: 90 }],
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    getFileLink: async () => ({ href: 'https://example/img.jpg' }),
    sendMessage: async () => ({ message_id: 2 }),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    current: { id: 'image_to_prompt' },
    state: {},
    session: { cursor: 1, state: {} }, // run step 2
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (imageToPromptWizard as any).middleware()(ctx, async () => {})

describe('image-to-prompt: a double submit must charge/run once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gen.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(undefined), 50))
    )
  })

  it('runs generateImageToPrompt once when two photos arrive concurrently', async () => {
    const session: Record<string, unknown> = {}
    await Promise.all([run(makeCtx(session)), run(makeCtx(session))])
    expect(gen).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a run so a later photo is processed again', async () => {
    const session: Record<string, unknown> = {}
    await run(makeCtx(session))
    expect(gen).toHaveBeenCalledTimes(1)
    expect(session.imageToPromptInProgress).toBe(false)

    await run(makeCtx({}))
    expect(gen).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when generation fails, so the user can retry', async () => {
    gen.mockRejectedValue(new Error('caption service down'))
    const session: Record<string, unknown> = {}
    await run(makeCtx(session))
    expect(session.imageToPromptInProgress).toBe(false)
  })
})
