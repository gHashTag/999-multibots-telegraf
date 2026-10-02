import { describe, expect, it } from 'vitest'
import * as SPEC from './queen-growth.gen'
import {
  ACTIONS,
  QUEEN_GROWTH_TOOLS,
  growthFor,
  invoiceOpen,
  mayRead,
  nextAction,
} from '../agent/queen-growth'

/**
 * THE QUEEN'S GROWTH ADVICE IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * gHashTag/t27 specs/automation/queen-growth.t27 is the spec of record. Each
 * `test` of the spec runs here against the HOST, src/agent/queen-growth.ts,
 * and the tool runs over a stubbed pool -- no database.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/queen-growth
 */

const na = (
  walletKnown: boolean,
  bots: number,
  audience: number,
  openInvoices: number,
  paying: number,
  payingInWindow: number
) =>
  nextAction({
    walletKnown,
    bots,
    audience,
    openInvoices,
    paying,
    payingInWindow,
  })

describe('spec automation/queen-growth', () => {
  it('a recommendation is read by its own identified person only', () => {
    expect(mayRead(true, true)).toBe(true)
    expect(mayRead(true, false)).toBe(false)
    expect(mayRead(false, true)).toBe(false)
    expect(mayRead(false, false)).toBe(false)
  })

  it('an unreadable wallet is unknown, never a zero that asks for a first offer', () => {
    expect(na(false, 1, 5, 0, 0, 0)).toBe(SPEC.ACT_UNKNOWN)
    expect(na(false, 0, 0, 0, 0, 0)).toBe(SPEC.ACT_UNKNOWN)
  })

  it('no bot comes first, then no contacts', () => {
    expect(na(true, 0, 9, 2, 4, 4)).toBe(SPEC.ACT_CONNECT_BOT)
    expect(na(true, 1, 0, 0, 0, 0)).toBe(SPEC.ACT_FIRST_CONTACTS)
  })

  it('an open invoice is followed up before any new offer', () => {
    expect(na(true, 1, 3, 1, 0, 0)).toBe(SPEC.ACT_FOLLOW_UP_INVOICE)
    expect(na(true, 1, 3, 1, 5, 5)).toBe(SPEC.ACT_FOLLOW_UP_INVOICE)
  })

  it('an invoice is open while unpaid, not cancelled and at most the open days old', () => {
    expect(invoiceOpen(false, false, 0)).toBe(true)
    expect(invoiceOpen(false, false, 14)).toBe(true)
    expect(invoiceOpen(false, false, 15)).toBe(false)
    expect(invoiceOpen(true, false, 1)).toBe(false)
    expect(invoiceOpen(false, true, 1)).toBe(false)
  })

  it('contacts and no payer ask for a first offer', () => {
    expect(na(true, 1, 3, 0, 0, 0)).toBe(SPEC.ACT_FIRST_OFFER)
  })

  it('a payer who went quiet in the window is won back', () => {
    expect(na(true, 1, 3, 0, 1, 0)).toBe(SPEC.ACT_WIN_BACK)
    expect(na(true, 2, 8, 0, 5, 0)).toBe(SPEC.ACT_WIN_BACK)
  })

  it('referrals are asked from the third payer, not before', () => {
    expect(na(true, 1, 9, 0, 2, 1)).toBe(SPEC.ACT_NEXT_OFFER)
    expect(na(true, 1, 9, 0, 3, 1)).toBe(SPEC.ACT_ASK_REFERRAL)
    expect(na(true, 1, 9, 0, 7, 2)).toBe(SPEC.ACT_ASK_REFERRAL)
  })

  it('every action code is below the count', () => {
    const codes = Object.keys(ACTIONS).map(Number)
    expect(codes).toHaveLength(SPEC.ACT_COUNT)
    for (const c of codes) expect(c).toBeLessThan(SPEC.ACT_COUNT)
  })

  it('slice 1 sends nothing, promises nothing and never reads the archive', async () => {
    expect(SPEC.SENDS_MESSAGES).toBe(false)
    expect(SPEC.PROMISES_EARNINGS).toBe(false)
    expect(SPEC.READS_PAYMENTS_ARCHIVE).toBe(false)
    const sql: string[] = []
    const pool = {
      query: async (s: string) => {
        sql.push(s)
        return { rows: [] }
      },
    }
    const g = await growthFor(pool, 'owner-a', async () => ['bot_a'])
    expect(g.sends_messages).toBe(false)
    expect(g.promises_earnings).toBe(false)
    expect(sql.join('\n')).not.toMatch(/payments_v2/)
    expect(sql.join('\n')).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i)
    // Nothing the Queen says names a sum the person "will" earn.
    for (const a of Object.values(ACTIONS))
      expect(a.say + a.how).not.toMatch(/заработа[её]те|получите \d/) // cyrillic-ok: the claim words it must not say
  })

  it('the window is thirty days and referrals need three payers', () => {
    expect(SPEC.WINDOW_DAYS).toBe(30)
    expect(SPEC.REFERRAL_MIN_PAYING).toBe(3)
    expect(SPEC.INVOICE_OPEN_DAYS).toBe(14)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})

describe('hive_growth tool', () => {
  const tool = QUEEN_GROWTH_TOOLS.find(t => t.name === SPEC.TOOL)!

  it('refuses before reading when nobody is identified', async () => {
    let read = false
    const pool = {
      query: async () => {
        read = true
        return { rows: [] }
      },
    }
    await expect(
      tool.handler({}, { pool, telegramId: '' } as never)
    ).rejects.toThrow()
    expect(read).toBe(false)
  })

  it('reads only the caller, from the live wallet, and picks the action', async () => {
    const params: unknown[][] = []
    const pool = {
      query: async (s: string, p: unknown[] = []) => {
        params.push(p)
        if (/FROM crm_people/.test(s))
          return { rows: [{ id: 'c1' }, { id: 'c2' }] }
        if (/FROM token_invoices WHERE owner_id/.test(s)) return { rows: [] }
        if (/count\(\*\)::int AS n FROM token_invoices/.test(s))
          return { rows: [{ n: 0 }] }
        if (/count\(DISTINCT telegram_id\)/.test(s)) return { rows: [{ n: 0 }] }
        if (/GROUP BY telegram_id/.test(s))
          return { rows: [{ telegram_id: 'c1', stars: 500, stars_30d: 0 }] }
        return { rows: [] }
      },
    }
    const g = await growthFor(pool, 'owner-a', async id =>
      id === 'owner-a' ? ['bot_a'] : []
    )
    expect(g.code).toBe(SPEC.ACT_WIN_BACK)
    expect(g.measured.paying_clients).toBe(1)
    expect(g.measured.audience).toBe(2)
    // Every owner-keyed query is keyed by the caller.
    for (const p of params)
      if (typeof p[0] === 'string') expect(p[0]).toBe('owner-a')
  })

  it('a failing ledger answers unknown, not a first offer', async () => {
    const pool = {
      query: async (s: string) => {
        if (/token_ledger/.test(s)) throw new Error('down')
        if (/FROM crm_people/.test(s)) return { rows: [{ id: 'c1' }] }
        return { rows: [] }
      },
    }
    const g = await growthFor(pool, 'owner-a', async () => ['bot_a'])
    expect(g.code).toBe(SPEC.ACT_UNKNOWN)
  })
})
