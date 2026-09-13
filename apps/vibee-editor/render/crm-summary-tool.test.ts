import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * THE OVERVIEW: every number derived the way the list derives it, from a
 * three-person memory -- one waiting, one who asked a price and was answered,
 * one gone quiet.
 */
const OWNER = '144022504'
const A = '111111111'
const B = '222222222'
const C = '333333333'

function fakePool(o: { throwOn?: RegExp } = {}) {
  const queries: string[] = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push(flat)
      if (o.throwOn?.test(flat)) throw new Error('db down')
      if (/count\(\*\)::int AS people_known/.test(flat))
        return {
          rows: [{ people_known: 3, last_ingest_at: '2026-09-08T14:02:00Z' }],
        }
      if (/GROUP BY lead_id/.test(flat))
        return {
          rows: [
            {
              lead_id: A,
              total: 4,
              inbound: 3,
              last_in: '2026-09-08T10:00:00Z',
              last_out: '2026-09-07T10:00:00Z',
            },
            {
              lead_id: B,
              total: 6,
              inbound: 2,
              last_in: '2026-09-05T10:00:00Z',
              last_out: '2026-09-06T10:00:00Z',
            },
            {
              lead_id: C,
              total: 2,
              inbound: 1,
              last_in: '2026-07-30T10:00:00Z',
              last_out: '2026-07-31T10:00:00Z',
            },
          ],
        }
      if (/^SELECT lead_id, text FROM crm_messages/.test(flat))
        return {
          rows: [
            { lead_id: A, text: 'сколько стоит фото?' },
            { lead_id: B, text: 'а цена?' },
            { lead_id: C, text: 'привет' },
          ],
        }
      if (/SELECT DISTINCT ON \(lead_id\) lead_id, text/.test(flat))
        return {
          rows: [
            { lead_id: A, text: 'сколько стоит фото?' },
            { lead_id: B, text: 'а цена?' },
            { lead_id: C, text: 'привет' },
          ],
        }
      if (/FROM crm_people WHERE owner_id = \$1$/.test(flat))
        return {
          rows: [
            {
              lead_id: A,
              first_name: 'Pilot',
              last_name: null,
              username: 'pilot_client',
            },
          ],
        }
      if (/DISTINCT ON \(lead_id\) lead_id, kind, at/.test(flat))
        return {
          rows: [{ lead_id: A, kind: 'replied', at: '2026-09-08T09:00:00Z' }],
        }
      if (
        /FROM crm_touches WHERE owner_id = \$1 ORDER BY at DESC LIMIT/.test(
          flat
        )
      )
        return {
          rows: [
            { lead_id: A, kind: 'replied', at: '2026-09-08T09:00:00Z' },
            { lead_id: C, kind: 'written', at: '2026-09-01T09:00:00Z' },
          ],
        }
      if (/GROUP BY kind/.test(flat))
        return {
          rows: [
            {
              kind: 'written',
              total: 5,
              recent: 2,
              last_at: '2026-09-08T09:00:00Z',
            },
            {
              kind: 'bought',
              total: 1,
              recent: 1,
              last_at: '2026-09-07T09:00:00Z',
            },
          ],
        }
      if (/note LIKE \$3/.test(flat)) return { rows: [{ n: 1 }] }
      return { rows: [] }
    },
  }
}
const ctxFor = (who = OWNER, pool = fakePool()) =>
  ({ telegramId: who, pool, surface: 'bot', turn: 't' }) as never

async function summaryTool() {
  const { CRM_SUMMARY_TOOLS } = await import('./src/agent/crm-summary-tool')
  return CRM_SUMMARY_TOOLS[0]
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ now: new Date('2026-09-08T12:00:00Z') })
  process.env.SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'k'
  delete process.env.ZEP_API_KEY
  delete process.env.ZEP_AUTH_SECRET
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => {
        const u = String(url)
        // The owner has one bot in `avatars`; payments are scoped to it
        // (CRM audit 2026-09-12, P1 #2), so the mock must name it.
        if (u.includes('/avatars?')) return [{ bot_name: 'owner_bot' }]
        if (u.includes('payments_v2')) {
          expect(u).toContain('bot_name=in.("owner_bot")')
          return [{ telegram_id: B }]
        }
        return []
      },
    }))
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_KEY
})

describe('crm_summary', () => {
  it('counts everybody the way the list does: next, stage, signal, waiting, hot, money', async () => {
    const tool = await summaryTool()
    const r: any = await tool.handler({}, ctxFor())
    expect(r.window_days).toBe(7)
    expect(r.people_known).toBe(3)
    expect(r.last_ingest_at).toBe('2026-09-08T14:02:00.000Z')
    expect(r.people_with_messages).toBe(3)
    expect(r.messages).toEqual({ total: 12, inbound: 6, outbound: 6 })
    expect(r.last_inbound_at).toBe('2026-09-08T10:00:00.000Z')
    expect(r.paid).toBe(1)
    expect(r.waiting_for_reply).toBe(1)
    expect(r.hot).toBe(2)
    expect(r.by_next).toEqual({
      reply: 1,
      deliver: 0,
      offer: 1,
      talk: 0,
      wait: 1,
    })
    expect(r.by_stage).toEqual({
      client: 1,
      refused: 0,
      later: 0,
      talking: 1,
      written: 0,
      winback: 0,
      new: 1,
    })
    expect(r.by_signal).toEqual({
      price: 2,
      buy: 0,
      service: 1,
      urgency: 0,
      objection: 0,
    })
    expect(r.touches_by_kind.written).toEqual({
      total: 5,
      recent: 2,
      last_at: '2026-09-08T09:00:00Z',
    })
    expect(r.touches_by_kind.later).toEqual({
      total: 0,
      recent: 0,
      last_at: null,
    })
    expect(r.seller_sends_recent).toBe(1)
    expect(r.waiting_by_touch).toEqual({ ours: 1, due: 0, theirs: 1 })
    expect(r.top.map((t: any) => t.lead)).toEqual([A, B])
    expect(r.top[0]).toMatchObject({
      display: 'Pilot (@pilot_client)',
      next: 'reply',
      stage: 'talking',
      waiting_for_reply: true,
    })
    expect(r.top[1]).toMatchObject({
      display: null,
      next: 'offer',
      stage: 'client',
    })
    expect(r.pending_card).toBeNull()
    expect(r.zep).toBe('не подключён')
    // One person, one segment: A waiting, B hot (asked a price 3 days ago), C quiet.
    expect(r.segments).toEqual({
      hot: 2,
      objection: 0,
      waiting: 0,
      talk: 0,
      due: 0,
      ours: 0,
      warm: 1,
      winback: 0,
      quiet: 0,
    })
    expect(r.objections).toEqual([])
    expect(r.caps).toMatchObject({ hot: 10, waiting: 20, warm: 10, day: 30 })
    expect(r.how_to_read).toContain('Не предлагай оплату первым')
  })

  it('the window is clamped to 1..90 and defaults to 7; the SQL carries it', async () => {
    const tool = await summaryTool()
    const pool = fakePool()
    expect(
      ((await tool.handler({ days: 500 }, ctxFor(OWNER, pool))) as any)
        .window_days
    ).toBe(90)
    expect(
      ((await tool.handler({ days: 'x' }, ctxFor(OWNER, pool))) as any)
        .window_days
    ).toBe(7)
    expect(pool.queries.some(q => /GROUP BY kind/.test(q))).toBe(true)
  })

  it('a pending card is named with its age', async () => {
    const q = await import('./src/agent/tg-proposals')
    q.forgetProposals()
    q.remember({
      id: 'p77',
      telegramId: OWNER,
      action: 'send',
      target: '@pilot_client',
      what: 'x',
      turn: 't',
    } as never)
    vi.setSystemTime(new Date('2026-09-08T12:04:00Z'))
    const tool = await summaryTool()
    const r: any = await tool.handler({}, ctxFor())
    expect(r.pending_card).toEqual({
      id: 'p77',
      action: 'send',
      target: '@pilot_client',
      age_minutes: 4,
    })
  })

  it('a person without a connected account is refused before any CRM query', async () => {
    const tool = await summaryTool()
    const pool = fakePool()
    await expect(tool.handler({}, ctxFor('999', pool))).rejects.toThrow(
      'не подключён'
    )
    // The gate's own lookup of the caller's row is the only query allowed.
    expect(pool.queries.filter(q => !/tg_sessions/.test(q))).toEqual([])
  })

  it('a database that is down for the people count still yields the rest', async () => {
    const tool = await summaryTool()
    const r: any = await tool.handler(
      {},
      ctxFor(OWNER, fakePool({ throwOn: /people_known/ }))
    )
    expect(r.people_known).toBe(0)
    expect(r.last_ingest_at).toBeNull()
    expect(r.people_with_messages).toBe(3)
  })

  it('is registered, and it is in the compact seller kit', async () => {
    const { TOOLS_BY_NAME, COMPACT_TOOLS } = await import('./src/agent/tools')
    expect(TOOLS_BY_NAME.has('crm_summary')).toBe(true)
    expect(COMPACT_TOOLS.test('crm_summary')).toBe(true)
  })
})

describe('the touches helpers', () => {
  it('touchesByKind groups by kind with the window; a dead pool is an empty list', async () => {
    const { touchesByKind, sellerSendsSince, SELLER_NOTE_PREFIXES } =
      await import('./src/agent/crm-touches')
    const pool = fakePool()
    const rows = await touchesByKind(pool as never, OWNER, 200)
    expect(rows.map(r => r.kind)).toEqual(['written', 'bought'])
    expect(pool.queries.some(q => /GROUP BY kind/.test(q))).toBe(true)
    expect(
      await touchesByKind(
        fakePool({ throwOn: /GROUP BY kind/ }) as never,
        OWNER
      )
    ).toEqual([])
    expect(await sellerSendsSince(pool as never, OWNER)).toBe(1)
    expect(
      await sellerSendsSince(fakePool({ throwOn: /note LIKE/ }) as never, OWNER)
    ).toBe(0)
    expect(SELLER_NOTE_PREFIXES).toEqual({
      message: 'отправлено из личного продавца: ',
      service: 'услуга в личке: ',
      gift: 'подарок в личке: ',
    })
  })
})
