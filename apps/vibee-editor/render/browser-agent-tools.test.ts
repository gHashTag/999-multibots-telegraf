import { describe, it, expect } from 'vitest'
import { BROWSER_TOOLS } from './src/browser/agent-tools'
import { TOOLS_BY_NAME } from './src/agent/tools'

/**
 * THE TOOLS AN AGENT SEES.
 *
 * The owner's question was "why does the agent not know there is a browser?".
 * The answer was that nothing offered it one. These pin the offer: that the
 * tools reach every agent through the registry it already reads, that they
 * refuse usefully when there is no browser, and that they never hand an agent
 * something it must not have.
 */

const tool = (name: string) => {
  const t = BROWSER_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`no such tool: ${name}`)
  return t
}

const ctxWith = (rows: Array<Record<string, unknown>>) => ({
  telegramId: 'tg-900000001',
  pool: {
    async query(sql: string, params: unknown[] = []) {
      if (!sql.trim().toUpperCase().startsWith('SELECT')) return { rows: [] }
      return { rows: rows.filter(r => r.telegram_id === String(params[0])) }
    },
  },
})

describe('every agent already connected can see them', () => {
  it('lives in the one registry, not in a second server nobody knows about', () => {
    for (const t of BROWSER_TOOLS) {
      expect(TOOLS_BY_NAME.has(t.name)).toBe(true)
    }
  })

  it('names itself so an agent can guess what it is for', () => {
    for (const t of BROWSER_TOOLS) {
      expect(t.name.startsWith('browser_')).toBe(true)
      expect(t.description.length).toBeGreaterThan(40)
      expect(t.parameters).toBeTruthy()
    }
  })

  it('tells the agent never to type a password', () => {
    /* The one rule the whole architecture rests on, said where it is read. */
    expect(tool('browser_type').description).toContain('пароли')
  })
})

describe('when there is no browser', () => {
  it('says so calmly instead of failing', async () => {
    const out = (await tool('browser_status').handler(
      {},
      ctxWith([]) as never
    )) as {
      running: boolean
    }
    expect(out.running).toBe(false)
  })

  it('REFUSES the acting tools, and says where a browser comes from', async () => {
    for (const name of ['browser_read', 'browser_click', 'browser_type']) {
      await expect(
        tool(name).handler({ x: 1, y: 1, text: 'x' }, ctxWith([]) as never)
      ).rejects.toThrow(/no browser is running/)
    }
  })

  /*
   * A DEAD ROW IS NOT A DEAD BROWSER, and browser_status used to say it was.
   *
   * Measured 2026-09-27 on myself: the tool answered `running: false`, I read
   * it as a wedged Chromium and restarted the pod -- while the watch had the
   * browser "answering for 16m" and eleven live pages were on it. The reaper
   * had deleted the visit row, which is its job; the browser cannot be stopped
   * on this platform, which is the platform's. So the tool now asks the
   * person's own pod, and says plainly that nobody is watching the screen.
   */
  it('does not call a live browser dead just because the visit row is gone', async () => {
    const before = process.env.BROWSER_POD_CDP
    process.env.BROWSER_POD_CDP = 'pod.invalid.test:9223'
    try {
      const { resetPodTenantsCache } = await import('./src/browser/pod-tenant')
      resetPodTenantsCache()
      const ctx = {
        telegramId: 'tg-900000001',
        pool: {
          async query(sql: string) {
            /* No session row; the pod is on record as this person's. */
            if (/browser_pod_tenants/.test(sql) && /SELECT/i.test(sql))
              return { rows: [{ telegram_id: 'tg-900000001' }] }
            return { rows: [] }
          },
        },
      }
      const out = (await tool('browser_status').handler({}, ctx as never)) as {
        running: boolean
        watchedByThePerson: boolean
        note?: string
      }
      expect(out.running).toBe(true)
      /* And it does not pretend the person is at the screen. */
      expect(out.watchedByThePerson).toBe(false)
      expect(out.note).toMatch(/visit record is gone/)
    } finally {
      if (before === undefined) delete process.env.BROWSER_POD_CDP
      else process.env.BROWSER_POD_CDP = before
      const { resetPodTenantsCache } = await import('./src/browser/pod-tenant')
      resetPodTenantsCache()
    }
  })

  it('refuses a session that exists but is not live', async () => {
    const row = {
      telegram_id: 'tg-900000001',
      session_id: 's1',
      pod_id: 'p1',
      endpoint: '127.0.0.1:1',
      cdp_endpoint: '127.0.0.1:2',
      state: 'starting',
      view_token: 'v',
      admin_token: 'a',
    }
    await expect(
      tool('browser_read').handler({}, ctxWith([row]) as never)
    ).rejects.toThrow(/no browser is running/)
  })
})

describe('what an agent is never handed', () => {
  it('status carries no endpoint and no token', async () => {
    const out = await tool('browser_status').handler({}, ctxWith([]) as never)
    const text = JSON.stringify(out)
    expect(text).not.toContain('127.0.0.1')
    expect(text).not.toContain('token')
  })

  it('has no argument for whose browser to drive', () => {
    /*
     * An agent cannot name somebody else's browser because it is never
     * asked: the session is looked up by the caller's own verified id.
     */
    for (const t of BROWSER_TOOLS) {
      const props = Object.keys(
        (t.parameters as { properties?: Record<string, unknown> }).properties ||
          {}
      )
      expect(props).not.toContain('telegramId')
      expect(props).not.toContain('telegram_id')
      expect(props).not.toContain('user')
    }
  })
})

describe('the address CDP hands back is not the address we can reach', () => {
  it('rewrites the socket to the bridge we actually came through', async () => {
    const { rewriteWsUrl } = await import('./src/browser/cdp')
    /*
     * Chromium says ws://127.0.0.1:9222 -- its own loopback INSIDE the pod.
     * We arrived on the socat bridge, on another port. Connecting to what it
     * says reaches nothing and hangs until timeout; that is what
     * browser_evaluate did before this.
     */
    expect(
      rewriteWsUrl('ws://127.0.0.1:9222/devtools/page/AB12', '127.0.0.1:55003')
    ).toBe('ws://127.0.0.1:55003/devtools/page/AB12')
  })

  it('keeps the path, which names the page', async () => {
    const { rewriteWsUrl } = await import('./src/browser/cdp')
    const out = rewriteWsUrl(
      'ws://localhost:9222/devtools/page/XYZ',
      'pod:9223'
    )
    expect(out.endsWith('/devtools/page/XYZ')).toBe(true)
    expect(out).toContain('pod:9223')
  })

  it('does not care what scheme or how the endpoint was written', async () => {
    const { rewriteWsUrl } = await import('./src/browser/cdp')
    expect(rewriteWsUrl('wss://a:1/p', 'http://b:2/')).toBe('wss://b:2/p')
  })
})
