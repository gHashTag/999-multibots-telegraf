/**
 * A PAYMENT NEVER WAITS BEHIND AN AGENT TURN.
 *
 * Telegram gives a bot 10 seconds to answer a pre_checkout_query and cancels
 * the payment after that. Telegraf 4.16.3 polls with
 *
 *   for await (const updates of this) await Promise.all(updates.map(handleUpdate))
 *
 * so no new batch is fetched until every handler of the current batch has
 * settled -- and src/index.ts runs each bot with `handlerTimeout: Infinity`.
 * When the business middleware or the bot-chat agent fallback awaited a whole
 * agent turn (up to 420 s), a buyer who paid on that bot during the turn was
 * answered only after it: measured before this change with the same chain, a
 * 15 s turn delayed the answer by 14 s -- a failed payment.
 *
 * This test runs the REAL Telegraf polling loop (bot.launch) against a
 * scripted getUpdates, with the production wiring order from src/index.ts:
 * session, language, the pre_checkout handler, then registerCommands. Only the
 * agent is faked -- with a turn that does not end until the test says so. The
 * payment query is delivered in the NEXT batch after the turn has started,
 * which is exactly the case the old loop could not serve.
 *
 * The owner's correspondence import (the "crm:ingest" press) is the same
 * shape: it awaited the render for up to 170 s on the loop, and a buyer who
 * paid on that bot meanwhile was answered only when the import ended --
 * measured with this harness before the fix, exactly when the test released
 * it. It runs in the owner's lane now and is held here too.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  afterEach,
} from 'vitest'
import { Telegraf, Telegram } from 'telegraf'

interface Ask {
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
  /* cyrillic-ok */ спроситьАгента: () =>
    new Promise(resolve => {
      const ask: Ask = {
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
/** Imports that have started and not ended; the test ends them by hand. */
const ingests: Array<(r: unknown) => void> = []
vi.mock('@/services/modelSwitch', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mirrorDm: vi.fn(async () => ({ ok: true })),
  ingestChats: vi.fn(
    () => new Promise(resolve => ingests.push(resolve as (r: unknown) => void))
  ),
}))

const OWNER = 900000091
// The CRM dispatcher answers the owner only: the gate is parsed at import.
process.env.ADMIN_IDS = String(OWNER)
const CLIENT = 900000092
const BUYER = 900000093

/** getUpdates hands out these batches, one per call, and blocks when empty. */
let batches: unknown[][] = []
let wakePoll: (() => void) | null = null
let answeredAt: number | null = null
const realCallApi = (Telegram.prototype as any).callApi
const savedRedis = process.env.REDIS_URL

let registerCommands: (opts: { bot: any }) => void
let sessionMiddleware: () => any
let languageMiddleware: any
let handlePreCheckoutQuery: (ctx: any) => Promise<void>
let agentLanes: typeof import('@/services/agentLanes').agentLanes

function deliver(batch: unknown[]) {
  batches.push(batch)
  const wake = wakePoll
  wakePoll = null
  wake?.()
}

beforeAll(async () => {
  delete process.env.REDIS_URL
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any,
    opts: { signal?: AbortSignal } = {}
  ) => {
    switch (method) {
      case 'getMe':
        return { id: 111, is_bot: true, username: 'probe_bot', first_name: 'B' }
      case 'getUpdates': {
        // The offset sync Telegraf does when polling stops.
        if (payload?.limit === 1) return []
        while (!batches.length) {
          await new Promise<void>((resolve, reject) => {
            wakePoll = resolve
            opts.signal?.addEventListener(
              'abort',
              () => {
                const e = new Error('aborted')
                e.name = 'AbortError'
                reject(e)
              },
              { once: true }
            )
          })
        }
        return batches.shift()
      }
      case 'answerPreCheckoutQuery':
        answeredAt = Date.now()
        return true
      case 'getBusinessConnection':
        return {
          id: payload.business_connection_id,
          user: { id: OWNER, first_name: 'Owner' },
          user_chat_id: OWNER,
          date: 1,
          is_enabled: true,
          rights: { can_reply: true },
        }
      case 'sendMessage':
        return { message_id: 1, date: 0, chat: { id: payload.chat_id } }
      default:
        return true
    }
  }
  ;({ registerCommands } = await import('@/navigation/registerCommands'))
  ;({ sessionMiddleware } = await import('@/core/session/sessionStore'))
  ;({ languageMiddleware } = await import('@/middlewares/languageMiddleware'))
  ;({ handlePreCheckoutQuery } = await import('@/handlers/paymentHandlers'))
  ;({ agentLanes } = await import('@/services/agentLanes'))
}, 60_000)

afterAll(() => {
  ;(Telegram.prototype as any).callApi = realCallApi
  if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis
})

let running: { bot: Telegraf<any>; loop: Promise<void> } | null = null
afterEach(async () => {
  for (const a of asks) if (!a.settled) a.answer('released')
  for (const end of ingests.splice(0)) end({})
  if (running) {
    running.bot.stop('test over')
    await running.loop.catch(() => undefined)
    running = null
  }
  await agentLanes.drain(10_000)
  asks.length = 0
  batches = []
  answeredAt = null
})

/** The production wiring order of src/index.ts, on the real polling loop. */
function launchProductionBot() {
  const bot = new Telegraf<any>('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', {
    handlerTimeout: Infinity,
  })
  bot.use(sessionMiddleware())
  bot.use(languageMiddleware)
  bot.on('pre_checkout_query', handlePreCheckoutQuery as any)
  registerCommands({ bot })
  const loop = bot.launch({
    allowedUpdates: [
      'message',
      'callback_query',
      'pre_checkout_query',
      'business_connection',
      'business_message',
    ],
  })
  running = { bot, loop }
  return bot
}

let updateId = 9000
const preCheckout = () => ({
  update_id: ++updateId,
  pre_checkout_query: {
    id: `pcq-${updateId}`,
    from: { id: BUYER, is_bot: false, first_name: 'Buyer' },
    currency: 'XTR',
    total_amount: 10,
    invoice_payload: 'tokens:10',
  },
})

async function answeredWhileTurnRuns() {
  // The turn is running: the agent was asked and has not answered.
  await vi.waitFor(() => expect(asks).toHaveLength(1), { timeout: 10_000 })
  expect(asks[0].settled).toBe(false)

  const paidAt = Date.now()
  deliver([preCheckout()])
  await vi.waitFor(() => expect(answeredAt).not.toBeNull(), { timeout: 3000 })
  // Well inside Telegram's 10 s -- and while the turn is STILL running.
  expect(answeredAt! - paidAt).toBeLessThan(1000)
  expect(asks[0].settled).toBe(false)
}

describe('pre_checkout_query is answered while an agent turn runs on the same bot', () => {
  it('during a business DM turn', async () => {
    deliver([
      {
        update_id: ++updateId,
        business_message: {
          message_id: updateId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: CLIENT, first_name: 'Client', type: 'private' },
          from: { id: CLIENT, first_name: 'Client' },
          text: 'хочу рилс',
          business_connection_id: 'conn-pay',
        },
      },
    ])
    launchProductionBot()
    await answeredWhileTurnRuns()
  }, 30_000)

  it('during a bot-chat agent turn', async () => {
    deliver([
      {
        update_id: ++updateId,
        message: {
          message_id: updateId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: CLIENT, type: 'private', first_name: 'Client' },
          from: {
            id: CLIENT,
            is_bot: false,
            first_name: 'Client',
            language_code: 'ru',
          },
          text: 'сделай мне рилс про кофе',
        },
      },
    ])
    launchProductionBot()
    await answeredWhileTurnRuns()
  }, 30_000)

  it("during the owner's correspondence import (crm:ingest)", async () => {
    deliver([
      {
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
          data: 'crm:ingest',
          message: {
            message_id: 7,
            date: Math.floor(Date.now() / 1000),
            chat: { id: OWNER, type: 'private' },
            text: 'the CRM menu',
          },
        },
      },
    ])
    launchProductionBot()
    // The import is running: the render was asked and has not answered.
    await vi.waitFor(() => expect(ingests).toHaveLength(1), {
      timeout: 10_000,
    })

    const paidAt = Date.now()
    deliver([preCheckout()])
    await vi.waitFor(() => expect(answeredAt).not.toBeNull(), { timeout: 3000 })
    expect(answeredAt! - paidAt).toBeLessThan(1000)
    // ...and the import is STILL running.
    expect(ingests).toHaveLength(1)
  }, 30_000)
})
