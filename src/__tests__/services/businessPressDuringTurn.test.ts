/**
 * THE OWNER CAN TAKE A CHAT BACK WHILE THE AGENT IS STILL WRITING.
 *
 * Before the agent lanes, the business middleware awaited the whole turn, and
 * Telegraf does not fetch the next batch until every handler of the current
 * one has settled. So the owner's "take over" press, or the owner's own line
 * typed into the client's chat, reached the bot only AFTER the agent's reply
 * had already gone to the client -- a stop button that arrives after the
 * thing it stops. Verified before this change with the real middleware chain:
 * the reply to the client went out 2 ms before the owner's takeover message
 * was even processed.
 *
 * Through the REAL registerCommands chain (session, language, every
 * middleware, the crm:mute dispatcher), with only the agent and the Bot API
 * faked:
 *   - the client's message is accepted at once while its turn is pending;
 *   - the owner's press (or typed line) is handled while that turn is STILL
 *     pending -- the pause is in force before the agent has answered;
 *   - when the agent answers, nothing reaches the client, and the owner is
 *     told once that the agent's answer was not sent.
 *
 * Fictional ids only (9000000xx).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { Telegraf, Telegram } from 'telegraf'

const OWNER = 900000031
process.env.ADMIN_IDS = String(OWNER)

interface Ask {
  text: string
  settled: boolean
  answer: (text: string) => void
}
const asks: Ask[] = []

vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'fallback, never expected here'),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))
vi.mock('@/services/trinityAgent', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  /* cyrillic-ok */ спроситьАгента: (_chatId: string, text: string) =>
    new Promise(resolve => {
      const ask: Ask = {
        text,
        settled: false,
        answer: t => {
          ask.settled = true
          resolve({ текст: t }) // cyrillic-ok: pre-existing field
        },
      }
      asks.push(ask)
    }),
  recordTurns: vi.fn(async () => undefined),
  fetchHistory: vi.fn(async () => []),
}))
vi.mock('@/services/modelSwitch', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mirrorDm: vi.fn(async () => ({ ok: true })),
  ingestChats: vi.fn(async () => ({})),
}))

const DISCARD_NOTICE = 'Ответ агента не отправлен — чат ваш.'

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
const savedRedis = process.env.REDIS_URL
let registerCommands: (opts: { bot: any }) => void
let sessionMiddleware: () => any
let languageMiddleware: any
let svc: typeof import('@/services/businessBotService')
let agentLanes: typeof import('@/services/agentLanes').agentLanes

beforeAll(async () => {
  delete process.env.REDIS_URL
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    if (method === 'getBusinessConnection') {
      return {
        id: payload.business_connection_id,
        user: { id: OWNER, first_name: 'Owner' },
        user_chat_id: OWNER,
        date: 1,
        is_enabled: true,
        rights: { can_reply: true },
      }
    }
    if (method === 'sendMessage')
      return { message_id: 1, date: 0, chat: { id: payload.chat_id } }
    return true
  }
  ;({ registerCommands } = await import('@/navigation/registerCommands'))
  ;({ sessionMiddleware } = await import('@/core/session/sessionStore'))
  ;({ languageMiddleware } = await import('@/middlewares/languageMiddleware'))
  svc = await import('@/services/businessBotService')
  ;({ agentLanes } = await import('@/services/agentLanes'))
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
    username: 'probe_bot',
    first_name: 'B',
  }
  return bot
}

let updateId = 1000
const businessMessage = (
  connId: string,
  chatId: number,
  fromId: number,
  text: string
) => ({
  update_id: ++updateId,
  business_message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, first_name: 'Client', type: 'private' },
    from: { id: fromId, first_name: fromId === OWNER ? 'Owner' : 'Client' },
    text,
    business_connection_id: connId,
  },
})
const ownerPress = (data: string) => ({
  update_id: ++updateId,
  callback_query: {
    id: `q${updateId}`,
    from: {
      id: OWNER,
      is_bot: false,
      first_name: 'Owner',
      language_code: 'ru',
    },
    chat_instance: 'c1',
    data,
    message: {
      message_id: 7,
      date: Math.floor(Date.now() / 1000),
      chat: { id: OWNER, type: 'private' },
      text: 'a card',
    },
  },
})

/** Resolves with how long `p` took, or fails if it takes longer than `ms`. */
async function settlesWithin(p: Promise<unknown>, ms: number) {
  const t0 = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    p,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`still pending after ${ms} ms`)),
        ms
      )
    }),
  ])
  clearTimeout(timer)
  return Date.now() - t0
}

const toClient = (chatId: number) =>
  sink.filter(
    s =>
      s.method === 'sendMessage' &&
      s.payload.business_connection_id &&
      s.payload.chat_id === chatId
  )
const discardNotices = () =>
  sink.filter(
    s =>
      s.method === 'sendMessage' &&
      s.payload.chat_id === OWNER &&
      s.payload.text === DISCARD_NOTICE
  )

describe('the owner takes the chat back mid-turn', () => {
  it('a "take over" press lands while the agent is still writing, and the answer never reaches the client', async () => {
    const CLIENT = 900000041
    sink = []
    asks.length = 0
    const bot = productionBot()

    await settlesWithin(
      bot.handleUpdate(
        businessMessage(
          'conn-press',
          CLIENT,
          CLIENT,
          'сколько стоит рилс?'
        ) as any
      ),
      1000
    )
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })
    expect(asks[0].settled).toBe(false)

    // The press is handled while the turn is still pending.
    await settlesWithin(
      bot.handleUpdate(ownerPress(`crm:mute:${CLIENT}`) as any),
      5000
    )
    expect(asks[0].settled).toBe(false)
    expect(svc.aiPausedMinutes(CLIENT, OWNER)).toBeGreaterThan(0)
    expect(sink.some(s => s.method === 'answerCallbackQuery')).toBe(true)

    asks[0].answer('Рилс стоит 2 токена.')
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])

    expect(toClient(CLIENT)).toEqual([])
    expect(discardNotices()).toHaveLength(1)
  }, 60_000)

  it('the owner typing in the chat lands while the agent is still writing, and wins the same way', async () => {
    const CLIENT = 900000042
    sink = []
    asks.length = 0
    const bot = productionBot()

    await settlesWithin(
      bot.handleUpdate(
        businessMessage('conn-typed', CLIENT, CLIENT, 'а видео умеете?') as any
      ),
      1000
    )
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })

    await settlesWithin(
      bot.handleUpdate(
        businessMessage('conn-typed', CLIENT, OWNER, 'Да, сейчас покажу') as any
      ),
      5000
    )
    expect(asks[0].settled).toBe(false)
    expect(svc.aiPausedMinutes(CLIENT, OWNER)).toBeGreaterThan(0)

    asks[0].answer('Умеем! Вот пример.')
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])

    expect(toClient(CLIENT)).toEqual([])
    expect(discardNotices()).toHaveLength(1)
    // The owner's own line was never re-sent or answered by the agent.
    expect(asks).toHaveLength(1)
  }, 60_000)

  it('control: with no takeover the same turn does reach the client', async () => {
    const CLIENT = 900000043
    sink = []
    asks.length = 0
    const bot = productionBot()

    await bot.handleUpdate(
      businessMessage('conn-control', CLIENT, CLIENT, 'привет') as any
    )
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })
    asks[0].answer('Здравствуйте!')
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])

    expect(toClient(CLIENT)).toHaveLength(1)
    expect(toClient(CLIENT)[0].payload.text).toBe('Здравствуйте!')
    expect(discardNotices()).toHaveLength(0)
  }, 60_000)
})
