import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A ROUND WHOSE EVERY SITE IS BLOCKED DOES NOT RUN.
 *
 * #3491 made it return early; the bee's mutation that removed the return
 * survived. Here the real runRoundNow gets a list that blocks every site
 * it would walk: no browser is started, no message reaches the person.
 */
const sent = vi.fn()
const started = vi.fn()
vi.mock('./src/auth/telegram-sender', () => ({
  sendToTelegram: (...a: unknown[]) => sent(...a),
}))
vi.mock('./src/browser/routes', () => ({
  startBrowserAsAgent: (...a: unknown[]) => started(...a),
  restartBrowserAsAgent: (...a: unknown[]) => started(...a),
}))

const { runRoundNow } = await import('./src/agent/rounds-wiring')
const { ROUND_SITES } = await import('./src/agent/rounds')
const { allSites } = await import('./src/agent/profiles')
const { resetSiteRulesCache } = await import('./src/browser/site-rules')

function poolBlocking(hosts: string[]) {
  return {
    async query(sql: string) {
      if (sql.includes('FROM browser_site_rules'))
        return {
          rows: hosts.map(site => ({
            site,
            rule: 'block',
            by_whom: 'person',
            at: '2026-10-03T00:00:00Z',
          })),
        }
      return { rows: [] }
    },
  }
}

const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, '')

beforeEach(() => {
  sent.mockReset()
  started.mockReset()
  resetSiteRulesCache()
})

describe('a fully blocked round', () => {
  it('returns before the browser and says why', async () => {
    const every = [...ROUND_SITES, ...allSites()].map(s => hostOf(s.url))
    const out = await runRoundNow(poolBlocking([...new Set(every)]), '144')
    expect(out).toBe('every site of the round is blocked')
    expect(started).not.toHaveBeenCalled()
    expect(sent).not.toHaveBeenCalled()
  })

  it('an unreadable list walks nothing either', async () => {
    const pool = {
      async query() {
        throw new Error('db down')
      },
    }
    const out = await runRoundNow(pool, '144')
    expect(out).toBe('site list unreadable')
    expect(started).not.toHaveBeenCalled()
  })
})
