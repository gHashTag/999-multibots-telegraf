/**
 * THE BOT CHAT ANSWERS LIKE THE APP, EVEN FROM INSIDE A HALF-FINISHED WIZARD.
 *
 * Owner, 2026-09-23: "why does the bot not understand me when I write to it
 * directly -- it should be a copy of what the mini app is". Production, the
 * same morning:
 *
 *   [no-reply] a message crossed the whole chain unanswered
 *   {updateType: "message", scene: "starPaymentScene", shape: ["text"]}
 *
 * He had opened the top-up wizard days before and never finished it. Every
 * question he typed afterwards arrived while that scene was still current,
 * the wizard ignored anything that was not an amount, the agent fallback
 * stepped aside for the scene, and the net at the end of the chain said "I
 * could not tell what to do with it". The mini app, which has no scenes,
 * answered the same words with tools.
 *
 * Pinned through the REAL registerCommands chain; only the Bot API, the
 * render (by `fetch`) and the scene are faked. Fictional ids only (9000000xx).
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

vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'toolless answer'),
  AI_CHAT_MODELS: {},
}))
vi.mock('@/core/supabase', () => ({
  getUserLanguageFromDB: vi.fn(async () => null),
}))

let cannedAnswer: null | (() => Promise<unknown>) = null
vi.mock('@/services/trinityAgent', async importOriginal => {
  const real = await importOriginal<Record<string, any>>()
  return {
    ...real,
    /* cyrillic-ok */ спроситьАгента: (...args: unknown[]) =>
      cannedAnswer ? cannedAnswer() : real['спроситьАгента'](...args),
    recordTurns: vi.fn(async () => 'recorded'),
  }
})
vi.mock('@/services/agentAttachments', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildAgentTurn: vi.fn(async (_telegram: unknown, parts: any[]) => ({
    text: parts.map((p: any) => p.text ?? '').join('\n'),
    refusal: null,
    stored: [],
  })),
}))

import { registerCommands } from '@/navigation/registerCommands'
import { sessionMiddleware } from '@/core/session/sessionStore'
import { languageMiddleware } from '@/middlewares/languageMiddleware'
import { agentLanes } from '@/services/agentLanes'

let sink: Array<{ method: string; payload: any }> = []
const realCallApi = (Telegram.prototype as any).callApi
const saved = { redis: process.env.REDIS_URL, key: process.env.RENDER_API_KEY }

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
  vi.unstubAllGlobals()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.includes('/api/agent/history'))
        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      return new Response('not in this test', { status: 404 })
    })
  )
})

/**
 * A WIZARD THE PERSON IS STANDING IN.
 *
 * Telegraf's Stage assigns `ctx.scene` and then runs `ctx.scene.current` as
 * middleware (`Composer.lazy`), so a fake current with its own `middleware()`
 * behaves exactly like a wizard step: it runs BETWEEN the reply witness and
 * the agent fallback, which is where the real one runs. The accessor keeps the
 * fake in place when the real stage assigns over it.
 *
 * `answers` is what the step does with the text: the top-up wizard waits for
 * an amount and ignores a sentence.
 */
function botInsideScene(scene: {
  id: string
  answers: boolean
  leave: () => void
}) {
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  bot.use(sessionMiddleware())
  bot.use(languageMiddleware)
  bot.use(async (ctx: any, next: any) => {
    const step = async (c: any, n: any) => {
      if (!scene.answers) return n()
      await c.reply('Введите сумму в звёздах') // cyrillic-ok: what the wizard says
    }
    const fake: any = {
      current: { id: scene.id, middleware: () => step },
      leave: async () => {
        scene.leave()
        fake.current = undefined
      },
    }
    Object.defineProperty(ctx, 'scene', {
      configurable: true,
      get: () => fake,
      set: () => {
        // The real stage assigns its own here; the fake stays.
      },
    })
    return next()
  })
  registerCommands({ bot })
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 'probe_bot',
    first_name: 'B',
  }
  return bot
}

let updateId = 8000
const ask = (userId: number, text: string) => ({
  update_id: ++updateId,
  message: {
    message_id: updateId,
    date: 1_758_000_000,
    chat: { id: userId, type: 'private', first_name: 'P' },
    from: { id: userId, is_bot: false, first_name: 'P', language_code: 'ru' },
    text,
  },
})

const sent = (userId: number) =>
  sink.filter(s => s.method === 'sendMessage' && s.payload.chat_id === userId)

describe('a scene that said nothing', () => {
  it('does not swallow the message: the bot leaves it and the agent answers', async () => {
    const USER = 900000081
    let left = 0
    cannedAnswer = async () => ({
      текст: 'Вот что я нашёл про TikTok.', // cyrillic-ok: the agent answer
      инструменты: ['feed_list'], // cyrillic-ok: field of the agent answer
    })
    const bot = botInsideScene({
      id: 'starPaymentScene',
      answers: false,
      leave: () => {
        left += 1
      },
    })

    await bot.handleUpdate(ask(USER, 'что там по TikTok?') as any)
    expect((await agentLanes.drain(15_000)).unfinished).toEqual([])

    expect(left).toBe(1)
    const out = sent(USER)
    expect(out.map(m => m.payload.text)).toContain(
      'Вот что я нашёл про TikTok.' // cyrillic-ok: the agent answer
    )
    // The sentence the owner actually got is gone.
    expect(out.map(m => String(m.payload.text)).join('\n')).not.toContain(
      'не понял, что с ним сделать' // cyrillic-ok: the old puzzled line
    )
  }, 60_000)

  it('keeps its right of first refusal: a wizard that answered is left alone', async () => {
    const USER = 900000082
    let left = 0
    cannedAnswer = async () => {
      throw new Error('the agent must not be asked here')
    }
    const bot = botInsideScene({
      id: 'starPaymentScene',
      answers: true,
      leave: () => {
        left += 1
      },
    })

    await bot.handleUpdate(ask(USER, '500') as any)
    expect((await agentLanes.drain(15_000)).unfinished).toEqual([])

    expect(left).toBe(0)
    expect(sent(USER).map(m => m.payload.text)).toEqual([
      'Введите сумму в звёздах', // cyrillic-ok: what the wizard says
    ])
  }, 60_000)
})
