import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * THE BOT'S OWN CLUB REQUEST, OVER REAL HTTP, TO THE RENDER'S OWN CLUB ROUTE.
 *
 * Found 2026-09-22 before the branch shipped: the bot asked the render for the
 * club with the server key and `?telegram_id=`, and the render decided "is
 * this the server key" with `authenticate(req).via === 'api-key'`. The club
 * paths are PUBLIC_EXACT, so `authenticate` answered 'public' before looking at
 * any key and the bot was nobody: every Join press got 401, every member was
 * shown "Join for 10 000", and no charge was booked on verify. All 35 bot
 * tests and 9 render tests were green, because the bot's double checked the
 * key by itself and the render's wiring test read the broken expression out of
 * render-server.ts and pinned it.
 *
 * So here nothing on either side is a copy. The bot's real service
 * (src/services/clubMembership.ts) sends its real request through the real
 * fetch to a real node http server running the render's handleClub with the
 * render's clubIdentity -- the function render-server.ts hands to it. Only
 * what is outside both services is faked: Postgres (a strict in-memory
 * club_period that refuses SQL it does not know) and Telegram's cashier.
 */

import {
  fetchClubStatus,
  requestClubInvoice,
  confirmClubPayment,
  ClubUnavailableError,
} from '@/services/clubMembership'
import {
  showClubCard,
  joinClub,
  CLUB_JOIN,
} from '@/navigation/helpers/clubCard'
import { setEventsPoolForTests } from '@/services/trackEvent'
import { strictEventsDb } from '../services/strictEventsDb'
import {
  handleClub,
  forgetClubTablesForTests,
  type StarTx,
} from '../../../apps/vibee-editor/render/src/agent/club-membership'
import { clubIdentity } from '../../../apps/vibee-editor/render/src/agent/club-identity'
import { forgetTable } from '../../../apps/vibee-editor/render/src/hive/journal'
import { RENDER_ORIGIN } from './renderClubDouble'

/** Both services hold the same RENDER_API_KEY in production; so do they here. */
const KEY = 'shared-server-key-for-the-contract'
const STRANGER = '900000081'
const MEMBER = '900000082'
const PAYER = '900000083'
const DAY = 24 * 60 * 60 * 1000

type Period = {
  telegram_id: string
  stars: number
  tokens_granted: number
  star_tx_id: string
  paid_at: string
  until: string
}

/** The render's Postgres for the club routes: club_period and the journal, nothing else. */
function renderDb() {
  const periods: Period[] = []
  const journal: unknown[][] = []
  const query = async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()
    if (/^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/i.test(s))
      return { rows: [] }
    if (
      /^SELECT paid_at::text, until::text, COUNT\(\*\) OVER \(\) AS periods FROM club_period WHERE telegram_id = \$1 ORDER BY until DESC LIMIT 1$/i.test(
        s
      )
    ) {
      const mine = periods
        .filter(p => p.telegram_id === String(params[0]))
        .sort((a, b) => b.until.localeCompare(a.until))
      return {
        rows: mine.length
          ? [
              {
                paid_at: mine[0].paid_at,
                until: mine[0].until,
                periods: mine.length,
              },
            ]
          : [],
      }
    }
    if (
      /^SELECT id FROM club_period WHERE star_tx_id = \$1 LIMIT 1$/i.test(s)
    ) {
      return {
        rows: periods
          .filter(p => p.star_tx_id === String(params[0]))
          .map((_, i) => ({ id: i + 1 })),
      }
    }
    if (
      /^INSERT INTO club_period \(telegram_id, stars, tokens_granted, star_tx_id, paid_at, until\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6\) ON CONFLICT \(star_tx_id\) DO NOTHING RETURNING id$/i.test(
        s
      )
    ) {
      const [telegram_id, stars, tokens_granted, star_tx_id, paid_at, until] =
        params as [string, number, number, string, string, string]
      if (periods.some(p => p.star_tx_id === star_tx_id)) return { rows: [] }
      periods.push({
        telegram_id,
        stars,
        tokens_granted,
        star_tx_id,
        paid_at,
        until,
      })
      return { rows: [{ id: periods.length }] }
    }
    if (
      /^INSERT INTO hive_events \(kind, who, bot, amount, what, severity\)/i.test(
        s
      )
    ) {
      journal.push(params)
      return { rows: [] }
    }
    throw new Error(`the render's database does not know: ${s.slice(0, 120)}`)
  }
  return { periods, journal, query }
}

/** Telegram's Bot API as the render's cashier sees it. */
function telegram(transactions: StarTx[] = []) {
  const minted: Array<Record<string, any>> = []
  const fetchImpl = (async (url: string, init?: { body?: string }) => {
    const u = String(url)
    if (/\/createInvoiceLink$/.test(u)) {
      const body = JSON.parse(String(init?.body ?? '{}'))
      minted.push(body)
      return {
        json: async () => ({
          ok: true,
          result: `https://t.me/$${body.payload}`,
        }),
      }
    }
    if (/\/getStarTransactions\?/.test(u)) {
      return { json: async () => ({ ok: true, result: { transactions } }) }
    }
    throw new Error(`the cashier was asked for ${u}`)
  }) as unknown as typeof fetch
  return { minted, fetchImpl }
}

let db: ReturnType<typeof renderDb>
let cashier: ReturnType<typeof telegram>
let credited: Array<{ telegramId: string; tokens: number; chargeId: string }>
let server: http.Server
let local = ''

const realFetch = globalThis.fetch

/** The bot's transport: the production URL it builds, delivered to the local render. */
const toTheRender = (async (url: unknown, init?: RequestInit) => {
  const u = new URL(String(url))
  if (u.origin !== RENDER_ORIGIN) throw new Error(`not the render: ${u.origin}`)
  return realFetch(`${local}${u.pathname}${u.search}`, init)
}) as unknown as typeof fetch

beforeAll(async () => {
  // Exactly what render-server.ts does on an /api/club/* request.
  server = http.createServer(async (req, res) => {
    try {
      const out = await handleClub(req, {
        getPool: async () => db,
        identity: r => clubIdentity(r as http.IncomingMessage),
        botToken: 'cashier-token',
        credit: async c => {
          credited.push(c)
          return { credited: true }
        },
        fetchImpl: cashier.fetchImpl,
      })
      res.writeHead(out.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(out.body))
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(e) }))
    }
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()))
})

let events: ReturnType<typeof strictEventsDb>

beforeEach(() => {
  forgetClubTablesForTests()
  forgetTable()
  db = renderDb()
  cashier = telegram()
  credited = []
  events = strictEventsDb()
  setEventsPoolForTests(events)
  process.env.RENDER_API_KEY = KEY
  // A paid month on file for the member, running for another ten days.
  const paid = new Date(Date.now() - 20 * DAY)
  db.periods.push({
    telegram_id: MEMBER,
    stars: 10000,
    tokens_granted: 2571,
    star_tx_id: 'stx-member-first-month',
    paid_at: paid.toISOString(),
    until: new Date(paid.getTime() + 30 * DAY).toISOString(),
  })
})

afterEach(() => {
  setEventsPoolForTests(null)
})

describe('the server key opens the club routes to the bot', () => {
  it('status answers for the named person: a member is a member', async () => {
    const member = await fetchClubStatus(MEMBER, { fetchImpl: toTheRender })
    expect(member).toMatchObject({
      active: true,
      stars: 10000,
      tokensPerPeriod: 2571,
    })
    expect(member.daysLeft).toBeGreaterThan(0)
    const stranger = await fetchClubStatus(STRANGER, { fetchImpl: toTheRender })
    expect(stranger.active).toBe(false)
  })

  it('Join mints an invoice for the person, through the render cashier', async () => {
    const out = await requestClubInvoice(STRANGER, { fetchImpl: toTheRender })
    expect(out).toMatchObject({
      kind: 'invoice',
      stars: 10000,
      tokens: 2571,
      periodDays: 30,
    })
    expect(cashier.minted.map(m => m.payload)).toEqual([
      `club:10000:${STRANGER}`,
    ])
  })

  it('a member is not sold what they have: no invoice is minted', async () => {
    const out = await requestClubInvoice(MEMBER, { fetchImpl: toTheRender })
    expect(out.kind).toBe('member')
    expect(cashier.minted).toEqual([])
  })

  it("verify books the payer's charge right away, not on the hourly sweep", async () => {
    cashier = telegram([
      {
        id: 'stx-payer-first-month',
        amount: 10000,
        date: Math.floor(Date.now() / 1000),
        source: {
          type: 'user',
          user: { id: Number(PAYER) },
          subscription_period: 30 * 24 * 60 * 60,
          invoice_payload: `club:10000:${PAYER}`,
        },
      },
    ])
    const booked = await confirmClubPayment(PAYER, { fetchImpl: toTheRender })
    expect(booked).toMatchObject({ active: true, credited: 2571 })
    expect(credited).toEqual([
      {
        telegramId: PAYER,
        tokens: 2571,
        chargeId: 'club:stx-payer-first-month',
      },
    ])
    expect(db.periods.map(p => p.telegram_id)).toContain(PAYER)
  })
})

describe('what the person sees, end to end', () => {
  const person = (id: string) => {
    const replies: Array<{ text: string; extra: any }> = []
    const ctx = {
      from: { id: Number(id), language_code: 'ru', username: 'someone' },
      chat: { id: Number(id), type: 'private' },
      botInfo: { username: 'test_bot' },
      state: {},
      session: {},
      reply: vi.fn(async (text: string, extra?: any) => {
        replies.push({ text: String(text), extra })
        return {}
      }),
    }
    return { ctx: ctx as any, replies }
  }
  const buttons = (extra: any) =>
    (extra?.reply_markup?.inline_keyboard ?? []).flat() as Array<{
      callback_data?: string
      url?: string
    }>

  it('a member opening /club is told they are in, with no join button', async () => {
    const { ctx, replies } = person(MEMBER)
    await showClubCard(ctx, 'command', { fetchImpl: toTheRender })
    expect(replies[0].text).toContain('Вы в клубе') // cyrillic-ok: UI copy under test
    expect(
      buttons(replies[0].extra).some(b => b.callback_data === CLUB_JOIN)
    ).toBe(false)
    await vi.waitFor(() =>
      expect(events.rows('user_events').map(r => r.detail?.member)).toEqual([
        true,
      ])
    )
  })

  it('a stranger pressing Join gets the link the cashier minted for them', async () => {
    const { ctx, replies } = person(STRANGER)
    await joinClub(ctx, { fetchImpl: toTheRender })
    const pay = buttons(replies[0].extra).find(b => b.url)
    expect(pay?.url).toBe(`https://t.me/$club:10000:${STRANGER}`)
  })
})

describe('and only to the bot', () => {
  it('another key is nobody: no invoice, no verify, and the member reads as a stranger', async () => {
    const wrong = {
      fetchImpl: toTheRender,
      key: 'not-the-server-key-at-all!!!!!!!!!',
    }
    await expect(requestClubInvoice(STRANGER, wrong)).rejects.toBeInstanceOf(
      ClubUnavailableError
    )
    await expect(confirmClubPayment(PAYER, wrong)).rejects.toBeInstanceOf(
      ClubUnavailableError
    )
    expect((await fetchClubStatus(MEMBER, wrong)).active).toBe(false)
    expect(cashier.minted).toEqual([])
  })
})
