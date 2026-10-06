import { describe, it, expect } from 'vitest'
import {
  makeCreateBotTool,
  BOTFATHER_PATH,
  BOTFATHER_SOURCE,
  MANAGER_BOT,
  type CreateBotDeps,
} from './managed-bot-create'
import { BOT_USERNAME_RE } from '../managed-bots-protocol'

// Shorter than a real secret half, so no secret scanner reads it as one.
const FAKE_TOKEN = '900000033:fixture-not-a-token'

function stub(canManage: boolean, sendOk = true) {
  const calls: Array<{ method: string; body?: any }> = []
  const deps: CreateBotDeps = {
    async managerApi() {
      return async (method, body) => {
        calls.push({ method, body })
        if (method === 'getMe')
          return {
            ok: true,
            result: {
              id: 1,
              username: MANAGER_BOT,
              can_manage_bots: canManage,
              token: FAKE_TOKEN,
            },
          }
        if (method === 'sendMessage')
          return sendOk
            ? { ok: true, result: {} }
            : {
                ok: false,
                description: 'Forbidden: bot was blocked by the user',
              }
        return { ok: false, description: 'unexpected' }
      }
    },
  }
  return { tool: makeCreateBotTool(deps), calls }
}

const ctx = { telegramId: '900000034', pool: null } as any

describe('tg_create_bot', () => {
  it('returns the newbot link and sends the button when can_manage_bots is true', async () => {
    const { tool, calls } = stub(true)
    const out: any = await tool.handler(
      { name: 'Shop helper', username: 'shop_helper_bot', lang: 'en' },
      ctx
    )
    expect(out.ok).toBe(true)
    expect(out.link).toBe(
      `https://t.me/newbot/${MANAGER_BOT}/shop_helper_bot?name=Shop%20helper`
    )
    expect(out.button_sent).toBe(true)
    const send = calls.find(c => c.method === 'sendMessage')!
    expect(
      send.body.reply_markup.keyboard[0][0].request_managed_bot
        .suggested_username
    ).toBe('shop_helper_bot')
  })

  it('still returns the link when the button cannot be delivered', async () => {
    const { tool } = stub(true, false)
    const out: any = await tool.handler({ username: 'shop_helper_bot' }, ctx)
    expect(out.ok).toBe(true)
    expect(out.link).toMatch(/^https:\/\/t\.me\/newbot\//)
    expect(out.button_sent).toBe(false)
  })

  it('refuses honestly with the verified BotFather path when can_manage_bots is false', async () => {
    const { tool, calls } = stub(false)
    const out: any = await tool.handler({ username: 'shop_helper_bot' }, ctx)
    expect(out.ok).toBe(false)
    expect(out.state).toBe('management_off')
    expect(out.how_to_enable).toBe(BOTFATHER_PATH)
    expect(out.how_to_enable).toContain('Bot Management Mode')
    expect(out.source).toBe(BOTFATHER_SOURCE)
    expect(JSON.stringify(out)).not.toContain('t.me/newbot')
    expect(out.link).toBeUndefined()
    // No BotFather scripting, no message sent: getMe only.
    expect(calls.map(c => c.method)).toEqual(['getMe'])
  })

  it('suggests a valid username when none or an invalid one is given', async () => {
    const { tool } = stub(true)
    for (const username of [undefined, '1bad name!', 'x', '@example_bot']) {
      const out: any = await tool.handler({ username }, ctx)
      expect(BOT_USERNAME_RE.test(out.suggested.username)).toBe(true)
    }
  })

  it('never returns a token, in either branch', async () => {
    for (const can of [true, false]) {
      const { tool } = stub(can)
      const text = JSON.stringify(await tool.handler({}, ctx))
      expect(text).not.toContain(FAKE_TOKEN)
      expect(text).not.toMatch(/\d{6,}:[A-Za-z0-9_-]{30,}/)
    }
  })

  it('says why when the render holds no manager token', async () => {
    const tool = makeCreateBotTool({
      async managerApi() {
        return null
      },
    })
    const out: any = await tool.handler({}, ctx)
    expect(out.ok).toBe(false)
    expect(out.state).toBe('manager_unavailable')
  })
})
