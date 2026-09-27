import { describe, it, expect } from 'vitest'
import { handleBrowser, BROWSER_PATHS } from './src/browser/routes'
import { fixedDriver } from './src/browser/pod-driver'

/**
 * THE AGENT MAY MEND A BROKEN BROWSER AND MUST NOT TOUCH A WORKING ONE.
 *
 * Two facts had to meet. First: the PID-ceiling wedge is cured by a restart
 * and only by a restart (health.ts), and until now nothing an agent could
 * reach performed one -- the watch recorded, and `/api/browser/round`, the
 * only caller of the restart, refuses an agent key on purpose. In September
 * that meant the pod stayed unreadable for three days.
 *
 * Second, and the reason the door is narrow: on 2026-09-27 I restarted a
 * HEALTHY browser. `browser_status` said `running: false` -- it was reading a
 * session row the idle reaper had deleted, not the browser -- and I believed
 * it, while the watch had the pod "answering for 16m" with eleven live pages
 * on it. A restart that lands while the person is working is worse than a
 * wedge they can see.
 *
 * So the gate is not who asked but whether it is actually broken, measured
 * at the moment of the request and not read from a row that can be five
 * minutes old. These pin both halves.
 */

const ID = '900000001'

const world = (cdp: string | null) => ({
  async query(sql: string) {
    if (/^\s*SELECT telegram_id, session_id/i.test(sql)) {
      return cdp
        ? {
            rows: [
              {
                telegram_id: ID,
                session_id: 's1',
                state: 'live',
                endpoint: 'pod:8080',
                cdp_endpoint: cdp,
                view_token: 'v',
                admin_token: 'a',
              },
            ],
          }
        : { rows: [] }
    }
    return { rows: [] }
  },
})

const deps = (
  pool: { query: (sql: string) => Promise<{ rows: unknown[] }> },
  answers: boolean
) => ({
  getPool: async () => pool,
  identity: () => ID,
  driver: fixedDriver({ endpoint: 'pod:8080', cdpEndpoint: 'pod:9223' }),
  newToken: () => 't',
  actor: () => 'agent' as const,
  env: { BROWSER_POD_OWNER: ID },
  probeBrowser: async () => answers,
})

const heal = (pool: ReturnType<typeof world>, answers: boolean) =>
  handleBrowser(
    { url: '/api/browser/heal', method: 'POST' },
    deps(pool, answers) as never
  )

describe('the one repair an agent may make itself', () => {
  it('is a door that exists at all, which is the gap this closes', () => {
    expect(BROWSER_PATHS).toContain('/api/browser/heal')
  })

  it('REFUSES TO RESTART A BROWSER THAT ANSWERS, and says why', async () => {
    const out = (await heal(world('pod:9223'), true)) as {
      status: number
      body: { ok: boolean; healed: boolean; why: string }
    }
    /* Refusing is the useful answer, so it is not an error. */
    expect(out.status).toBe(200)
    expect(out.body.healed).toBe(false)
    expect(out.body.why).toMatch(/answers/)
  })

  it('answers plainly when there is no browser to heal', async () => {
    const out = (await heal(world(null), false)) as {
      status: number
      body: { ok: boolean }
    }
    expect(out.status).toBe(409)
    expect(out.body.ok).toBe(false)
  })

  it('is a POST: healing is not something a page load does', async () => {
    const out = (await handleBrowser(
      { url: '/api/browser/heal', method: 'GET' },
      deps(world('pod:9223'), false) as never
    )) as { status: number }
    expect(out.status).toBe(405)
  })
})
