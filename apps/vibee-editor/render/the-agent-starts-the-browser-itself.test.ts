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
const pool = {
  query: async (sql: string) => {
    const s = sql.trim().toUpperCase()
    if (s.startsWith('SELECT') && s.includes('BROWSER_SESSIONS'))
      return { rows: live ? [row()] : [] }
    return { rows: [] }
  },
}
const open = BROWSER_TOOLS.find(t => t.name === 'browser_open')!

beforeEach(() => {
  started.length = 0
  live = false
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
