import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * One mirror, at once: Postgres by message id, then Zep with only what was
 * new. A Zep that is down is a warning, never a failure.
 */
const OWNER = '144022504'
const LEAD = '435572800'
const D = (iso: string) => new Date(iso)

function fakePool(seen = new Set<string>()) {
  const queries: Array<{ sql: string; params: unknown[] }> = []
  return {
    queries,
    query: async (sql: string, params: unknown[] = []) => {
      const flat = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: flat, params })
      if (flat.startsWith('INSERT INTO crm_messages')) {
        const rows: Array<{ msg_id: unknown }> = []
        for (let i = 0; i < params.length; i += 6) {
          const key = `${params[i + 1]}:${params[i + 2]}`
          if (seen.has(key)) continue
          seen.add(key)
          rows.push({ msg_id: params[i + 2] })
        }
        return { rows }
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
    const r = await mirrorNow(pool, OWNER, LEAD, msgs, 'Geya')
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
    const first = await mirrorNow(fakePool(seen), OWNER, LEAD, msgs, 'Geya')
    expect(first.fresh).toBe(2)
    expect(first.zep).toBe(2)
    expect(posted.some(p => /messages/.test(p))).toBe(true)
    posted.length = 0
    const again = await mirrorNow(fakePool(seen), OWNER, LEAD, msgs, 'Geya')
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
