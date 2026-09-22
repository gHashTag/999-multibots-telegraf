/**
 * ONE WHEEL: while the person drives, the agent watches and does not act.
 */
import { describe, it, expect } from 'vitest'
import { personHasTheWheel, WHEEL_LEASE_MS } from './src/browser/sessions'
import {
  BROWSER_TOOLS,
  ACTING_TOOLS,
  WHEEL_TAKEN,
} from './src/browser/agent-tools'
import { handleBrowser } from './src/browser/routes'
import { fixedDriver } from './src/browser/pod-driver'

const ID = '900000001'
const NOW = Date.now()

function world(wheelMs: number | null) {
  const writes: Array<{ sql: string; params: unknown[] }> = []
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      if (/^\s*SELECT telegram_id, session_id/i.test(sql)) {
        return {
          rows: [
            {
              telegram_id: ID,
              session_id: 's1',
              state: 'live',
              endpoint: null,
              cdp_endpoint: null,
              view_token: 'v',
              admin_token: 'a',
              wheel_ms: wheelMs,
            },
          ],
        }
      }
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) writes.push({ sql, params })
      return { rows: [] }
    },
  }
  return { pool, writes, ctx: { telegramId: ID, pool } as never }
}
const tool = (name: string) => BROWSER_TOOLS.find(t => t.name === name)!

describe('personHasTheWheel', () => {
  it('a lease in the future, not one in the past, not none', () => {
    expect(personHasTheWheel({ personWheelUntilMs: NOW + 1000 }, NOW)).toBe(
      true
    )
    expect(personHasTheWheel({ personWheelUntilMs: NOW - 1 }, NOW)).toBe(false)
    expect(personHasTheWheel({ personWheelUntilMs: null }, NOW)).toBe(false)
    expect(personHasTheWheel(null, NOW)).toBe(false)
    expect(WHEEL_LEASE_MS).toBe(600_000)
  })
})

describe('while the person drives', () => {
  it('every acting tool stands still, with the reason in words', async () => {
    const w = world(NOW + 60_000)
    for (const name of ACTING_TOOLS) {
      await expect(
        tool(name).handler(
          { url: 'https://t27.ai/', x: 1, y: 1, text: 'x', code: '1' },
          w.ctx
        )
      ).rejects.toThrow(WHEEL_TAKEN)
    }
    expect([...ACTING_TOOLS].sort()).toEqual([
      'browser_click',
      'browser_close_tab',
      'browser_evaluate',
      'browser_open',
      'browser_type',
    ])
  })

  it('the agent may still look and ask', async () => {
    const w = world(NOW + 60_000)
    const out = (await tool('browser_status').handler({}, w.ctx)) as {
      running: boolean
    }
    expect(out).toHaveProperty('running')
    await expect(tool('browser_read').handler({}, w.ctx)).rejects.not.toThrow(
      WHEEL_TAKEN
    )
  })

  it('the refusal is written in the journal as a failed step', async () => {
    const w = world(NOW + 60_000)
    await tool('browser_click')
      .handler({ x: 3, y: 4 }, w.ctx)
      .catch(() => {})
    for (
      let i = 0;
      i < 200 && !w.writes.some(x => /INSERT INTO browser_journal/.test(x.sql));
      i++
    )
      await new Promise(r => setTimeout(r, 5))
    const row = w.writes.find(x => /INSERT INTO browser_journal/.test(x.sql))!
    expect(row.params[1]).toBe('browser_click')
    expect(row.params[2]).toBe(false)
    expect(String(row.params[4])).toContain('taken the wheel')
  })

  it('once the lease ran out, the agent acts again', async () => {
    const w = world(NOW - 1)
    await expect(
      tool('browser_click').handler({ x: 1, y: 1 }, w.ctx)
    ).rejects.toThrow(/no browser is running/)
  })
})

describe('POST /api/browser/wheel', () => {
  const deps = (w: ReturnType<typeof world>, actor: 'person' | 'agent') => ({
    getPool: async () => w.pool,
    identity: () => ID,
    driver: fixedDriver({ endpoint: 'pod:8080' }),
    newToken: () => 'tok',
    actor: () => actor,
    env: { BROWSER_POD_OWNER: ID },
  })
  const post = (url: string, d: unknown) =>
    handleBrowser({ url, method: 'POST' }, d as never)

  it('the person takes it for the lease and hands it back', async () => {
    const w = world(null)
    expect(
      (await post('/api/browser/wheel?holder=person', deps(w, 'person'))).status
    ).toBe(200)
    expect(w.writes.at(-1)?.sql).toMatch(
      /person_wheel_until = now\(\) \+ interval '600 seconds'/
    )
    expect(
      (await post('/api/browser/wheel?holder=agent', deps(w, 'person'))).status
    ).toBe(200)
    expect(w.writes.at(-1)?.sql).toMatch(/person_wheel_until = NULL/)
  })

  it('an agent key may neither take the wheel nor give it to itself', async () => {
    const w = world(NOW + 60_000)
    expect(
      (await post('/api/browser/wheel?holder=agent', deps(w, 'agent'))).status
    ).toBe(403)
    expect(w.writes.filter(x => /person_wheel_until/.test(x.sql))).toEqual([])
  })

  it('names only person or agent, and only by POST', async () => {
    const w = world(null)
    expect(
      (await post('/api/browser/wheel?holder=robot', deps(w, 'person'))).status
    ).toBe(400)
    expect(
      (
        await handleBrowser(
          { url: '/api/browser/wheel?holder=person', method: 'GET' },
          deps(w, 'person') as never
        )
      ).status
    ).toBe(405)
  })
})

describe('GET /api/browser/session says who drives', () => {
  const deps = (w: ReturnType<typeof world>) => ({
    getPool: async () => w.pool,
    identity: () => ID,
    driver: fixedDriver({ endpoint: 'pod:8080' }),
    newToken: () => 'tok',
    actor: () => 'person' as const,
    env: { BROWSER_POD_OWNER: ID },
  })
  const read = (w: ReturnType<typeof world>) =>
    handleBrowser(
      { url: '/api/browser/session', method: 'GET' },
      deps(w) as never
    )

  it('the person, while the lease runs; the agent otherwise', async () => {
    expect(
      ((await read(world(NOW + 60_000))).body as { wheel: string }).wheel
    ).toBe('person')
    expect(((await read(world(NOW - 1))).body as { wheel: string }).wheel).toBe(
      'agent'
    )
    expect(((await read(world(null))).body as { wheel: string }).wheel).toBe(
      'agent'
    )
  })
})
