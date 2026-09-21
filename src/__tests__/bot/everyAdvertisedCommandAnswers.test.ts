/**
 * EVERY COMMAND IN THE MENU ANSWERS -- ON A BOOTED BOT.
 *
 * Owner, 2026-09-21: "check that all our commands are invoked". Measured the
 * same day from his own correspondence (scripts/commands-answered.cjs): of 66
 * bot x command pairs a person had ever sent 11. Every one of the 11 got a
 * reply -- and the other 55 had never been tried by anybody.
 *
 * `tri bridge` could not have noticed. It reads getMyCommands, which proves a
 * command is SET in the menu, not that anything answers it. A menu entry with
 * no handler behind it is a button that does nothing, and the bridge printed
 * it green.
 *
 * This closes that from the code side. The menu is read from setCommands.ts,
 * not typed here, so a command added to the menu tomorrow is tested tomorrow.
 * Each one is sent through the REAL registerCommands chain, with the session
 * and language middleware in front, in the order src/index.ts uses.
 *
 * ── WHAT DOES NOT COUNT AS AN ANSWER ───────────────────────────────────────
 *
 * The silence net (middleware/noSilence.ts) answers every private message
 * that nobody handled with a puzzled sentence. That is its job, and it means
 * "something was sent" is true of a command with no handler at all. A count
 * of sends would pass a dead command. So the net's own sentence is excluded,
 * and the test first proves it can tell the difference, on a command that
 * does not exist.
 *
 * The agent fallback is not a risk here: it passes on text that starts with
 * "/" (registerCommands, the `written.startsWith('/')` guard).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Telegraf, Telegram } from 'telegraf'

vi.mock('@/services/aiChatService', () => ({
  chatWithAI: vi.fn(async () => 'AGENT'),
  AI_CHAT_MODELS: {},
}))

/*
 * The one database answer /start cannot go without: does this person exist.
 * Everything else in @/core/supabase stays real. Without this the test has no
 * database, /start falls into its catch, and the person is told "an error
 * occurred" -- which the first version of this test counted as an answer.
 */
const known = { isExist: true }
vi.mock('@/core/supabase', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getUserDetailsSubscription: vi.fn(async () => ({
    isExist: known.isExist,
    isSubscriptionActive: false,
    subscriptionType: null,
    stars: 0,
    subscriptionStartDate: null,
  })),
  // A new person is written to the database before they are greeted.
  createUser: vi.fn(async (u: any) => [true, { ...u }]),
}))

const PERSON = 900000011

/** The menu, as the bots publish it. */
const MENU = [
  ...new Set(
    [
      ...fs
        .readFileSync(
          path.join(__dirname, '..', '..', 'setCommands.ts'),
          'utf8'
        )
        .matchAll(/command:\s*'([a-z_]+)'/g),
    ].map(m => m[1])
  ),
]

/** The net's sentence, in both languages -- the one reply that is not one. */
const NET = /could not tell what to do with it|не понял, что с ним сделать/ // cyrillic-ok: matches user-facing copy

/**
 * A handler's catch saying "try again later" is a failure the person can see,
 * not an answer. The first run of this test passed /start on exactly that.
 */
const FAILED = /An error occurred|Произошла ошибка/ // cyrillic-ok: matches user-facing copy

const SENDS = new Set([
  'sendMessage',
  'sendPhoto',
  'sendVideo',
  'sendAnimation',
  'sendDocument',
  'sendInvoice',
  'sendMediaGroup',
  'editMessageText',
])

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
    if (method === 'getChatMember') return { status: 'left', user: {} }
    if (method.startsWith('send') || method.startsWith('edit'))
      return { message_id: 1, date: 0, chat: { id: PERSON, type: 'private' } }
    return true
  }
  ;({ registerCommands } = await import('@/navigation/registerCommands'))
  ;({ sessionMiddleware } = await import('@/core/session/sessionStore'))
  ;({ languageMiddleware } = await import('@/middlewares/languageMiddleware'))
}, 120_000)

afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
  if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis
})

function productionBot() {
  const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  const errors: string[] = []
  bot.catch((e: any) => {
    errors.push(String((e && e.message) || e))
  })
  bot.use(sessionMiddleware())
  bot.use(languageMiddleware)
  registerCommands({ bot })
  ;(bot as any).botInfo = {
    id: 111,
    is_bot: true,
    username: 't27ai_bot',
    first_name: 'B',
  }
  return { bot, errors }
}

const command = (name: string, lang: 'ru' | 'en') => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: 1,
    date: Math.floor(Date.now() / 1000),
    chat: { id: PERSON, type: 'private', first_name: 'P' },
    from: { id: PERSON, is_bot: false, first_name: 'P', language_code: lang },
    text: `/${name}`,
    entities: [{ type: 'bot_command', offset: 0, length: name.length + 1 }],
  },
})

const replyText = (s: { payload: any }) =>
  String(s.payload?.text ?? s.payload?.caption ?? s.payload?.title ?? '')

/** What the person saw after sending `/name`, the net's sentence left out. */
async function answerTo(name: string, lang: 'ru' | 'en') {
  sink = []
  const { bot, errors } = productionBot()
  await bot.handleUpdate(command(name, lang) as any)
  const sends = sink.filter(s => SENDS.has(s.method))
  return {
    real: sends.filter(
      s => !NET.test(replyText(s)) && !FAILED.test(replyText(s))
    ),
    net: sends.filter(s => NET.test(replyText(s))),
    failed: sends.filter(s => FAILED.test(replyText(s))),
    errors,
  }
}

describe('the menu this test covers', () => {
  it('is read from setCommands.ts and is the menu the bots publish', () => {
    expect(MENU).toEqual(
      expect.arrayContaining([
        'start',
        'app',
        'browser',
        'support',
        'price',
        'club',
      ])
    )
  })
})

describe('the harness can tell an answer from the net', () => {
  it('a command nobody handles gets the net and nothing else', async () => {
    const r = await answerTo('no_such_command_anywhere', 'en')
    expect(r.net).toHaveLength(1)
    expect(r.real).toHaveLength(0)
  })
})

describe('every advertised command answers', () => {
  for (const lang of ['en', 'ru'] as const) {
    for (const name of MENU) {
      it(`/${name} (${lang}) gets its own answer, not the net`, async () => {
        const r = await answerTo(name, lang)
        expect(
          r.net.map(replyText),
          `/${name} fell through to the silence net`
        ).toEqual([])
        expect(
          r.failed.map(replyText),
          `/${name} answered with its error message`
        ).toEqual([])
        expect(
          r.real.length,
          `/${name} sent nothing; errors: ${r.errors.join(' | ')}`
        ).toBeGreaterThan(0)
        expect(replyText(r.real[0]).trim().length).toBeGreaterThan(0)
      }, 60_000)
    }
  }
})

describe('/start for somebody the bot has never seen', () => {
  it('does not fail and does not fall to the net', async () => {
    known.isExist = false
    try {
      const r = await answerTo('start', 'en')
      expect(r.failed.map(replyText)).toEqual([])
      expect(r.net.map(replyText)).toEqual([])
      expect(r.real.length).toBeGreaterThan(0)
    } finally {
      known.isExist = true
    }
  }, 60_000)
})
