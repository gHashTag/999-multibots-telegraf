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

  it('a photo draft without an invoice is journaled, not un-pended', async () => {
    const pool = fakePool()
    vi.doMock('./src/hive/journal', () => ({
      record: async (_p: unknown, e: Record<string, unknown>) => {
        pool.queries.push({
          sql: `JOURNAL ${e.kind} ${e.what}`,
          params: [e.who],
        })
        return 'recorded'
      },
    }))
    try {
      vi.resetModules()
      const { markOrphaned: mark } = await import('./src/agent/invoice-orphans')
      expect(
        await mark(
          () => pool,
          {
            ...draft({ id: 'ph' }),
            media: { kind: 'photo', url: 'u' },
          } as never,
          'replaced'
        )
      ).toBe(true)
      /*
       * ITS OWN KIND, NOT `failure` (2026-09-16).
       *
       * One draft per owner, so a later proposal replaces a waiting card and
       * a picture already paid for at the provider goes unseen. That is an
       * expected cost. While it wore `failure` it was 41 of the 41 failures
       * in the journal's window -- and the entry it buried is the one that
       * matters: a refund that did NOT go through.
       */
      expect(
        pool.queries.some(
          q =>
            q.sql.startsWith('JOURNAL draft-unsent') &&
            q.sql.includes('replaced')
        ),
        'the unsent drawing must be its own kind'
      ).toBe(true)
      expect(
        pool.queries.some(q => q.sql.startsWith('JOURNAL failure')),
        'an expected cost must not sit in the failure channel'
      ).toBe(false)
      expect(pool.queries.some(q => q.sql.startsWith('UPDATE'))).toBe(false)
    } finally {
      vi.doUnmock('./src/hive/journal')
      vi.resetModules()
    }
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

  it('a slow database does not hold the press: the note is started, not awaited', async () => {
    // The button answers from the queue. What the press must do is START
    // the note; what it must not do is wait for it. A wiring that never
    // touches the pool would also "not hold" -- so the start is asserted.
    let started = 0
    let release: () => void = () => {}
    const pool = {
      query: async () => {
        started++
        await new Promise<void>(r => {
          release = r
        })
        return { rows: [] }
      },
    }
    wireInvoiceOrphans(() => pool)
    const d = file('w4', 4)
    expect(claim(OWNER, 'w4', d.secret, 'cancel').ok).toBe(true)
    await tick()
    expect(started, 'the note was never started').toBe(1)
    release()
  })
})

describe('the server is wired (source-level: no test boots render-server)', () => {
  /*
   * Everything above proves the parts. These prove the parts are connected
   * in the file that runs, which no behavioural test here reaches. Each
   * anchor is asserted to exist first: a slice from -1 is an empty string,
   * and an empty string contains nothing -- which once made a check of
   * "does NOT contain 'cancel'" pass on a route that had disappeared.
   */
  const src = () =>
    fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')
  const at = (s: string, needle: string) => {
    const i = s.indexOf(needle)
    expect(i, `anchor missing: ${needle}`).toBeGreaterThan(-1)
    return i
  }

  it('the cancel route claims with the cancel intent', () => {
    const s = src()
    const a = at(s, "route === '/api/tg/proposal/cancel'")
    const block = s.slice(a, s.indexOf('sendJson(res, taken.ok', a))
    // Whitespace-insensitive: the call is now awaited across a deploy overlap
    // and prettier breaks its arguments over several lines.
    expect(block.replace(/\s+/g, ' ')).toContain(
      "await claimAcrossDeploy( who, asked.id, asked.secret, 'cancel' )"
    )
  })

  it('the confirm route does NOT use the cancel intent, and reports a failed send', () => {
    const s = src()
    const a = at(s, "route === '/api/tg/proposal/confirm'")
    const end = at(s, 'outcomeToBody(outcome)')
    const block = s.slice(a, end)
    expect(block).not.toContain("'cancel'")
    // A press that ended in "not sent" leaves the invoice as unasked-for as
    // a cancel does; by then the draft has left the queue, so the route
    // must say so itself.
    expect(block).toContain("reportOrphan(taken.proposal, 'failed')")
    expect(block).toContain('!outcome.done')
  })

  it('startup wires the queue to a pool BEFORE listening, and waits for it', () => {
    const s = src()
    const wire = at(s, "await import('./src/agent/invoice-orphans')")
    const listen = at(s, 'server.listen(Number(PORT)')
    expect(listen).toBeGreaterThan(wire)
    expect(s.slice(wire, listen)).toContain('wireInvoiceOrphans(')
  })

  it('the credit path (verify) looks at cancelled rows too: redemption wins', () => {
    /*
     * /api/tokens/verify is the ONLY code that matches a Stars payment to a
     * row and credits tokens. A cancelled draft's link stays payable, so the
     * query must not hide cancelled rows from it -- the first version did,
     * and a person who paid a cancelled link would have lost their Stars.
     */
    const s = src()
    const a = at(s, 'SELECT id, tokens, stars, created_at FROM token_invoices')
    const stmt = s.slice(a, at(s, 'ORDER BY created_at DESC LIMIT 10'))
    expect(stmt).not.toContain('cancelled_at')
    expect(stmt).toContain('redeemed = FALSE')
  })

  it('redeeming a row clears its cancellation, and only touches an open one', () => {
    const s = src()
    const a = at(s, 'SET redeemed = TRUE')
    const stmt = s.slice(a, a + 220)
    expect(stmt).toContain('cancelled_at = NULL')
    // `RETURNING id` was here while this UPDATE was also the CLAIM: the row
    // was closed first and the claim decided whether to credit. The credit
    // now runs first -- a throw in it used to leave the row closed for ever
    // -- so nothing reads the result any more. `redeemed = FALSE` stays: a
    // row somebody else has already settled must not be stamped twice.
    expect(stmt).toContain('redeemed = FALSE')
  })

  it('verify adds the columns through the once-per-process helper, not inline', () => {
    const s = src()
    const a = at(s, "'/api/tokens/verify'")
    const block = s.slice(
      a,
      at(s, 'SELECT id, tokens, stars, created_at FROM token_invoices')
    )
    expect(block).toContain('ensureInvoiceColumns(pool)')
    expect(block).not.toContain('ADD COLUMN IF NOT EXISTS')
  })

  it('the morning summary counts cancelled separately from waiting', () => {
    const m = fs.readFileSync(
      path.join(__dirname, 'scripts', 'morning-summary.ts'),
      'utf8'
    )
    expect(m).toContain('cancelled_at IS NOT NULL')
    expect(m).toContain('cancelled_at IS NULL')
  })
})
