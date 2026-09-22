import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLUB_OFFER_WHEN,
  CLUB_PERIOD_S,
  CLUB_STARS,
  clubCashierToken,
  clubOfferLine,
  clubTokensPerPeriod,
  forgetClubTablesForTests,
  handleClub,
  spacedNumber,
} from './src/agent/club-membership'
import {
  makeClubInvoiceTool,
  type ClubInvoiceToolDeps,
} from './src/agent/club-invoice-tool'
import {
  USER_EVENTS_TABLE_SQL,
  forgetUserEventsTableForTests,
  trackUserEvent,
} from './src/agent/user-events'
import { forgetTable } from './src/hive/journal'
import { isOutwardTool } from './src/agent/web-tools'
import { systemPrompt } from './src/agent/chat'
import type { ToolContext } from './src/agent/tools'

/**
 * THE AGENT CAN HAND A PERSON THE CLUB INVOICE IN THE CHAT -- WHEN THEY ASKED.
 *
 * Measured 2026-09-22: of 49 new people in thirty days, 5 ever opened the Mini
 * App, and the agent's only answer to "I want the club" was "go to the Mini
 * App's profile". `club_invoice` mints the same subscription invoice the
 * bot's club card mints, through the same decision (`clubInvoiceFor`), and
 * these tests pin what it may and may not do:
 *
 *   - a paid member, a bot owner and a keeper are refused, and told until when;
 *   - everybody else gets a link from the CLUB's cashier -- never from the
 *     person's own farm bot, whose ledger the render never reads for the club;
 *   - the sentence the agent says is `clubOfferLine()`, the one source;
 *   - the funnel gets the same `club_invoice_created` row the card writes;
 *   - nothing is ever credited: the fake database refuses every statement it
 *     was not told about, so a stray write to a wallet or a grant fails here.
 *
 * Invented ids only (9000000xx).
 */

const PERSON = '900000071'
const CLUB_CASHIER = 'club-cashier-token' // secret-guard-ok: invented for this test
const FARM_BOT = 'farm-token-one' // secret-guard-ok: invented for this test

type Row = Record<string, unknown>

/** Knows the statements the club makes; anything else is a failure, not an empty answer. */
function strictPool(opts: { paidUntil?: string; grantUntil?: string } = {}) {
  const journal: Array<{ kind: unknown; who: unknown; what: unknown }> = []
  const funnel: Row[] = []
  const seen: string[] = []
  return {
    journal,
    funnel,
    seen,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      seen.push(s)
      if (/^CREATE (TABLE|INDEX|UNIQUE INDEX) IF NOT EXISTS/i.test(s))
        return { rows: [] }
      if (/^INSERT INTO hive_events \(/i.test(s)) {
        journal.push({ kind: params[0], who: params[1], what: params[4] })
        return { rows: [] }
      }
      if (
        /^INSERT INTO user_events \(telegram_id, bot_name, event, detail\)/i.test(
          s
        )
      ) {
        funnel.push({
          telegram_id: params[0],
          bot_name: params[1],
          event: params[2],
          detail: params[3] ? JSON.parse(String(params[3])) : null,
        })
        return { rows: [] }
      }
      if (
        /FROM club_period WHERE telegram_id = \$1 ORDER BY until DESC LIMIT 1$/i.test(
          s
        )
      ) {
        return {
          rows: opts.paidUntil
            ? [
                {
                  paid_at: '2026-09-20T00:00:00Z',
                  until: opts.paidUntil,
                  periods: 1,
                },
              ]
            : [],
        }
      }
      if (
        /FROM club_grant_period WHERE telegram_id = \$1 ORDER BY until DESC LIMIT 1$/i.test(
          s
        )
      ) {
        return {
          rows: opts.grantUntil
            ? [
                {
                  id: 1,
                  telegram_id: params[0],
                  grant_kind: 'owner',
                  tokens_granted: clubTokensPerPeriod(), // secret-guard-ok: token count, not a credential
                  credited: true,
                  period_start: '2026-09-15T00:00:00Z',
                  until: opts.grantUntil,
                },
              ]
            : [],
        }
      }
      throw new Error(`strictPool does not know: ${s.slice(0, 100)}`)
    },
  }
}

/** Telegram's createInvoiceLink, and nothing else. */
function cashier(answer: 'ok' | 'refuse' = 'ok') {
  const calls: Array<{ url: string; body: any }> = []
  const fetchImpl = (async (url: unknown, init?: { body?: string }) => {
    const u = String(url)
    if (!/\/createInvoiceLink$/.test(u)) {
      throw new Error(`the cashier was asked for ${u}`)
    }
    calls.push({ url: u, body: JSON.parse(String(init?.body ?? '{}')) })
    return {
      json: async () =>
        answer === 'ok'
          ? { ok: true, result: `https://t.me/$club_invoice_${calls.length}` }
          : { ok: false, description: 'Bad Request: invoice refused' },
    }
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

const NOW = new Date('2026-09-22T12:00:00Z')

function toolWith(
  c: ReturnType<typeof cashier>,
  who: { owners?: string[]; keepers?: string[]; guests?: string[] } = {},
  over: Partial<ClubInvoiceToolDeps> = {}
) {
  return makeClubInvoiceTool({
    cashierToken: () => CLUB_CASHIER,
    grant: {
      botsOwnedBy: async id => (who.owners?.includes(id) ? ['some_bot'] : []),
      keepers: () => who.keepers ?? [],
      guests: () => who.guests ?? [],
    },
    fetchImpl: c.fetchImpl,
    now: () => NOW,
    botNameOf: async () => 'neuro_blogger_bot',
    track: trackUserEvent,
    ...over,
  })
}

const ctxFor = (
  pool: ReturnType<typeof strictPool>,
  over: Partial<ToolContext> = {}
): ToolContext =>
  ({ telegramId: PERSON, pool, surface: 'bot', ...over }) as ToolContext

beforeEach(() => {
  forgetClubTablesForTests()
  forgetTable()
  forgetUserEventsTableForTests()
})

describe('a person who is not in the club gets the invoice', () => {
  it('a link from the club cashier, for this person, at the club price', async () => {
    const pool = strictPool()
    const c = cashier()
    const r = (await toolWith(c).handler({}, ctxFor(pool))) as Row
    expect(r.ok).toBe(true)
    expect(c.calls).toHaveLength(1)
    expect(c.calls[0].url).toContain(`/bot${CLUB_CASHIER}/createInvoiceLink`)
    expect(c.calls[0].body.payload).toBe(`club:${CLUB_STARS}:${PERSON}`)
    expect(c.calls[0].body.subscription_period).toBe(CLUB_PERIOD_S)
    expect(c.calls[0].body.currency).toBe('XTR')
    expect(r.link).toBe('https://t.me/$club_invoice_1')
    expect(r.stars).toBe(CLUB_STARS)
    expect(r.period_days).toBe(30)
    expect(r.tokens_back).toBe(clubTokensPerPeriod())
    // The same journal line the route writes for a minted invoice.
    expect(pool.journal.map(e => e.kind)).toEqual(['invoice'])
  })

  it('the sentence to say is the one club offer, not a copy', async () => {
    const r = (await toolWith(cashier()).handler(
      {},
      ctxFor(strictPool())
    )) as Row
    expect(r.offer).toBe(clubOfferLine())
    // And the tool's own words carry no price: the price is in the offer.
    expect(String(r.say)).not.toContain(spacedNumber(CLUB_STARS))
  })

  it('the link is in the shape the bot turns into a pay button', async () => {
    const r = (await toolWith(cashier()).handler(
      {},
      ctxFor(strictPool())
    )) as Row
    // payRow in the bot's actionButtons.ts: the same path as a token invoice.
    expect(String(r.link)).toMatch(/^https:\/\/t\.me\/\$[A-Za-z0-9_-]+$/)
    expect(String(r.say)).toMatch(/отдельной строкой|следующей строкой/) // cyrillic-ok: the instruction
  })

  it('a guest pass is an invitation, not a purchase: the guest may pay', async () => {
    const c = cashier()
    const r = (await toolWith(c, { guests: [PERSON] }).handler(
      {},
      ctxFor(strictPool())
    )) as Row
    expect(r.ok).toBe(true)
    expect(c.calls).toHaveLength(1)
    expect(r.guest_pass).toBeTruthy()
  })
})

describe('somebody already in the club is not sold it again', () => {
  it('a paid month running: refused, and told until when', async () => {
    const c = cashier()
    const pool = strictPool({ paidUntil: '2026-10-20T00:00:00Z' })
    const r = (await toolWith(c).handler({}, ctxFor(pool))) as Row
    expect(r.ok).toBe(false)
    expect(r.already_member).toBe(true)
    expect(r.paid).toBe(true)
    expect(r.until).toBe('2026-10-20T00:00:00Z')
    expect(r.days_left).toBe(28)
    expect(String(r.say)).toContain('20 октября 2026') // cyrillic-ok: the date as said
    expect(c.calls).toEqual([])
    expect(pool.funnel).toEqual([])
  })

  it('a bot owner: the club is theirs for free, so no invoice', async () => {
    const c = cashier()
    const pool = strictPool({ grantUntil: '2026-10-15T00:00:00Z' })
    const r = (await toolWith(c, { owners: [PERSON] }).handler(
      {},
      ctxFor(pool)
    )) as Row
    expect(r.already_member).toBe(true)
    expect(r.granted).toBe('owner')
    expect(String(r.say)).toContain('15 октября 2026') // cyrillic-ok: the date as said
    expect(c.calls).toEqual([])
  })

  it('a keeper: the same', async () => {
    const c = cashier()
    const r = (await toolWith(c, { keepers: [PERSON] }).handler(
      {},
      ctxFor(strictPool())
    )) as Row
    expect(r.already_member).toBe(true)
    expect(r.granted).toBe('keeper')
    expect(c.calls).toEqual([])
  })

  /**
   * The refusal of a funded pass is the AGENT's rule, not the till's. The
   * route keeps selling to an owner who presses "join" himself (the comment
   * in handleClub); this pins that the new flag did not leak into it.
   */
  it('the route still sells to an owner who asks for it himself', async () => {
    const c = cashier()
    const out = await handleClub(
      { url: '/api/club/invoice', method: 'POST' },
      {
        getPool: async () => strictPool(),
        identity: () => PERSON,
        botToken: CLUB_CASHIER,
        credit: async () => ({ credited: false }),
        fetchImpl: c.fetchImpl,
        grant: { botsOwnedBy: async () => ['some_bot'], keepers: () => [] },
      }
    )
    expect(out.status).toBe(200)
    expect(out.body.ok).toBe(true)
    expect(c.calls).toHaveLength(1)
  })
})

describe('where the tool does not sell at all', () => {
  it('the client in the owner DM: the club is not sold there', async () => {
    const c = cashier()
    const pool = strictPool()
    const r = (await toolWith(c).handler(
      {},
      ctxFor(pool, { surface: 'business' })
    )) as Row
    expect(r.ok).toBe(false)
    expect(r.refused).toBe('not_sold_here')
    expect(c.calls).toEqual([])
    expect(pool.seen).toEqual([])
  })

  it('a chat or a channel is not a person', async () => {
    const c = cashier()
    const r = (await toolWith(c).handler(
      {},
      ctxFor(strictPool(), { telegramId: '-1009000000711' })
    )) as Row
    expect(r.refused).toBe('not_a_person')
    expect(c.calls).toEqual([])
  })

  it('a cashier that refuses is our failure: an alarm, no link, no funnel row', async () => {
    const pool = strictPool()
    const r = (await toolWith(cashier('refuse')).handler(
      {},
      ctxFor(pool)
    )) as Row
    expect(r.ok).toBe(false)
    expect(r.link).toBeUndefined()
    expect(pool.journal.map(e => e.kind)).toEqual(['payment-failed'])
    expect(pool.funnel).toEqual([])
  })

  it('no cashier configured: the same alarm the route raises', async () => {
    const c = cashier()
    const pool = strictPool()
    const r = (await toolWith(c, {}, { cashierToken: () => '' }).handler(
      {},
      ctxFor(pool)
    )) as Row
    expect(r.ok).toBe(false)
    expect(String(r.error)).toContain('TOKENS_PAYMENT_BOT_TOKEN')
    expect(c.calls).toEqual([])
    expect(pool.journal.map(e => e.kind)).toEqual(['payment-failed'])
  })
})

describe('the funnel sees the invoice the agent handed over', () => {
  it('writes the same club_invoice_created row the card writes', async () => {
    const pool = strictPool()
    await toolWith(cashier()).handler({}, ctxFor(pool))
    await vi.waitFor(() => expect(pool.funnel).toHaveLength(1))
    expect(pool.funnel[0]).toEqual({
      telegram_id: PERSON,
      bot_name: 'neuro_blogger_bot',
      event: 'club_invoice_created',
      detail: { stars: CLUB_STARS, via: 'agent', surface: 'bot' },
    })
  })

  it('a funnel that cannot write costs the person nothing', async () => {
    const pool = strictPool()
    const r = (await toolWith(
      cashier(),
      {},
      {
        track: async () => {
          throw new Error('funnel down')
        },
      }
    ).handler({}, ctxFor(pool))) as Row
    expect(r.ok).toBe(true)
    expect(r.link).toBeTruthy()
  })

  it("the render's user_events table is the bot's table", () => {
    const bot = readFileSync(
      join(__dirname, '..', '..', '..', 'src', 'services', 'trackEvent.ts'),
      'utf8'
    )
    const m = /`(CREATE TABLE IF NOT EXISTS user_events \([\s\S]*?\))`/.exec(
      bot
    )
    expect(
      m,
      'the bot no longer creates user_events where this test looks'
    ).toBeTruthy()
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
    expect(flat(USER_EVENTS_TABLE_SQL)).toBe(flat(m![1]))
  })
})

describe('the tool in the registry', () => {
  it('is offered in the full catalogue and over MCP, not in the small seller kit', async () => {
    const { TOOLS, toMcpTools, toolsForProvider } = await import(
      './src/agent/tools'
    )
    expect(TOOLS.map(t => t.name)).toContain('club_invoice')
    expect(toMcpTools().map(t => t.name)).toContain('club_invoice')
    // The seller's kit sells to leads through crm_offer; the person's own
    // cashier and price list (tokens_invoice, pricing) are not in it either.
    const kit = toolsForProvider({ compact: true }, TOOLS).map(t => t.name)
    expect(kit).not.toContain('club_invoice')
    expect(kit).not.toContain('tokens_invoice')
    expect(kit).not.toContain('pricing')
  }, 60_000)

  it('is outward: a turn that read the web cannot hand out a payment link', () => {
    expect(isOutwardTool('club_invoice')).toBe(true)
  })

  it('the description says when, with the prompt own rule, and names no price', () => {
    const d = toolWith(cashier()).description
    expect(d).toContain(CLUB_OFFER_WHEN)
    expect(d).toContain('ТОЛЬКО когда человек сам спросил') // cyrillic-ok: the rule
    expect(d).toContain('сначала разговор, потом оплата') // cyrillic-ok: the rule
    expect(d).not.toContain(spacedNumber(CLUB_STARS))
  })

  it('the prompt sends a person who wants in to club_invoice, after the talk', () => {
    for (const surface of ['bot', 'app']) {
      const p = systemPrompt(surface)
      expect(p, surface).toContain('club_invoice')
      expect(p, surface).toContain('Сначала разговор, потом оплата') // cyrillic-ok: the rule
      // The old instruction that sent everybody to the Mini App is gone.
      expect(p, surface).not.toContain('отправь в') // cyrillic-ok: the removed copy
    }
    // The client in the owner's DM is not sold the club.
    expect(systemPrompt('business')).not.toContain('club_invoice')
  })
})

describe('the registered tool, with the real farm and the real cashier rule', () => {
  /*
   * The farm knows this person's own bot, and tokens_invoice mints with it --
   * that is the control: the farm lookup works in this test. The club invoice
   * for the same person is still minted by the club cashier, the only bot
   * whose Stars ledger the render reads for club months.
   */
  const posted: Array<{ url: string; body: any }> = []

  beforeEach(() => {
    posted.length = 0
    vi.resetModules()
    vi.stubEnv('TOKENS_PAYMENT_BOT_TOKEN', CLUB_CASHIER)
    vi.stubEnv('BOT_TOKEN_1', FARM_BOT)
    vi.stubEnv('SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
    const usernames: Record<string, string> = {
      [FARM_BOT]: 'neuro_blogger_bot',
      [CLUB_CASHIER]: 't27ai_bot',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body?: string }) => {
        const u = String(url)
        posted.push({
          url: u,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        })
        if (u.endsWith('/getMe')) {
          const token = /\/bot([^/]+)\/getMe$/.exec(u)?.[1] ?? ''
          const username = usernames[token]
          return {
            status: 200,
            json: async () =>
              username ? { ok: true, result: { username } } : { ok: false },
          }
        }
        if (u.endsWith('/createInvoiceLink')) {
          return {
            status: 200,
            json: async () => ({ ok: true, result: 'https://t.me/$minted' }),
          }
        }
        if (u.includes('/rest/v1/avatars')) {
          return { ok: true, status: 200, json: async () => [] }
        }
        if (u.includes('/rest/v1/users')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { telegram_id: PERSON, bot_name: 'neuro_blogger_bot' },
            ],
          }
        }
        throw new Error(`no such address in this test: ${u}`)
      })
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('the club cashier mints, although the person belongs to a farm bot', async () => {
    const { TOOLS_BY_NAME } = await import('./src/agent/tools')
    const tokens = TOOLS_BY_NAME.get('tokens_invoice')!
    const club = TOOLS_BY_NAME.get('club_invoice')!
    const pool = strictPool()
    const permissive = {
      query: async () => ({ rows: [] }),
    }

    // Control: the farm really places this person on their own bot.
    await tokens.handler({ tokens: 50 }, {
      telegramId: PERSON,
      pool: permissive,
      surface: 'bot',
    } as never)
    const tokenMint = posted.filter(p => p.url.endsWith('/createInvoiceLink'))
    expect(tokenMint).toHaveLength(1)
    expect(tokenMint[0].url).toContain(`/bot${FARM_BOT}/`)

    const r = (await club.handler({}, ctxFor(pool))) as Row
    expect(r.ok).toBe(true)
    const mints = posted.filter(p => p.url.endsWith('/createInvoiceLink'))
    expect(mints).toHaveLength(2)
    expect(mints[1].url).toContain(`/bot${CLUB_CASHIER}/`)
    expect(mints[1].url).not.toContain(FARM_BOT)
    expect(mints[1].body.payload).toBe(`club:${CLUB_STARS}:${PERSON}`)
    // The cashier the route and the sweep read is this same token.
    expect(clubCashierToken()).toBe(CLUB_CASHIER)
    // The funnel row names the bot the person belongs to.
    await vi.waitFor(() => expect(pool.funnel).toHaveLength(1))
    expect(pool.funnel[0].bot_name).toBe('neuro_blogger_bot')
  }, 60_000)
})
