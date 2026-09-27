import { describe, expect, it, vi } from 'vitest'

vi.mock('./telegram-tools', async orig => ({
  ...(await orig<typeof import('./telegram-tools')>()),
  requireSeller: vi.fn(async (ctx?: { telegramId?: string }) => {
    if (!ctx?.telegramId) throw new Error('who is asking')
  }),
}))

import {
  CRM_REVENUE_TOOLS,
  crmRevenue,
  ownerAudience,
} from './crm-revenue-tool'
import { COMPACT_TOOLS_EXCLUDED, DIRECT_CALL_ONLY, TOOLS } from './tools'

/**
 * WHAT THE OWNER'S CLIENTS HAVE BROUGHT.
 *
 * Pinned: only the owner's audience is summed; only purchases (the SQL says
 * kind = 'purchase' and delta > 0); the owner's own purchases are not a
 * client's; an unreadable ledger is unknown, not zero. Fictional ids only.
 */
const OWNER = '900000061'
const A = '900000062'
const B = '900000063'
const C = '900000064'
const STRANGER = '900000069'

type Rows = Record<string, any[] | Error>

/** A pool answering by table; an Error value makes that table missing. */
function pool(t: Rows) {
  const seen: Array<{ sql: string; params: unknown[] }> = []
  const answer = (key: string) => {
    const v = t[key]
    if (v instanceof Error) throw v
    return { rows: v ?? [] }
  }
  return {
    seen,
    async query(sql: string, params: unknown[] = []) {
      seen.push({ sql, params })
      if (/FROM token_ledger/.test(sql)) return answer('ledger')
      if (/FROM crm_people/.test(sql) && /first_name/.test(sql))
        return answer('names')
      if (/FROM crm_people/.test(sql)) return answer('people')
      if (/FROM crm_messages/.test(sql)) return answer('messages')
      if (/FROM token_invoices/.test(sql)) return answer('invoices')
      return { rows: [] }
    },
  }
}

const missing = new Error('relation does not exist')

describe('ownerAudience', () => {
  it('people, DMs and invoiced clients, without the owner himself', async () => {
    const ids = await ownerAudience(
      pool({
        people: [{ id: A }],
        messages: [{ id: B }, { id: OWNER }],
        invoices: [{ id: C }],
      }) as never,
      OWNER
    )
    expect([...ids!].sort()).toEqual([A, B, C])
  })

  it('every source keyed by the caller', async () => {
    const p = pool({})
    await ownerAudience(p as never, OWNER)
    expect(p.seen).toHaveLength(3)
    for (const q of p.seen) {
      expect(q.sql).toMatch(/owner_id = \$1/)
      expect(q.params).toEqual([OWNER])
    }
  })

  it('a missing table costs its source; all missing is unknown', async () => {
    const some = await ownerAudience(
      pool({
        people: missing,
        messages: [{ id: A }],
        invoices: missing,
      }) as never,
      OWNER
    )
    expect([...some!]).toEqual([A])
    const none = await ownerAudience(
      pool({ people: missing, messages: missing, invoices: missing }) as never,
      OWNER
    )
    expect(none).toBeNull()
  })
})

describe('crmRevenue', () => {
  it('totals, 30 days, paying clients, LTV and the top by stars', async () => {
    const p = pool({
      people: [{ id: A }, { id: B }, { id: C }],
      ledger: [
        { telegram_id: A, stars: 1500, stars_30d: 500 },
        { telegram_id: B, stars: 3000, stars_30d: 0 },
        // Not in the audience: the database must not leak it into the sum.
        { telegram_id: STRANGER, stars: 99999, stars_30d: 99999 },
      ],
      names: [{ lead_id: B, first_name: 'Vera', last_name: null }],
    })
    const r = await crmRevenue(p as never, OWNER)
    expect(r).toEqual({
      total: 4500,
      last_30d: 500,
      paying_clients: 2,
      ltv: 2250,
      top: [
        { id: B, name: 'Vera', stars: 3000 },
        { id: A, name: null, stars: 1500 },
      ],
    })
    const ledger = p.seen.find(q => /token_ledger/.test(q.sql))!
    expect(ledger.sql).toMatch(/kind = 'purchase' AND delta > 0/)
    expect((ledger.params[0] as string[]).sort()).toEqual([A, B, C])
  })

  it('top is five at most', async () => {
    const ids = Array.from({ length: 7 }, (_, i) => String(900000070 + i))
    const r = await crmRevenue(
      pool({
        people: ids.map(id => ({ id })),
        ledger: ids.map((id, i) => ({
          telegram_id: id,
          stars: 100 * (i + 1),
          stars_30d: 0,
        })),
      }) as never,
      OWNER
    )
    expect(r.top).toHaveLength(5)
    expect(r.top[0].stars).toBe(700)
    expect(r.paying_clients).toBe(7)
  })

  it('an audience nobody paid from is zero, and LTV is not a number', async () => {
    const r = await crmRevenue(
      pool({ people: [{ id: A }], ledger: [] }) as never,
      OWNER
    )
    expect(r).toEqual({
      total: 0,
      last_30d: 0,
      paying_clients: 0,
      ltv: null,
      top: [],
    })
  })

  it('an unreadable ledger is unknown, not zero', async () => {
    const r = await crmRevenue(
      pool({ people: [{ id: A }], ledger: missing }) as never,
      OWNER
    )
    expect(r.total).toBeNull()
    expect(r.last_30d).toBeNull()
    expect(r.paying_clients).toBeNull()
    expect(r.ltv).toBeNull()
  })

  it('no audience table at all is unknown, not zero', async () => {
    const r = await crmRevenue(
      pool({ people: missing, messages: missing, invoices: missing }) as never,
      OWNER
    )
    expect(r.total).toBeNull()
  })
})

describe('crm_revenue tool', () => {
  const tool = CRM_REVENUE_TOOLS.find(t => t.name === 'crm_revenue')!

  it('answers for the caller', async () => {
    const p = pool({
      people: [{ id: A }],
      ledger: [{ telegram_id: A, stars: 700, stars_30d: 700 }],
    })
    const r: any = await tool.handler({}, {
      telegramId: OWNER,
      pool: p,
    } as never)
    expect(r.total).toBe(700)
    expect(p.seen[0].params).toEqual([OWNER])
  })

  it('refuses without an identity', async () => {
    await expect(tool.handler({}, {} as never)).rejects.toThrow()
  })

  it('a screen: registered, direct-call only, out of the compact kit', () => {
    expect(TOOLS.some(t => t.name === 'crm_revenue')).toBe(true)
    expect(DIRECT_CALL_ONLY.has('crm_revenue')).toBe(true)
    expect(COMPACT_TOOLS_EXCLUDED.test('crm_revenue')).toBe(true)
  })
})
