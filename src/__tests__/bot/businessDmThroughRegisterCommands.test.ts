/**
 * A business DM through the REAL registerCommands chain.
 *
 * businessDmSurvivesDeploy.test.ts wires the middlewares in front of the
 * business handler by hand. This test executes src/navigation/registerCommands
 * itself (every bot.use / command / hears / action it registers, the Stage with
 * all scenes, the multi-photo actions, the inline handler) with session and
 * language middleware in front, exactly as src/bot.ts does, and pushes a
 * business_message through bot.handleUpdate. It proves that nothing between
 * the session middleware and the business middleware throws on an update that
 * has no `from`, no `chat` and no `message`, and that exactly one reply leaves
 * through the connection plus one lead DM to the owner.
 *
 * Load-bearing mocks (measured): aiChatService must export chatWithAI and
 * AI_CHAT_MODELS (aiChatWizard reads it at module load). The supabase mock keeps
 * the language lookup inert; the business path never touches it.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { Telegraf, Telegram } from 'telegraf'

const chatWithAI = vi.fn(async () => 'ok reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...args: unknown[]) => chatWithAI(...(args as [])),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

const OWNER = 144022504
const OWNER_CHAT = 144022504
const connection = (id: string, rights: Record<string, boolean>) => ({
  id,
  user: { id: OWNER, first_name: 'Owner' },
  user_chat_id: OWNER_CHAT,
  date: 1,
  is_enabled: true,
  rights,
})
const dm = (connId: string, chatId: number) => ({
  message_id: 7,
  date: 1,
  chat: { id: chatId, first_name: 'Customer', type: 'private' },
  from: { id: chatId, first_name: 'Customer' },
  text: 'Хочу нейрофото',
  business_connection_id: connId,
})

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
const savedRedis = process.env.REDIS_URL
let registerCommands: (opts: { bot: any }) => void
let sessionMiddleware: () => any
let languageMiddleware: any

beforeAll(async () => {
  delete process.env.REDIS_URL
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    if (method === 'getBusinessConnection') {
      return connection(
        payload.business_connection_id,
        payload.business_connection_id === 'conn-ok' ? { can_reply: true } : {}
      )
    }
    if (method === 'sendMessage')
      return { message_id: 1, date: 0, chat: { id: 1 } }
    return true
  }
  ;({ registerCommands } = await import('@/navigation/registerCommands'))
  ;({ sessionMiddleware } = await import('@/core/session/sessionStore'))
  ;({ languageMiddleware } = await import('@/middlewares/languageMiddleware'))
}, 60_000)

afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
  if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis
})

function productionBot() {
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  bot.use(sessionMiddleware())
  bot.use(languageMiddleware)
  registerCommands({ bot })
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'neuro_blogger_bot',
    first_name: 'B',
  }
  return bot
}

describe('business DM through registerCommands', () => {
  it('one reply through the connection with the deep-link button, one owner DM, nothing thrown', async () => {
    sink = []
    chatWithAI.mockClear()
    const bot = productionBot()
    await bot.handleUpdate({
      update_id: 1,
      business_message: dm('conn-ok', 555),
    } as any)

    const viaConnection = sink.filter(
      s =>
        s.method === 'sendMessage' &&
        s.payload.business_connection_id === 'conn-ok'
    )
    expect(viaConnection).toHaveLength(1)
    expect(viaConnection[0].payload).toMatchObject({
      chat_id: 555,
      text: 'ok reply',
    })
    expect(
      viaConnection[0].payload.reply_markup.inline_keyboard[0][0].url
    ).toBe('https://t.me/neuro_blogger_bot?start=svc_neurophoto')
    const ownerDm = sink.filter(
      s => s.method === 'sendMessage' && !s.payload.business_connection_id
    )
    expect(ownerDm).toHaveLength(1)
    expect(ownerDm[0].payload.chat_id).toBe(OWNER_CHAT)
    expect(chatWithAI).toHaveBeenCalledTimes(1)
    const unexpected = sink
      .map(s => s.method)
      .filter(
        m =>
          ![
            'sendMessage',
            'sendChatAction',
            'getBusinessConnection',
            'getMe',
          ].includes(m)
      )
    expect(unexpected).toEqual([])
  }, 60_000)

  it('control: a connection without can_reply sends nothing and calls no LLM', async () => {
    sink = []
    chatWithAI.mockClear()
    const bot = productionBot()
    await bot.handleUpdate({
      update_id: 2,
      business_message: dm('conn-noreply', 556),
    } as any)
    expect(sink.filter(s => s.method === 'sendMessage')).toHaveLength(0)
    expect(chatWithAI).not.toHaveBeenCalled()
  }, 60_000)
})
