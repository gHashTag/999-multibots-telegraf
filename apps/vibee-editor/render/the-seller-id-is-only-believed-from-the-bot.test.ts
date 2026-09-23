/**
 * WHO MAY SAY WHOSE CHAT THIS IS.
 *
 * `seller_id` decides which correspondence, which client packages and whose
 * debts a business turn reads. From a Mini App session it would therefore be
 * a way to ask for somebody else's CRM by writing their id into a request
 * body, so it is believed ONLY behind the server key -- the key the bot
 * holds.
 *
 * And absence is absence: it must never fall back to the platform owner.
 * That fallback is the defect this whole change removes (owner, 2026-09-23:
 * the agent in his wife's profile answered as him).
 *
 * Fictional ids only (9000000xx).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Readable } from 'node:stream'

const KEY = 'server-key-for-tests' // secret-guard-ok: invented value, nothing authenticates with it
const WIFE = '900000112'
const CLIENT = '900000113'
const SOMEBODY_ELSE = '900000114'

process.env.RENDER_API_KEY = KEY

let seenOpts: Record<string, unknown> | null = null
vi.mock('./src/agent/chat', () => ({
  runAgent: async function* (
    _h: unknown,
    _ctx: unknown,
    opts: Record<string, unknown>
  ) {
    seenOpts = opts
    yield { ['тип']: 'текст', ['текст']: 'ok' } // cyrillic-ok: event envelope
  },
}))
vi.mock('./src/agent/telegram-tools', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSeller: async () => true,
}))

const { handleAgentChat } = await import('./src/agent/routes')

function req(body: unknown, headers: Record<string, string> = {}) {
  const s = Readable.from([JSON.stringify(body)]) as any
  s.headers = { 'content-type': 'application/json', ...headers }
  s.method = 'POST'
  s.url = `/api/agent/chat?telegram_id=${CLIENT}`
  return s
}

function res() {
  const out: { code?: number; written: string[] } = { written: [] }
  return {
    out,
    on() {
      return this
    },
    writeHead(code: number) {
      out.code = code
      return this
    },
    write(c: string) {
      out.written.push(c)
      return true
    },
    end() {},
    setHeader() {},
  } as any
}

const getPool = () =>
  ({
    async query() {
      return { rows: [] }
    },
  }) as never

const turn = (body: unknown, headers?: Record<string, string>) =>
  handleAgentChat(req(body, headers), res(), CLIENT, getPool)

const BODY = {
  messages: [{ role: 'user', content: 'сколько стоит?' }], // cyrillic-ok: a client question
  surface: 'business',
}

beforeEach(() => {
  seenOpts = null
})

describe('seller_id', () => {
  it('is taken from the bot, which holds the server key', async () => {
    await turn({ ...BODY, seller_id: WIFE }, { 'x-api-key': KEY })
    expect(seenOpts, 'the turn never reached runAgent').toBeTruthy()
    expect(seenOpts?.seller).toBe(WIFE)
  })

  it('is IGNORED without the server key -- a session cannot name a seller', async () => {
    await turn({ ...BODY, seller_id: SOMEBODY_ELSE })
    expect(seenOpts?.seller).toBeUndefined()
  })

  it('absent stays absent: no fall back to the platform owner', async () => {
    process.env.OWNER_TELEGRAM_ID = '900000111'
    await turn(BODY, { 'x-api-key': KEY })
    expect(seenOpts?.seller).toBeUndefined()
  })

  it('is digits, or it is nothing', async () => {
    for (const bad of ['@handle', '12', 'x'.repeat(20), '900000112; drop']) {
      seenOpts = null
      await turn({ ...BODY, seller_id: bad }, { 'x-api-key': KEY })
      expect(seenOpts?.seller, bad).toBeUndefined()
    }
  })
})
