/**
 * Regression test: a fast double-tap on the AI Cover "Confirm" button must
 * charge once, not twice.
 *
 * confirm_cover checks the balance and then charges with updateUserBalance and
 * starts generateAICover. answerCbQuery does not stop a second callback —
 * Telegram delivers both — so without an in-flight guard the user paid the full
 * cover price twice and two covers were generated. Same shape as the morphing
 * double-tap.
 *
 * This drives the REAL registered action handler through the scene middleware
 * with a real Telegraf Context; only the money/provider edges are mocked.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/navigation', () => ({
  showMainMenu: vi.fn(async () => {}),
  handleHelpCancel: vi.fn(async () => false),
}))
vi.mock('@/services/rvc', () => ({
  generateAICover: vi.fn(),
  validateSongDuration: vi.fn(async () => ({ valid: true })),
  validateAudioFormat: vi.fn(() => ({ valid: true })),
}))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(async () => 1000),
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(async () => true),
}))
vi.mock('@/core/supabase/voiceModels', () => ({
  getVoiceModel: vi.fn(async () => ({ model_url: 'm' })),
  hasReadyVoiceModel: vi.fn(async () => true),
}))
vi.mock('@/price/helpers/modelsCost', () => ({
  getAICoverCost: vi.fn(() => 50),
  AI_COVER_CONFIG: {},
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { aiCoverWizard } from '@/scenes/aiCoverWizard'
import { updateUserBalance } from '@/core/supabase/updateUserBalance'
import { generateAICover } from '@/services/rvc'

const charge = updateUserBalance as unknown as Mock
const generate = generateAICover as unknown as Mock

function makeCtx(session: Record<string, unknown>) {
  const update: any = {
    update_id: 1,
    callback_query: {
      id: '1',
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      message: { message_id: 1, date: 0, chat: { id: 1, type: 'private' } },
      chat_instance: 'ci',
      data: 'confirm_cover',
    },
  }
  const telegram: any = {
    answerCbQuery: async () => true,
    sendMessage: async () => ({ message_id: 2 }),
    editMessageText: async () => true,
    sendAudio: async () => ({ message_id: 3 }),
    deleteMessage: async () => true,
    getFileLink: async () => ({ href: 'https://example/song.mp3' }),
    callApi: async () => ({}),
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    current: { id: 'aiCoverWizard' },
    state: {},
    session: { cursor: 0 },
  }
  ctx.session = session
  return ctx
}

const run = (ctx: any) =>
  (aiCoverWizard as any).middleware()(ctx, async () => {})

function readySession(): Record<string, unknown> {
  return { wizardData: { songFileId: 'f', voiceModelUrl: 'v' } }
}

describe('AI Cover confirm: double-tap must charge once', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    charge.mockResolvedValue(true)
    // Keep generation pending so the second tap lands while the first is still
    // in flight — the real double-tap race.
    generate.mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(() => resolve({ audioUrl: 'https://example/out.mp3' }), 50)
        )
    )
  })

  it('charges once when the button is tapped twice concurrently', async () => {
    const session = readySession()
    await Promise.all([run(makeCtx(session)), run(makeCtx(session))])
    expect(charge).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('releases the guard after a run so a later tap is charged again', async () => {
    const session = readySession()
    await run(makeCtx(session))
    expect(charge).toHaveBeenCalledTimes(1)
    expect(session.aiCoverGenerationInProgress).toBe(false)

    await run(makeCtx(readySession()))
    expect(charge).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when generation fails, so the user can retry', async () => {
    generate.mockRejectedValue(new Error('provider down'))
    const session = readySession()
    await run(makeCtx(session))
    expect(session.aiCoverGenerationInProgress).toBe(false)
  })
})
