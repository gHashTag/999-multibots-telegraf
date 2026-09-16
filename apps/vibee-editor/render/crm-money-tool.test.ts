import { describe, it, expect } from 'vitest'
import { CRM_MONEY_TOOLS } from './src/agent/crm-money-tool'

/**
 * THE MONEY FUNNEL, WHICH NOBODY COULD SEE.
 *
 * The daily summary counts touches and sends and says nothing about
 * invoices -- and invoices are where a sale happens or dies. Found by
 * needing it: measuring whether the seller converts meant reading
 * `token_invoices`, and that database is on a private network, unreachable
 * from outside on purpose. A number nobody can ask for is a number nobody
 * looks at.
 */
const tool = () => CRM_MONEY_TOOLS.find(t => t.name === 'crm_money')!

function fakePool(rows: Record<string, unknown>[][] = []) {
  const sql: Array<{ q: string; p: unknown[] }> = []
  let i = 0
  return {
    sql,
    query: async (q: string, p: unknown[] = []) => {
      sql.push({ q: q.replace(/\s+/g, ' ').trim(), p })
      if (/ALTER TABLE|CREATE TABLE/i.test(q)) return { rows: [] }
      return { rows: rows[i++] ?? [] }
    },
  }
}

const owner = (pool: unknown) =>
  ({ telegramId: '144022504', surface: 'bot', pool }) as never

describe('crm_money', () => {
  it('refuses anybody who is not the owner', async () => {
    // The funnel is the owner's business, and this tool reads every invoice
    // the service holds.
    await expect(
      tool().handler({}, { telegramId: '900000042', pool: fakePool() } as never)
    ).rejects.toThrow()
  })

  it('counts minted, paid, dead and waiting over the window', async () => {
    const pool = fakePool([
      [
        {
          minted: 12,
          paid: 3,
          died: 7,
          waiting: 2,
          stars_paid: 195,
          tokens_issued: 150,
        },
      ],
      [
        { reason: 'replaced', how_many: 5 },
        { reason: 'expired', how_many: 2 },
      ],
    ])
    const r = (await tool().handler({ days: 7 }, owner(pool))) as Record<
      string,
      unknown
    >
    expect(r.window_days).toBe(7)
    expect(r.minted).toBe(12)
    expect(r.paid).toBe(3)
    expect(r.why_died).toEqual([
      { reason: 'replaced', how_many: 5 },
      { reason: 'expired', how_many: 2 },
    ])
    // The window really travels into the query, not just into the answer.
    const counted = pool.sql.find(x => x.q.includes('FROM token_invoices'))!
    expect(counted.p).toContain('7')
  })

  it('the window is clamped, and defaults when nobody names one', async () => {
    const a = fakePool([[{ minted: 0 }], []])
    await tool().handler({ days: 5000 }, owner(a))
    expect(a.sql.find(x => x.q.includes('FROM token_invoices'))!.p).toContain(
      '365'
    )
    const b = fakePool([[{ minted: 0 }], []])
    await tool().handler({}, owner(b))
    expect(b.sql.find(x => x.q.includes('FROM token_invoices'))!.p).toContain(
      '30'
    )
  })

  it('says whose invoices these are, instead of implying the owner scope', async () => {
    /*
     * The table has no owner column: every row names the PERSON it was
     * written for and nothing records who sold it. With one owner minting
     * that is his funnel; with two it would be two funnels added together.
     * Saying so is the honest half -- a filter that does not filter would be
     * believed.
     */
    const r = (await tool().handler(
      {},
      owner(fakePool([[{ minted: 1 }], []]))
    )) as Record<string, string>
    expect(String(r.whose_invoices)).toContain('нет колонки владельца')
  })

  it('a database that refuses does not throw at the model', async () => {
    const broken = {
      query: async () => {
        throw new Error('no database')
      },
    }
    const r = (await tool().handler({}, owner(broken))) as Record<
      string,
      unknown
    >
    expect(r.ok).toBe(false)
  })
})
