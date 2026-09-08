/**
 * Business DMs must be answered on today's Bot API and after a redeploy.
 *
 * The owner links a bot to their personal Telegram account (Business Mode);
 * customers write to the owner's DM and the bot answers on their behalf via
 * business_connection_id. Three ways that went silent, visible in logs only as
 * `[Business] No active connection or cannot reply`:
 *
 * 1. Bot API 9.0 replaced `BusinessConnection.can_reply` with
 *    `rights.can_reply`. handleBusinessConnection read the old field, stored
 *    `canReply: undefined`, and dropped every business_message.
 * 2. The connection registry is process memory. After a redeploy it is empty
 *    and Telegram re-sends `business_connection` only when the link changes,
 *    so every DM after a deploy was dropped until the owner re-linked.
 * 3. createBusinessMiddleware captured `bot.botInfo.username` at registration,
 *    before launch() fills botInfo: the sales prompt named an empty bot ("@.")
 *    and could not send a customer anywhere.
 *
 * Runtime tests with the LLM mocked; every test imports a fresh module so the
 * registry starts empty exactly as a new container does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Telegraf, Telegram, Scenes } from 'telegraf'

const chatWithAI = vi.fn(async () => 'ok reply')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...args: unknown[]) => chatWithAI(...(args as [])),
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

const CONN = 'conn-owner-1'
const BOT = 'neuro_blogger_bot'

/** Bot API 9+ shape: `rights`, no `can_reply`. */
const connection = (extra: Record<string, unknown> = {}) => ({
  id: CONN,
  user: { id: 144022504, first_name: 'Owner' },
  user_chat_id: 144022504,
  date: 1,
  is_enabled: true,
  rights: { can_reply: true },
  ...extra,
})

const dm = (text = 'How much is it?', chatId = 555) => ({
  message_id: 7,
  date: 1,
  chat: { id: chatId, first_name: 'Customer', type: 'private' },
  from: { id: chatId, first_name: 'Customer' },
  text,
  business_connection_id: CONN,
})

function fakeBot(lookup: () => Promise<unknown> = async () => connection()) {
  const sendMessage = vi.fn(async () => ({ message_id: 1 }))
  const callApi = vi.fn(async (method: string) => {
    if (method === 'getBusinessConnection') return lookup()
    throw new Error(`unexpected api call ${method}`)
  })
  return { botInfo: { username: BOT }, telegram: { sendMessage, callApi } }
}

async function freshService() {
  vi.resetModules()
  return await import('@/services/businessBotService')
}

beforeEach(() => {
  chatWithAI.mockClear()
})

describe('business DM: Bot API 9+ connection shape', () => {
  it('answers a DM when the connection carries rights.can_reply and no can_reply', async () => {
    const svc = await freshService()
    const bot = fakeBot()
    svc.handleBusinessConnection(connection() as any)

    await svc.handleBusinessMessage(dm() as any, bot as any, BOT)

    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1)
    expect(bot.telegram.sendMessage.mock.calls[0][2]).toEqual({
      business_connection_id: CONN,
    })
    expect(bot.telegram.callApi).not.toHaveBeenCalled()
  })

  it('control: rights without can_reply, or a disabled connection, is not answered', async () => {
    for (const extra of [
      { rights: {} },
      { rights: { can_reply: true }, is_enabled: false },
    ]) {
      const svc = await freshService()
      const bot = fakeBot(async () => connection(extra))
      svc.handleBusinessConnection(connection(extra) as any)
      await svc.handleBusinessMessage(dm() as any, bot as any, BOT)
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled()
      expect(chatWithAI).not.toHaveBeenCalled()
    }
  })

  it('canReplyOf accepts both API shapes and refuses everything else', async () => {
    const { canReplyOf } = await freshService()
    expect(canReplyOf(connection() as any)).toBe(true)
    expect(
      canReplyOf(connection({ rights: undefined, can_reply: true }) as any)
    ).toBe(true)
    expect(canReplyOf(connection({ rights: {} }) as any)).toBe(false)
    expect(canReplyOf(connection({ rights: undefined }) as any)).toBe(false)
  })
})

describe('business DM: after a redeploy the registry is empty', () => {
  it('resolves an unknown connection id via getBusinessConnection once, then answers from cache', async () => {
    const svc = await freshService()
    const bot = fakeBot()

    await svc.handleBusinessMessage(dm() as any, bot as any, BOT)
    expect(bot.telegram.callApi).toHaveBeenCalledWith('getBusinessConnection', {
      business_connection_id: CONN,
    })
    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(1)

    await svc.handleBusinessMessage(
      dm('and video?', 556) as any,
      bot as any,
      BOT
    )
    expect(bot.telegram.callApi).toHaveBeenCalledTimes(1)
    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(2)
    expect(svc.getBusinessStats().activeConnections).toBe(1)
  })

  it('a failed lookup drops the message: no reply, no LLM call, no throw', async () => {
    const svc = await freshService()
    const bot = fakeBot(async () => {
      throw new Error('Bad Request: business connection not found')
    })
    await expect(
      svc.handleBusinessMessage(dm() as any, bot as any, BOT)
    ).resolves.toBeUndefined()
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled()
    expect(chatWithAI).not.toHaveBeenCalled()
  })
})

describe('business DM through the production middleware chain', () => {
  it('one reply with business_connection_id, nothing else sent, prompt names the bot filled after registration', async () => {
    const svc = await freshService()
    const { sessionMiddleware } = await import('@/core/session/sessionStore')
    const { languageMiddleware } = await import(
      '@/middlewares/languageMiddleware'
    )
    const { replyWitness, silenceNet, deadPressNet } = await import(
      '@/navigation/middleware/noSilence'
    )

    const sink: Array<{ method: string; payload: any }> = []
    const realCallApi = (Telegram.prototype as any).callApi
    const savedRedis = process.env.REDIS_URL
    delete process.env.REDIS_URL
    ;(Telegram.prototype as any).callApi = async (
      method: string,
      payload: any
    ) => {
      sink.push({ method, payload })
      if (method === 'getBusinessConnection') return connection()
      return { message_id: 1, date: 0, chat: { id: 555, type: 'private' } }
    }
    try {
      const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
      bot.use(sessionMiddleware())
      bot.use(languageMiddleware as any)
      bot.use(replyWitness)
      bot.use(silenceNet)
      bot.use(deadPressNet)
      bot.use(new Scenes.Stage<any>([]).middleware() as any)
      svc.createBusinessMiddleware(bot as any)
      // launch() fills botInfo AFTER every middleware is registered.
      ;(bot as any).botInfo = {
        id: 111,
        is_bot: true,
        username: BOT,
        first_name: 'B',
      }

      await bot.handleUpdate({ update_id: 1, business_message: dm() } as any)

      const sends = sink.filter(s => s.method === 'sendMessage')
      expect(sends).toHaveLength(1)
      expect(sends[0].payload).toMatchObject({
        chat_id: 555,
        text: 'ok reply',
        business_connection_id: CONN,
      })
      const other = sink
        .map(s => s.method)
        .filter(m => m !== 'sendMessage' && m !== 'getBusinessConnection')
      expect(other).toEqual([])

      expect(chatWithAI).toHaveBeenCalledTimes(1)
      const system = (chatWithAI.mock.calls[0] as any)[0][0].content as string
      expect(system).toContain(`@${BOT}.`)
    } finally {
      ;(Telegram.prototype as any).callApi = realCallApi
      if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis
    }
  })
})
