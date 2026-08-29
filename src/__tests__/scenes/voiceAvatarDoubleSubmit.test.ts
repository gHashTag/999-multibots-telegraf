/**
 * Regression test: two voice messages sent in quick succession to the voice
 * avatar wizard must create ONE voice, not two.
 *
 * Step 2 runs createVoiceAvatar (level-up + an ElevenLabs voice + a voice_id DB
 * write) and only leaves the scene after it resolves. Telegram delivers a second
 * message that arrives during that window to step 2 again, so without an
 * in-flight guard the user was levelled up twice and a second, now orphaned,
 * ElevenLabs voice was created. Same shape as the morphing / AI-cover double-tap.
 *
 * This drives the REAL wizard step through the scene middleware with a real
 * Telegraf Context (cursor at step 2); only the provider edge is mocked.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/language', () => ({
  isRussian: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(async () => {}),
  handleHelpCancel: vi.fn(async () => false),
  createHelpCancelKeyboard: vi.fn(() => ({})),
}))
vi.mock('@/services/plan_b/createVoiceAvatar', () => ({
  createVoiceAvatar: vi.fn(),
}))
vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(async () => 1000),
}))
vi.mock('@/price/helpers', () => ({
  sendInsufficientStarsMessage: vi.fn(async () => {}),
  sendBalanceMessage: vi.fn(async () => {}),
  voiceConversationCost: 0,
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { voiceAvatarWizard } from '@/scenes/voiceAvatarWizard'
import { createVoiceAvatar } from '@/services/plan_b/createVoiceAvatar'

const create = createVoiceAvatar as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      voice: { file_id: 'vf', duration: 3 },
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    getFile: async () => ({ file_path: 'voice/file.ogg' }),
    sendMessage: async () => ({ message_id: 2 }),
    editMessageText: async () => true,
    deleteMessage: async () => true,
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    current: { id: 'voice' },
    state: {},
    session: { cursor: 1 }, // run step 2 (the voice handler)
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (voiceAvatarWizard as any).middleware()(ctx, async () => {})

describe('voice avatar: a double submit must create one voice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Keep creation pending so the second message lands while the first is
    // still in flight — the real race.
    create.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(undefined), 50))
    )
  })

  it('creates once when two voice messages arrive concurrently', async () => {
    const session: Record<string, unknown> = {}
    await Promise.all([run(makeCtx(session)), run(makeCtx(session))])
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a run so a later submit creates again', async () => {
    const session: Record<string, unknown> = {}
    await run(makeCtx(session))
    expect(create).toHaveBeenCalledTimes(1)
    expect(session.voiceAvatarInProgress).toBe(false)

    await run(makeCtx({}))
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when creation fails, so the user can retry', async () => {
    create.mockRejectedValue(new Error('elevenlabs down'))
    const session: Record<string, unknown> = {}
    await run(makeCtx(session))
    expect(session.voiceAvatarInProgress).toBe(false)
  })
})
