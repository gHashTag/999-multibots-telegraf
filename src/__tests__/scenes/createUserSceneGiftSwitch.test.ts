/**
 * THE WELCOME GIFT IS OFF BY DEFAULT (owner, 2026-10-12): the kie.ai balance
 * was at zero, and every registration spent owner money on a free portrait
 * that then failed and paged the owner's phone.
 *
 * This is the FIRST door -- the trigger in CreateUserScene. A newcomer with a
 * real Telegram avatar must NOT be promised a gift, and no
 * welcome/avatar.generate event may be sent, unless WELCOME_GIFT_ENABLED=true.
 * The function's own guard (its own file's test) is the second door.
 *
 * Runs the scene's real enter middleware on a real Telegraf Context (the
 * prototype-getter trap from createUserSceneAppDoor.test.ts). Ids and names
 * are invented; nothing leaves the test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const supabase = vi.hoisted(() => ({
  createUser: vi.fn(),
  getReferalsCountAndUserData: vi.fn(),
  supabase: {},
}))
const inngest = vi.hoisted(() => ({ send: vi.fn() }))
const analyzeAvatar = vi.hoisted(() => vi.fn())

vi.mock('@/core/supabase', () => supabase)
vi.mock('@/core/supabase/updateUserGender', () => ({
  updateUserGender: vi.fn(),
}))
vi.mock('@/handlers/getPhotoUrl', () => ({ getPhotoUrl: vi.fn(() => null) }))
vi.mock('@/middlewares/getUserPhotoUrl', () => ({
  // A real Telegram avatar is what opens the gift branch at all.
  getUserPhotoUrl: vi.fn(async () => 'https://example.com/photo.jpg'),
}))
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/helpers/promoHelper', () => ({ processPromoLink: vi.fn() }))
vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: { log: vi.fn() },
}))
vi.mock('@/services/analyzeAvatar', () => ({ analyzeAvatar }))
vi.mock('@/inngest_app/client', () => ({
  inngest,
  INNGEST_EVENTS: { WELCOME_AVATAR_GENERATE: 'welcome/avatar.generate' },
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { createUserScene } from '@/scenes/createUserScene'

const PERSON = 900000084
const BOT = 'example_farm_bot'
const SAVED = process.env.WELCOME_GIFT_ENABLED

function enterNewcomer() {
  const sendMessage = vi.fn(async () => ({ message_id: 1 }))
  const update = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: PERSON, type: 'private' },
      from: { id: PERSON, is_bot: false, first_name: 'Newcomer' },
      text: '/start',
    },
  }
  const ctx = new Context(
    update as any,
    { sendMessage } as any,
    { id: 111, is_bot: true, first_name: 'B', username: BOT } as any
  ) as any
  ctx.session = {}
  ctx.scene = { enter: vi.fn(), leave: vi.fn() }
  return { ctx, sendMessage }
}

async function runEnter(ctx: any) {
  await (createUserScene.enterMiddleware() as any)(ctx, async () => undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.WELCOME_GIFT_ENABLED
  supabase.createUser.mockResolvedValue([true])
  analyzeAvatar.mockResolvedValue({
    hasFace: true,
    gender: 'unknown',
    confidence: 0.9,
  })
})

afterEach(() => {
  if (SAVED === undefined) delete process.env.WELCOME_GIFT_ENABLED
  else process.env.WELCOME_GIFT_ENABLED = SAVED
})

describe('CreateUserScene welcome gift switch (default OFF)', () => {
  it('a new person with an avatar gets no gift promise and sends no generate event', async () => {
    const { ctx, sendMessage } = enterNewcomer()
    await runEnter(ctx)

    expect(analyzeAvatar).not.toHaveBeenCalled()
    const sent = sendMessage.mock.calls.map((c: any[]) => String(c[0]))
    // Literals, not one regex: the no-cyrillic gate reads a regex body as
    // code, and only a string literal may carry Cyrillic.
    expect(sent.join('\n')).not.toContain('подар')
    expect(sent.join('\n')).not.toMatch(/gift/i)
    const events = inngest.send.mock.calls.map((c: any[]) => c[0]?.name)
    expect(events).not.toContain('welcome/avatar.generate')
  })

  it('WELCOME_GIFT_ENABLED=true restores the gift trigger', async () => {
    process.env.WELCOME_GIFT_ENABLED = 'true'
    const { ctx } = enterNewcomer()
    await runEnter(ctx)

    expect(analyzeAvatar).toHaveBeenCalledTimes(1)
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'welcome/avatar.generate' })
    )
  })
})
