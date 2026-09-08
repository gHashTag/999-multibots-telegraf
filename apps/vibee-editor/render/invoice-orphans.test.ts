import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  markOrphaned,
  wireInvoiceOrphans,
  unwireInvoiceOrphans,
} from './src/agent/invoice-orphans'
import { remember, claim, forgetProposals } from './src/agent/tg-proposals'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The note that takes a cancelled draft's invoice out of "pending".
 *
 * The row is money-adjacent: it is what the reconcile shows the owner as
 * "unpaid". So the write is narrow (only an unredeemed, unmarked row), the
 * schema step is idempotent, and no failure here may reach the button press
 * that caused it.
 */
function fakePool(opts: { failOn?: string } = {}) {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: flat, params })
      if (opts.failOn && flat.startsWith(opts.failOn))
        throw new Error('disk full')
      return { rows: [] }
    },
  }
}
const OWNER = '144022504'
const draft = (p: { id: string; invoiceId?: number }) => ({
  ...p,
  telegramId: OWNER,
  action: 'send' as const,
  target: '1',
  createdAt: 0,
})
const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  unwireInvoiceOrphans()
  forgetProposals()
})
afterEach(() => unwireInvoiceOrphans())

describe('a cancelled draft marks its invoice', () => {
  it('stamps when and why, only on a row nobody has paid', async () => {
    const pool = fakePool()
    expect(
      await markOrphaned(
        () => pool,
        draft({ id: 'a', invoiceId: 42 }),
        'cancelled'
      )
    ).toBe(true)
    const upd = pool.queries.find(q =>
      q.sql.startsWith('UPDATE token_invoices')
    )
    expect(upd, 'no UPDATE went out').toBeTruthy()
    expect(upd!.params).toEqual([42, 'cancelled'])
    expect(upd!.sql).toContain('redeemed = FALSE')
    expect(upd!.sql).toContain('cancelled_at IS NULL')
    expect(upd!.sql).toContain('cancelled_at = now()')
  })

  it('adds the columns once per process, not once per cancel', async () => {
    const pool = fakePool()
    await markOrphaned(
      () => pool,
      draft({ id: 'a', invoiceId: 1 }),
      'cancelled'
    )
    await markOrphaned(() => pool, draft({ id: 'b', invoiceId: 2 }), 'replaced')
    expect(
      pool.queries.filter(q => q.sql.startsWith('ALTER TABLE token_invoices'))
        .length
    ).toBe(1)
    expect(pool.queries.filter(q => q.sql.startsWith('UPDATE')).length).toBe(2)
  })

  it('a draft without an invoice touches nothing', async () => {
    const pool = fakePool()
    expect(
      await markOrphaned(() => pool, draft({ id: 'a' }), 'cancelled')
    ).toBe(false)
    expect(pool.queries).toEqual([])
  })

  it('a database failure is logged with the row and the reason, and does not throw', async () => {
    const warned: string[] = []
    const spy = vi
      .spyOn(console, 'warn')
      .mockImplementation((...a: unknown[]) => {
        warned.push(a.map(String).join(' '))
      })
    try {
      const pool = fakePool({ failOn: 'UPDATE' })
      expect(
        await markOrphaned(
          () => pool,
          draft({ id: 'a', invoiceId: 77 }),
          'expired'
        )
      ).toBe(false)
      const all = warned.join('\n')
      expect(all).toContain('orphaned invoice not marked')
      expect(all).toContain('77')
      expect(all).toContain('expired')
    } finally {
      spy.mockRestore()
    }
  })

  it('a server without a database does not throw either', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(
        await markOrphaned(
          () => {
            throw new Error('DATABASE_URL is not set')
          },
          draft({ id: 'a', invoiceId: 1 }),
          'cancelled'
        )
      ).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('a failed ALTER is retried next time, not remembered as done', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const bad = fakePool({ failOn: 'ALTER' })
      await markOrphaned(
        () => bad,
        draft({ id: 'a', invoiceId: 1 }),
        'cancelled'
      )
      const good = fakePool()
      await markOrphaned(
        () => good,
        draft({ id: 'b', invoiceId: 2 }),
        'cancelled'
      )
      expect(good.queries.filter(q => q.sql.startsWith('ALTER')).length).toBe(1)
      expect(good.queries.some(q => q.sql.startsWith('UPDATE'))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('wired into the queue', () => {
  const file = (id: string, invoiceId: number) =>
    remember({ id, telegramId: OWNER, action: 'send', target: '1', invoiceId })

  it('a cancel press reaches the database through the queue', async () => {
    const pool = fakePool()
    wireInvoiceOrphans(() => pool)
    const d = file('w1', 9)
    expect(claim(OWNER, 'w1', d.secret, 'cancel').ok).toBe(true)
    await tick()
    const upd = pool.queries.find(q => q.sql.startsWith('UPDATE'))
    expect(upd?.params).toEqual([9, 'cancelled'])
  })

  it('a confirm press leaves the invoice alone', async () => {
    const pool = fakePool()
    wireInvoiceOrphans(() => pool)
    const d = file('w2', 9)
    expect(claim(OWNER, 'w2', d.secret).ok).toBe(true)
    await tick()
    expect(pool.queries.filter(q => q.sql.startsWith('UPDATE'))).toEqual([])
  })

  it('the first wiring wins; a second pool is ignored', async () => {
    const first = fakePool()
    const second = fakePool()
    wireInvoiceOrphans(() => first)
    wireInvoiceOrphans(() => second)
    const d = file('w3', 3)
    claim(OWNER, 'w3', d.secret, 'cancel')
    await tick()
    expect(first.queries.some(q => q.sql.startsWith('UPDATE'))).toBe(true)
    expect(second.queries).toEqual([])
  })

  it('a slow database does not hold the press', async () => {
    // The button answers from the queue; the note lands whenever it lands.
    let release: () => void = () => {}
    const pool = {
      query: async () => {
        await new Promise<void>(r => {
          release = r
        })
        return { rows: [] }
      },
    }
    wireInvoiceOrphans(() => pool)
    const d = file('w4', 4)
    const before = Date.now()
    expect(claim(OWNER, 'w4', d.secret, 'cancel').ok).toBe(true)
    expect(Date.now() - before).toBeLessThan(100)
    release()
  })
})

describe('the server is wired (source-level: no test boots render-server)', () => {
  /*
   * Everything above proves the parts. These three lines prove the parts are
   * connected in the file that runs, which no behavioural test here reaches:
   * the cancel route must say "cancel" (a plain claim would drop the draft
   * and tell nobody), the startup must hand the queue a pool, and the
   * "unpaid invoices" listing must skip what was cancelled.
   */
  const src = () =>
    fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

  it('the cancel route claims with the cancel intent', () => {
    const s = src()
    const a = s.indexOf("route === '/api/tg/proposal/cancel'")
    expect(a).toBeGreaterThan(-1)
    const block = s.slice(a, s.indexOf('sendJson(res, taken.ok', a))
    expect(block).toContain("claim(who, asked.id, asked.secret, 'cancel')")
  })

  it('the confirm route does NOT use the cancel intent', () => {
    const s = src()
    const a = s.indexOf("route === '/api/tg/proposal/confirm'")
    const block = s.slice(a, s.indexOf('execute(taken.proposal', a))
    expect(block).not.toContain("'cancel'")
  })

  it('startup hands the queue a pool before listening', () => {
    const s = src()
    const wire = s.indexOf('wireInvoiceOrphans(')
    const listen = s.indexOf('server.listen(Number(PORT)')
    expect(wire).toBeGreaterThan(-1)
    expect(listen).toBeGreaterThan(wire)
  })

  it('the unpaid-invoices listing skips cancelled rows', () => {
    const s = src()
    const a = s.indexOf(
      'SELECT id, tokens, stars, created_at FROM token_invoices'
    )
    expect(a).toBeGreaterThan(-1)
    const stmt = s.slice(a, s.indexOf('ORDER BY', a))
    expect(stmt).toContain('cancelled_at IS NULL')
  })
})
