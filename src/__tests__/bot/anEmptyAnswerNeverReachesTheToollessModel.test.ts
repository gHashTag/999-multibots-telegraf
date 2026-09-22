/**
 * WHEN THE AGENT MISSES, THE BOT SAYS SO -- IN THE PERSON'S LANGUAGE.
 *
 * Measured in production 2026-09-22 (@neuro_blogger_bot): a person sent a
 * link and a line in Russian; the agent called `my_assets` and `my_renders`
 * and returned an EMPTY answer; the bot logged "empty answer, taking the
 * fallback" and handed the message to `chatWithAI`, a model with no tools and
 * no history. It answered in English, introduced itself, invented "Instagram
 * analytics" and suggested /start -- with "there are no subscriptions" in its
 * prompt, false since the club.
 *
 * Pinned here through the REAL registerCommands chain -- only the Bot API, the
 * render (by `fetch`) and the fallback model are faked -- so the routing is
 * what is tested, not a helper in isolation:
 *
 *  - an empty answer, a failure the render REPORTS in its stream, and a turn
 *    that already spent money never reach `chatWithAI`; the person gets one
 *    honest line under the standard buttons, in their language;
 *  - a draft card with no words is the answer and gets no apology under it;
 *  - an unreachable agent still falls back, and then the toolless model is
 *    told the reply language, the truth about the club, and the last turns of
 *    this chat that the failed call had already read;
 *  - when even that model fails, the apology follows the person's language.
 *
 * Fictional ids only (9000000xx).
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest'
import { Telegraf, Telegram } from 'telegraf'

const chatWithAI = vi.fn(async (..._args: unknown[]) => 'fallback answer')
vi.mock('@/services/aiChatService', () => ({
  chatWithAI: (...args: unknown[]) => chatWithAI(...args),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

/*
 * The agent client is the REAL one unless a test puts a canned answer here:
 * the render-side cases go through its own stream parser, so the mark it puts
 * on a reported failure is what the bot reads.
 */
let cannedAnswer: null | (() => Promise<unknown>) = null
const recordTurns = vi.fn(async (..._args: unknown[]) => 'recorded')
vi.mock('@/services/trinityAgent', async importOriginal => {
  const real = await importOriginal<Record<string, any>>()
  return {
    ...real,
    /* cyrillic-ok */ спроситьАгента: (...args: unknown[]) =>
      cannedAnswer ? cannedAnswer() : real['спроситьАгента'](...args),
    recordTurns: (...args: unknown[]) => recordTurns(...args),
  }
})
vi.mock('@/services/agentAttachments', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildAgentTurn: vi.fn(async (_telegram: unknown, parts: any[]) => ({
    text: parts.map(p => p.text ?? '').join('\n'),
    refusal: null,
    stored: [],
  })),
}))

/*
 * Imported statically, at collect time: the command registry pulls in the
 * whole bot, and on a busy machine loading it inside a hook ran past the
 * hook's clock -- a timeout that would read like a finding.
 */
import { registerCommands } from '@/navigation/registerCommands'
import { sessionMiddleware } from '@/core/session/sessionStore'
import { languageMiddleware } from '@/middlewares/languageMiddleware'
import { agentLanes } from '@/services/agentLanes'
import * as fallback from '@/navigation/helpers/agentFallback'

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
const saved = {
  redis: process.env.REDIS_URL,
  key: process.env.RENDER_API_KEY,
}

beforeAll(() => {
  delete process.env.REDIS_URL
  process.env.RENDER_API_KEY = 'server-key-for-tests' // secret-guard-ok: test placeholder
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    if (method === 'sendMessage')
      return { message_id: 1, date: 0, chat: { id: payload.chat_id } }
    return true
  }
})

afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
  if (saved.redis !== undefined) process.env.REDIS_URL = saved.redis
  if (saved.key === undefined) delete process.env.RENDER_API_KEY
  else process.env.RENDER_API_KEY = saved.key
  vi.unstubAllGlobals()
})

beforeEach(() => {
  sink = []
  cannedAnswer = null
  chatWithAI.mockReset()
  chatWithAI.mockImplementation(async () => 'fallback answer')
  recordTurns.mockClear()
  vi.unstubAllGlobals()
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

let updateId = 7000
const say = (userId: number, text: string, lang: 'ru' | 'en') => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: userId, type: 'private', first_name: 'P' },
    from: { id: userId, is_bot: false, first_name: 'P', language_code: lang },
    text,
  },
})

async function turn(userId: number, text: string, lang: 'ru' | 'en') {
  await productionBot().handleUpdate(say(userId, text, lang) as any)
  expect((await agentLanes.drain(15_000)).unfinished).toEqual([])
}

const sent = (userId: number) =>
  sink.filter(s => s.method === 'sendMessage' && s.payload.chat_id === userId)

const callbacks = (msg: { payload: any }): string[] =>
  (msg.payload.reply_markup?.inline_keyboard ?? [])
    .flat()
    .map((b: any) => b.callback_data)
    .filter(Boolean)

const CYRILLIC = new RegExp('[\\u0400-\\u04FF]')

/** The render, by fetch: the history it hands out and what /chat does. */
function render(opts: {
  history?: Array<{ role: string; content: string }>
  chat: () => Promise<Response>
}) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const u = String(url)
      calls.push(u)
      if (u.includes('/api/agent/history'))
        return new Response(JSON.stringify({ messages: opts.history ?? [] }), {
          status: 200,
        })
      if (u.includes('/api/agent/chat')) return opts.chat()
      return new Response('not in this test', { status: 404 })
    })
  )
  return calls
}

const ndjson = (...events: unknown[]) =>
  new Response(events.map(e => JSON.stringify(e)).join('\n') + '\n', {
    status: 200,
  })

describe('an empty agent answer', () => {
  it('never reaches the toolless model; one honest line in Russian, under the standard buttons', async () => {
    const USER = 900000071
    cannedAnswer = async () => ({
      текст: '', // cyrillic-ok: field of the agent answer
      инструменты: ['my_assets', 'my_renders'], // cyrillic-ok: field of the agent answer
    })
    await turn(USER, 'https://example.com/p/1 посмотри, что скажешь?', 'ru')

    expect(chatWithAI).not.toHaveBeenCalled()
    const out = sent(USER)
    expect(out).toHaveLength(1)
    expect(out[0].payload.text).toBe(fallback.honestMissLine(true, false))
    expect(out[0].payload.text).toMatch(CYRILLIC)
    expect(callbacks(out[0])).toEqual(
      expect.arrayContaining(['act:topup', 'act:balance', 'act:human'])
    )
    // The question is on record already; only the line is written back.
    expect(recordTurns).toHaveBeenCalledWith(String(USER), [
      { role: 'assistant', content: fallback.honestMissLine(true, false) },
    ])
  }, 60_000)

  it('speaks English to somebody who writes English with an English profile', async () => {
    const USER = 900000072
    cannedAnswer = async () => ({ текст: '', инструменты: [] }) // cyrillic-ok: fields of the agent answer
    await turn(USER, 'what can you do with this link?', 'en')

    expect(chatWithAI).not.toHaveBeenCalled()
    const out = sent(USER)
    expect(out).toHaveLength(1)
    expect(out[0].payload.text).toBe(fallback.honestMissLine(false, false))
    expect(out[0].payload.text).not.toMatch(CYRILLIC)
  }, 60_000)

  it('answers a Russian line in Russian even when the profile says English', async () => {
    // The production shape: a Russian line, and the bot answered in English.
    const USER = 900000073
    cannedAnswer = async () => ({ текст: '' }) // cyrillic-ok: field of the agent answer
    await turn(USER, 'сделай что-нибудь с этой ссылкой', 'en')

    expect(sent(USER)[0].payload.text).toBe(
      fallback.honestMissLine(true, false)
    )
  }, 60_000)

  it('after a paid tool, does not invite a repeat that would pay twice', async () => {
    const USER = 900000074
    cannedAnswer = async () => ({ текст: '', инструменты: ['image_generate'] }) // cyrillic-ok: fields of the agent answer
    await turn(USER, 'нарисуй кота', 'ru')

    expect(chatWithAI).not.toHaveBeenCalled()
    const line = sent(USER)[0].payload.text
    expect(line).toBe(fallback.honestMissLine(true, true))
    expect(line).not.toBe(fallback.honestMissLine(true, false))
  }, 60_000)

  it('a draft card with no words is the answer: no apology under it, no fallback', async () => {
    const USER = 900000075
    cannedAnswer = async () => ({
      текст: '', // cyrillic-ok: field of the agent answer
      инструменты: ['tg_send'], // cyrillic-ok: field of the agent answer
      proposal: {
        id: 'p-1',
        action: 'tg_send',
        target: '@someone_fictional',
        what: 'Hello from the draft',
        secret: 'one-time-secret',
      },
    })
    await turn(USER, 'напиши ему привет', 'ru')

    expect(chatWithAI).not.toHaveBeenCalled()
    const texts = sent(USER).map(s => String(s.payload.text))
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('Hello from the draft')
    expect(texts).not.toContain(fallback.honestMissLine(true, false))
    expect(texts).not.toContain(fallback.honestMissLine(true, true))
  }, 60_000)
})

describe('a failure the render reports in its own stream', () => {
  it('is an empty answer too: the real client marks it, the bot never hands it on', async () => {
    const USER = 900000076
    const calls = render({
      chat: async () =>
        ndjson(
          { тип: 'ход', id: 'turn-1' }, // cyrillic-ok: render event envelope
          { тип: 'инструмент', имя: 'my_assets' }, // cyrillic-ok: render event envelope
          {
            тип: 'ошибка', // cyrillic-ok: render event envelope
            текст: '<no model provider answered> zai: timed out', // cyrillic-ok: render event envelope
          }
        ),
    })
    await turn(USER, 'что у меня в файлах?', 'ru')

    expect(calls.some(u => u.includes('/api/agent/chat'))).toBe(true)
    expect(chatWithAI).not.toHaveBeenCalled()
    const out = sent(USER)
    expect(out).toHaveLength(1)
    expect(out[0].payload.text).toBe(fallback.honestMissLine(true, false))
  }, 60_000)
})

describe('an unreachable agent', () => {
  const HISTORY = [
    { role: 'user', content: 'сделай рилс про кофе' },
    { role: 'assistant', content: 'Пришлите три фото кофейни.' },
  ]

  it('falls back to the toolless model, told the language, the club and the last turns', async () => {
    const USER = 900000077
    render({
      history: HISTORY,
      chat: async () => {
        throw new TypeError('fetch failed')
      },
    })
    chatWithAI.mockImplementation(
      async () => 'Сейчас не могу. [[Пополнить|act:topup]]'
    )
    await turn(USER, 'а где мой рилс?', 'ru')

    expect(chatWithAI).toHaveBeenCalledTimes(1)
    const messages = chatWithAI.mock.calls[0][0] as Array<{
      role: string
      content: string
    }>
    const system = messages[0]
    expect(system.role).toBe('system')
    expect(system.content).toBe(fallback.fallbackSystemPrompt(true))
    expect(system.content).toContain('/club')
    // The service list that produced "Instagram analytics" does not travel,
    // although this environment, like production, has no Instagram key.
    expect(process.env.RAPIDAPI_INSTAGRAM_KEY ?? '').toBe('')
    expect(system.content).not.toMatch(/instagram/i)
    // The history the failed call had read, in order, then the question.
    expect(messages.slice(1)).toEqual([
      ...HISTORY,
      { role: 'user', content: 'а где мой рилс?' },
    ])
    const out = sent(USER)
    expect(out).toHaveLength(1)
    expect(out[0].payload.text).toBe('Сейчас не могу.')
    expect(callbacks(out[0])[0]).toBe('act:topup')
  }, 60_000)

  it('an English speaker gets an English prompt', async () => {
    const USER = 900000078
    render({
      chat: async () => new Response('bad gateway', { status: 502 }),
    })
    await turn(USER, 'where is my reel?', 'en')

    expect(chatWithAI).toHaveBeenCalledTimes(1)
    const system = (chatWithAI.mock.calls[0][0] as any[])[0]
    expect(system.content).toBe(fallback.fallbackSystemPrompt(false))
    expect(system.content).not.toMatch(CYRILLIC)
  }, 60_000)

  it('when even the fallback model fails, the apology is in the person’s language', async () => {
    const USER = 900000079
    render({
      chat: async () => {
        throw new TypeError('fetch failed')
      },
    })
    chatWithAI.mockRejectedValue(new Error('Replicate timeout'))
    await turn(USER, 'hello, anyone there?', 'en')

    const out = sent(USER)
    expect(out).toHaveLength(1)
    expect(out[0].payload.text).toBe(
      fallback.fallbackFailedText(false, 'Replicate timeout')
    )
    expect(out[0].payload.text).not.toMatch(CYRILLIC)
  }, 60_000)
})
