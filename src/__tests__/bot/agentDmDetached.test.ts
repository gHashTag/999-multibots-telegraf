/**
 * THE BOT-CHAT AGENT TURN DOES NOT HOLD THE BOT.
 *
 * The agent fallback -- the last middleware registerCommands installs --
 * awaited the whole agent turn (up to 420 s), and Telegraf fetches the next
 * batch only when every handler of the current one has settled. One person's
 * question therefore held every other update of that bot. The turn now runs
 * in the chat's lane (`dm:<chat>`) and the handler returns at once.
 *
 * Leaving the chain early has one trap, and it is guarded here: the silence
 * net (noSilence.ts) answers any private message that crossed the chain
 * without a reply -- and a detached turn has not replied YET. Unless the
 * handler marks the message answered, the person would get "I could not tell
 * what to do with it" and then, seconds later, the real answer.
 *
 * The other side of the same trap is guarded too: on the awaited shape a
 * throw ANYWHERE in the turn reached the net's `finally`, which answered. The
 * net is long gone when a lane job throws, so the job must answer for it --
 * once, and only when the turn had said nothing.
 *
 * And a turn the process could not finish before it stopped is announced to
 * the person (laneNotices.ts): its update is already confirmed to Telegram,
 * so no process will ever answer it.
 *
 * Through the REAL registerCommands chain, only the agent and the Bot API
 * faked. Fictional ids only.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { Telegraf, Telegram } from 'telegraf'

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
  /* cyrillic-ok */ спроситьАгента: (_id: string, text: string) =>
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
}))
// The shelf upload is the network; the album logic around it is what is tested.
vi.mock('@/services/agentAttachments', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildAgentTurn: vi.fn(async (_telegram: unknown, parts: any[]) => ({
    text: parts.some(p => p.photo)
      ? `[${parts.length} photos] ${parts.map(p => p.caption ?? '').join('')}`
      : parts.map(p => p.text ?? '').join('\n'),
    refusal: null,
    stored: [],
  })),
}))

// The silence net's own sentence, in both languages (noSilence.ts).
const PUZZLED = /не понял|could not tell/ // cyrillic-ok: matches UI text

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
const savedRedis = process.env.REDIS_URL
let registerCommands: (opts: { bot: any }) => void
let sessionMiddleware: () => any
let languageMiddleware: any
let agentLanes: typeof import('@/services/agentLanes').agentLanes
let laneNotices: typeof import('@/services/laneNotices')
let buildAgentTurn: typeof import('@/services/agentAttachments').buildAgentTurn

beforeAll(async () => {
  delete process.env.REDIS_URL
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    if (method === 'sendMessage')
      return { message_id: 1, date: 0, chat: { id: payload.chat_id } }
    return true
  }
  ;({ registerCommands } = await import('@/navigation/registerCommands'))
  ;({ sessionMiddleware } = await import('@/core/session/sessionStore'))
  ;({ languageMiddleware } = await import('@/middlewares/languageMiddleware'))
  ;({ agentLanes } = await import('@/services/agentLanes'))
  laneNotices = await import('@/services/laneNotices')
  ;({ buildAgentTurn } = await import('@/services/agentAttachments'))
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

let updateId = 5000
const privateMessage = (userId: number, extra: Record<string, unknown>) => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: userId, type: 'private', first_name: 'P' },
    from: { id: userId, is_bot: false, first_name: 'P', language_code: 'ru' },
    ...extra,
  },
})

async function settlesWithin(p: Promise<unknown>, ms: number) {
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
}

const textsTo = (userId: number) =>
  sink
    .filter(s => s.method === 'sendMessage' && s.payload.chat_id === userId)
    .map(s => String(s.payload.text))

describe('the agent turn in the bot chat runs off the loop', () => {
  it('the update resolves before the agent answers, the silence net stays quiet, and the answer arrives after', async () => {
    const USER = 900000061
    sink = []
    asks.length = 0
    const bot = productionBot()

    await settlesWithin(
      bot.handleUpdate(
        privateMessage(USER, { text: 'расскажи, как сделать рилс' }) as any
      ),
      2000
    )
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })
    expect(asks[0].text).toContain('расскажи, как сделать рилс')
    expect(asks[0].settled).toBe(false)

    // The chain has finished and the turn has not: nobody may speak for it.
    expect(textsTo(USER).filter(t => PUZZLED.test(t))).toEqual([])
    expect(textsTo(USER)).toEqual([])

    asks[0].answer('Пришлите фото — сделаю рилс.')
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])
    const said = textsTo(USER)
    expect(said).toContain('Пришлите фото — сделаю рилс.')
    expect(said.filter(t => PUZZLED.test(t))).toEqual([])
  }, 60_000)

  it('two questions from one person are two turns, one after the other', async () => {
    const USER = 900000062
    sink = []
    asks.length = 0
    const bot = productionBot()

    await bot.handleUpdate(
      privateMessage(USER, { text: 'первый вопрос' }) as any
    )
    await bot.handleUpdate(
      privateMessage(USER, { text: 'второй вопрос' }) as any
    )
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })
    await new Promise(r => setTimeout(r, 300))
    // The second waits for the first: one turn per chat at a time.
    expect(asks).toHaveLength(1)
    asks[0].answer('ответ один')
    await vi.waitFor(() => expect(asks).toHaveLength(2), { timeout: 10_000 })
    expect(asks[1].text).toContain('второй вопрос')
    asks[1].answer('ответ два')
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])
    const said = textsTo(USER)
    expect(said.indexOf('ответ один')).toBeLessThan(said.indexOf('ответ два'))
    expect(said.filter(t => PUZZLED.test(t))).toEqual([])
  }, 60_000)

  it('an album in one batch is one turn, and none of its parts gets the puzzled sentence', async () => {
    const USER = 900000063
    sink = []
    asks.length = 0
    const bot = productionBot()
    const part = (i: number, caption?: string) =>
      privateMessage(USER, {
        media_group_id: 'album-1',
        photo: [
          { file_id: `f${i}`, file_unique_id: `u${i}`, width: 1, height: 1 },
        ],
        ...(caption ? { caption } : {}),
      })

    await settlesWithin(
      Promise.all([
        bot.handleUpdate(part(1, 'какое фото лучше?') as any),
        bot.handleUpdate(part(2) as any),
        bot.handleUpdate(part(3) as any),
      ]),
      2000
    )
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })
    expect(asks[0].text).toContain('[3 photos]')
    asks[0].answer('Второе.')
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])
    expect(asks).toHaveLength(1)
    const said = textsTo(USER)
    expect(said.filter(t => PUZZLED.test(t))).toEqual([])
    expect(said).toContain('Второе.')
  }, 60_000)

  it('a turn that throws before saying anything still answers the person -- once', async () => {
    const USER = 900000064
    sink = []
    asks.length = 0
    const bot = productionBot()
    // A throw outside the turn's own guard: the shelf, before the agent.
    vi.mocked(buildAgentTurn).mockImplementationOnce(async () => {
      throw new Error('shelf exploded')
    })

    await settlesWithin(
      bot.handleUpdate(
        privateMessage(USER, { text: 'расскажи про рилсы' }) as any
      ),
      2000
    )
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])
    await new Promise(r => setTimeout(r, 50))
    const said = textsTo(USER)
    expect(said.filter(t => PUZZLED.test(t))).toHaveLength(1)
    expect(said).toHaveLength(1)
    expect(asks).toHaveLength(0)
  }, 60_000)

  it('a turn that throws AFTER it said something is not answered a second time', async () => {
    const USER = 900000065
    sink = []
    asks.length = 0
    const bot = productionBot()
    // The refusal goes out, then reading the plan throws.
    vi.mocked(buildAgentTurn).mockImplementationOnce(
      async () =>
        ({
          refusal: 'Файл слишком большой.',
          stored: [],
          get text(): string {
            throw new Error('plan exploded')
          },
        }) as any
    )

    await bot.handleUpdate(
      privateMessage(USER, { text: 'вот файл, посмотри' }) as any
    )
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])
    await new Promise(r => setTimeout(r, 50))
    const said = textsTo(USER)
    expect(said).toEqual(['Файл слишком большой.'])
  }, 60_000)

  it('a turn cut off by shutdown tells the person to send it again; a finished one tells nobody', async () => {
    const USER = 900000066
    sink = []
    asks.length = 0
    const bot = productionBot()

    await bot.handleUpdate(
      privateMessage(USER, { text: 'сделай контент-план' }) as any
    )
    await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })

    // The drain gives up while the agent is still thinking.
    const { unfinished } = await agentLanes.drain(200)
    expect(unfinished).toEqual([`dm:${USER}`])
    expect(await laneNotices.sendShutdownNotices(unfinished)).toBe(1)
    const told = textsTo(USER)
    expect(told).toHaveLength(1)
    expect(told[0]).toMatch(/перезапускался/) // cyrillic-ok: matches UI text
    expect(told[0]).toMatch(/ещё раз/) // cyrillic-ok: matches UI text

    // Once the turn does end, its notice is let go: nothing to tell.
    asks[0].answer('План готов.')
    expect((await agentLanes.drain(10_000)).unfinished).toEqual([])
    sink = []
    expect(await laneNotices.sendShutdownNotices([`dm:${USER}`])).toBe(0)
    expect(sink).toEqual([])
    expect(laneNotices.heldNoticeCount()).toBe(0)
  }, 60_000)
})
