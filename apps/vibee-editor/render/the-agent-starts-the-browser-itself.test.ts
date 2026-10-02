/**
 * Found by tri a2a, 2026-09-22: the browser was off, and browser_open -- the
 * first call of any task -- failed in 6 ms instead of starting it. The tool
 * itself is exercised here, not only the start function.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const started: string[] = []
let live = false
vi.mock('./src/browser/routes', () => ({
  startBrowserAsAgent: async (who: string) => {
    started.push(who)
    live = true
    return true
  },
}))
vi.mock('./src/browser/cdp', async orig => ({
  ...((await orig()) as object),
  newPage: async (_cdp: string, url: string) => ({ id: 'p1', url }),
}))

import { BROWSER_TOOLS } from './src/browser/agent-tools'
import { resetBrowserSessionsCache } from './src/browser/sessions'

const row = () => ({
  telegram_id: '9000000061',
  session_id: 's',
  pod_id: 'p',
  endpoint: '127.0.0.1:1',
  cdp_endpoint: '127.0.0.1:9222',
  state: 'live',
  view_token: 'v',
  admin_token: 'a',
})
/* The pod's tenant: set when a test has a pod running with no visit row. */
let tenant: string | null = null
const pool = {
  query: async (sql: string) => {
    const s = sql.trim().toUpperCase()
    if (s.startsWith('SELECT') && s.includes('BROWSER_SESSIONS'))
      return { rows: live ? [row()] : [] }
    if (s.startsWith('SELECT') && s.includes('BROWSER_POD_TENANTS'))
      return { rows: tenant ? [{ telegram_id: tenant }] : [] }
    return { rows: [] }
  },
}
const open = BROWSER_TOOLS.find(t => t.name === 'browser_open')!

beforeEach(() => {
  started.length = 0
  live = false
  tenant = null
  resetBrowserSessionsCache()
})

describe('browser_open with the browser off', () => {
  it('starts it, then opens the page', async () => {
    const out = await open.handler({ url: 'https://www.linkedin.com/login' }, {
      telegramId: '9000000061',
      pool,
    } as never)
    expect(started).toEqual(['9000000061'])
    expect(out).toMatchObject({ opened: 'https://www.linkedin.com/login' })
  })

  it('a probe never starts one', async () => {
    await expect(
      open.handler({ url: 'https://example.com/' }, {
        telegramId: '9000000061',
        pool,
        probe: true,
      } as never)
    ).rejects.toThrow('no browser is running')
    expect(started).toEqual([])
  })

  /*
   * 2026-10-03: the reaper had deleted the visit row, the pod ran on with
   * nine tabs, and a probe was told "no browser is running" -- false, and
   * the wrong remedy (the person was asked to open one).
   */
  it('a probe on a running pod with no visit row is told the truth', async () => {
    const saved = process.env.BROWSER_POD_CDP
    process.env.BROWSER_POD_CDP = 'pod:9222'
    tenant = '9000000061'
    try {
      await expect(
        open.handler({ url: 'https://example.com/' }, {
          telegramId: '9000000061',
          pool,
          probe: true,
        } as never)
      ).rejects.toThrow('the browser is running, but no visit is on record')
      expect(started).toEqual([])
    } finally {
      if (saved === undefined) delete process.env.BROWSER_POD_CDP
      else process.env.BROWSER_POD_CDP = saved
    }
  })

  it('a forbidden address is refused before anything is started', async () => {
    await expect(
      open.handler({ url: 'chrome://settings' }, {
        telegramId: '9000000061',
        pool,
      } as never)
    ).rejects.toThrow('only http')
    expect(started).toEqual([])
  })
})
