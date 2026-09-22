/**
 * A NEW person who arrives by t.me/<bot>?start=app_<route> gets the web_app
 * button to that screen after registering -- not a url button back to /start.
 *
 * Review of PR #2870: CreateUserScene.enter hands createUserStep a copy made
 * with `{ ...ctx }`. Telegraf's `chat` is a getter on the Context prototype, so
 * the spread dropped it; sendAppDoor read `ctx.chat?.type` as undefined, took
 * the non-private branch and answered with a url button to
 * https://t.me/<bot>?start=app_hive -- a loop into a second /start. An existing
 * person (registerCommands, the real ctx) got the web_app button all along.
 *
 * Runs the scene's OWN enter middleware on a REAL Telegraf Context, the only
 * way the prototype getter is really missing from the copy. The Bot API client
 * is a fake object: nothing leaves the test. Ids and names are invented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabase = vi.hoisted(() => ({
  createUser: vi.fn(),
  getReferalsCountAndUserData: vi.fn(),
  supabase: {},
}))

vi.mock('@/core/supabase', () => supabase)
vi.mock('@/core/supabase/updateUserGender', () => ({
  updateUserGender: vi.fn(),
}))
vi.mock('@/handlers/getPhotoUrl', () => ({ getPhotoUrl: vi.fn(() => null) }))
vi.mock('@/middlewares/getUserPhotoUrl', () => ({
  getUserPhotoUrl: vi.fn(async () => null),
}))
vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/helpers/promoHelper', () => ({ processPromoLink: vi.fn() }))
vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: { log: vi.fn() },
}))
vi.mock('@/services/analyzeAvatar', () => ({ analyzeAvatar: vi.fn() }))
vi.mock('@/inngest_app/client', () => ({
  inngest: { send: vi.fn() },
  INNGEST_EVENTS: {},
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { createUserScene } from '@/scenes/createUserScene'

const PERSON = 900000082
const BOT = 'example_farm_bot'

function enterWith(appDeepLink: string) {
  const sendMessage = vi.fn(async () => ({ message_id: 1 }))
  const update = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: PERSON, type: 'private' },
      from: { id: PERSON, is_bot: false, first_name: 'Someone' },
      text: `/start app_${appDeepLink}`,
    },
  }
  const ctx = new Context(
    update as any,
    { sendMessage } as any,
    { id: 111, is_bot: true, first_name: 'B', username: BOT } as any
  ) as any
  ctx.session = { appDeepLink }
  ctx.scene = { enter: vi.fn(), leave: vi.fn() }
  return { ctx, sendMessage }
}

async function runEnter(ctx: any) {
  await (createUserScene.enterMiddleware() as any)(ctx, async () => undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  supabase.createUser.mockResolvedValue([true])
})

describe('CreateUserScene.enter with an app link', () => {
  it('a new person gets the web_app button to the screen the link named', async () => {
    const { ctx, sendMessage } = enterWith('hive')
    await runEnter(ctx)

    const buttons = sendMessage.mock.calls.flatMap(
      (call: any[]) => call[2]?.reply_markup?.inline_keyboard?.flat() ?? []
    )
    expect(buttons).toHaveLength(1)
    expect(buttons[0].web_app?.url).toMatch(/tgWebAppStartParam=hive$/)
    // Not the loop: no url button back to ?start=app_hive.
    expect(JSON.stringify(sendMessage.mock.calls)).not.toContain(
      `t.me/${BOT}?start=app_hive`
    )
    expect(ctx.scene.leave).toHaveBeenCalled()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
    expect(ctx.session.appDeepLink).toBeUndefined()
  })

  it('the registration row carries the private chat id, not null', async () => {
    const { ctx } = enterWith('browser')
    await runEnter(ctx)
    expect(supabase.createUser).toHaveBeenCalledTimes(1)
    expect(supabase.createUser.mock.calls[0][0].chat_id).toBe(PERSON)
  })
})
