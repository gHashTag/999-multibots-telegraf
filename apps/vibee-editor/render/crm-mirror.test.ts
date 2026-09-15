import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * One mirror, at once: Postgres by message id, then Zep with only what was
 * new. A Zep that is down is a warning, never a failure.
 */
const OWNER = '144022504'
const LEAD = '900000001'
const D = (iso: string) => new Date(iso)

function fakePool(seen = new Set<string>()) {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  /** What has been stored, so a read-back answers what was written. */
  const stored: Array<{ at: number; out: boolean }> = []
  return {
    queries,
    stored,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: flat, params })
      if (flat.startsWith('INSERT INTO crm_messages')) {
        const rows: Array<{ msg_id: unknown }> = []
        // Columns: owner_id, lead_id, msg_id, at, "out", text.
        for (let i = 0; i < params.length; i += 6) {
          const key = `${params[i + 1]}:${params[i + 2]}`
          stored.push({
            at: new Date(params[i + 3] as never).getTime(),
            out: Boolean(params[i + 4]),
          })
          if (seen.has(key)) continue
          seen.add(key)
          rows.push({ msg_id: params[i + 2] })
        }
        return { rows }
      }
      /*
       * The reply derivation reads the correspondence back. Answering it by
       * hand would let the wiring test pass against a rule that never looked
       * at anything, so it is answered from what was actually stored.
       */
      if (/SELECT 1 FROM crm_messages/.test(flat)) {
        const after = new Date(String(params[2])).getTime()
        const before = new Date(String(params[3])).getTime()
        const hit = stored.some(m => m.out && m.at > after && m.at < before)
        return { rows: hit ? [{ '?column?': 1 }] : [] }
      }
      return { rows: [] }
    },
  }
}

const msgs = [
  { msgId: 1, at: D('2026-09-08T10:00:00Z'), out: false, text: 'привет' },
  { msgId: 2, at: D('2026-09-08T10:01:00Z'), out: true, text: 'и тебе' },
]

beforeEach(() => {
  vi.resetModules()
  delete process.env.ZEP_API_KEY
  delete process.env.ZEP_AUTH_SECRET
  delete process.env.ZEP_API_URL
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ZEP_API_KEY
  delete process.env.ZEP_API_URL
})

describe('mirrorNow', () => {
  it('without Zep it writes Postgres and reports the fresh count, touching no network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    const pool = fakePool()
    const r = await mirrorNow(pool, OWNER, LEAD, msgs, 'Pilot')
    expect(r).toEqual({ fresh: 2, zep: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
    const ins = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO crm_messages')
    )!
    expect(ins.params.slice(0, 2)).toEqual([OWNER, LEAD])
  })

  it('with Zep it mirrors ONLY what was new, and a repeat mirrors nothing', async () => {
    process.env.ZEP_API_KEY = 'zep-key-for-tests' // secret-guard-ok: invented for this test
    const posted: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        posted.push(
          `${init?.method ?? 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`
        )
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => '',
        }
      })
    )
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    const seen = new Set<string>()
    const first = await mirrorNow(fakePool(seen), OWNER, LEAD, msgs, 'Pilot')
    expect(first.fresh).toBe(2)
    expect(first.zep).toBe(2)
    expect(posted.some(p => /messages/.test(p))).toBe(true)
    posted.length = 0
    const again = await mirrorNow(fakePool(seen), OWNER, LEAD, msgs, 'Pilot')
    expect(again).toEqual({ fresh: 0, zep: 0 })
    expect(posted).toEqual([])
  })

  it('one new message among old ones: Zep receives exactly that one', async () => {
    process.env.ZEP_API_KEY = 'zep-key-for-tests' // secret-guard-ok: invented for this test
    const sentToZep: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: any) => {
        try {
          const b = init?.body ? JSON.parse(String(init.body)) : null
          if (Array.isArray(b?.messages)) sentToZep.push(b.messages.length)
        } catch {
          // not a messages call
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => '',
        }
      })
    )
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    const seen = new Set<string>()
    await mirrorNow(fakePool(seen), OWNER, LEAD, msgs)
    sentToZep.length = 0
    const third = {
      msgId: 3,
      at: D('2026-09-08T10:02:00Z'),
      out: false,
      text: 'ещё',
    }
    const r = await mirrorNow(fakePool(seen), OWNER, LEAD, [...msgs, third])
    expect(r.fresh).toBe(1)
    expect(sentToZep.reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('a Zep that is down costs nothing: Postgres is written, the call returns', async () => {
    process.env.ZEP_API_KEY = 'zep-key-for-tests' // secret-guard-ok: invented for this test
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    const r = await mirrorNow(fakePool(), OWNER, LEAD, msgs)
    expect(r).toEqual({ fresh: 2, zep: 0 })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

/**
 * THE FUNNEL ACTUALLY CALLS IT.
 *
 * noteReply had nine tests of its own and all of them passed with the call
 * removed from mirrorNow entirely -- the feature could ship disconnected and
 * nothing would go red. That is what this case exists to stop. It checks the
 * wiring, not the rule; the rule lives in crm-replies.test.ts.
 */
describe('a client answering is written down by the one funnel', () => {
  it('mirrorNow records the reply', async () => {
    const now = new Date()
    const pool = fakePool()
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    await mirrorNow(pool as never, OWNER, LEAD, [
      // Ours first, then theirs a minute later: that is what makes it a reply.
      {
        msgId: 10,
        at: new Date(now.getTime() - 60_000),
        out: true,
        text: 'предлагаю',
      },
      { msgId: 11, at: now, out: false, text: 'да, давай' },
    ])
    const touch = pool.queries.find(q =>
      q.sql.startsWith('INSERT INTO crm_touches')
    )
    expect(touch, 'mirrorNow no longer derives the reply').toBeTruthy()
    expect(touch!.params).toContain('replied')
  })

  it('and writes none when the batch is only ours', async () => {
    const pool = fakePool()
    const { mirrorNow } = await import('./src/agent/crm-mirror')
    await mirrorNow(pool as never, OWNER, LEAD, [
      { msgId: 12, at: new Date(), out: true, text: 'напоминаю' },
    ])
    expect(
      pool.queries.some(q => q.sql.startsWith('INSERT INTO crm_touches'))
    ).toBe(false)
  })
})
