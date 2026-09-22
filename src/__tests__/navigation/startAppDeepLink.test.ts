/**
 * /start app_<route> -- THE SECOND TAP OF EVERY LINK TO THE APP.
 *
 * `t.me/<bot>?start=app_<route>` is how a link to a screen of the app opens
 * inside Telegram while the bot has no Main Mini App (appLinks.ts). The bot
 * must answer it with ONE message carrying ONE web_app button to that screen,
 * and a person who first has to be registered must still get it afterwards.
 *
 * The REAL handler, registered on a fake bot, as in start-first-door.test.ts.
 * Ids and names are invented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabase = vi.hoisted(() => ({
  getUserDetailsSubscription: vi.fn(),
  getReferalsCountAndUserData: vi.fn(),
  createUser: vi.fn(),
}))

vi.mock('@/core/supabase', () => supabase)
vi.mock('@/store', () => ({ defaultSession: { mode: null } }))

import { registerCommands } from '@/navigation/registerCommands'

function fakeBot() {
  const commands = new Map<string, any>()
  const bot: any = {
    command(name: string | string[], handler: any) {
      for (const n of Array.isArray(name) ? name : [name])
        commands.set(n, handler)
      return bot
    },
    use: () => bot,
    on: () => bot,
    action: () => bot,
    hears: () => bot,
    catch: () => bot,
    telegram: {
      setMyCommands: vi.fn(async () => undefined),
      setChatMenuButton: vi.fn(async () => undefined),
      getMe: vi.fn(async () => ({ id: 1, username: 'example_farm_bot' })),
    },
    botInfo: { username: 'example_farm_bot' },
  }
  return { bot, commands }
}

function fakeCtx(text: string) {
  const scene = {
    current: null as any,
    enter: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
  }
  const ctx: any = {
    chat: { id: 900000081, type: 'private' },
    from: { id: 900000081, username: 'someone', language_code: 'en' },
    message: { text },
    session: {},
    state: {},
    scene,
    reply: vi.fn(async () => undefined),
    replyWithHTML: vi.fn(async () => undefined),
    telegram: { sendMessage: vi.fn(async () => undefined) },
    botInfo: { username: 'example_farm_bot' },
  }
  return { ctx, scene }
}

describe('/start app_<route>', () => {
  let commands: Map<string, any>

  beforeEach(() => {
    vi.clearAllMocks()
    const built = fakeBot()
    commands = built.commands
    registerCommands({ bot: built.bot })
  })

  it('a known person gets ONE message with ONE web_app button to that screen', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: true })
    const { ctx, scene } = fakeCtx('/start app_hive')
    await commands.get('start')(ctx)

    expect(scene.enter).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledTimes(1)
    const rows = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(1)
    expect(rows[0][0].web_app.url).toMatch(/tgWebAppStartParam=hive$/)
    expect(ctx.session.appDeepLink).toBeUndefined()
  })

  it('a new person is registered first, and the screen survives in the session', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: false })
    const { ctx, scene } = fakeCtx('/start app_browser')
    await commands.get('start')(ctx)
    expect(scene.enter).toHaveBeenCalledWith('create_user_scene')
    expect(ctx.session.appDeepLink).toBe('browser')
  })

  it('an unknown route is not an app link: the ordinary /start runs', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: true })
    const { ctx } = fakeCtx('/start app_nowhere')
    await commands.get('start')(ctx)
    expect(ctx.session.appDeepLink).toBeUndefined()
    const urls = JSON.stringify(ctx.reply.mock.calls)
    expect(urls).not.toContain('tgWebAppStartParam=nowhere')
  })
})
