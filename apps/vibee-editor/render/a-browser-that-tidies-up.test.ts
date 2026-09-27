/**
 * THE TWO THINGS THAT PILED UP UNTIL THE POD STOPPED BEING A BROWSER.
 *
 * Both were measured live on the owner's pod on 2026-09-26, and neither had a
 * test: 40 CDP targets from tabs the agent opened and never closed, and 35
 * neko admin sessions, all ours, none connected -- one per screenshot, resize
 * and mouse handover since 2026-09-23.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { overBudget, TAB_BUDGET } from './src/browser/tab-budget'
import { TAB_CAP } from './src/browser/tab-sweep'
import { nekoLogout, withNekoAdmin } from './src/browser/screen'
import { forgetOpenedTabs, openAndChoose } from './src/browser/agent-tools'

describe('the tab budget', () => {
  it('leaves an agent alone while it is under budget', () => {
    const ours = ['a', 'b', 'c']
    const prune = overBudget(ours, new Set(ours))
    expect(prune.close).toEqual([])
    expect(prune.keep).toEqual(ours)
  })

  it('closes the oldest of ours, keeping the newest budget', () => {
    const ours = ['1', '2', '3', '4', '5', '6', '7', '8']
    const prune = overBudget(ours, new Set(ours), 6)
    expect(prune.close).toEqual(['1', '2'])
    expect(prune.keep).toEqual(['3', '4', '5', '6', '7', '8'])
  })

  it('forgets a tab the person closed instead of closing it again', () => {
    const prune = overBudget(['a', 'b', 'c'], new Set(['b', 'c']), 1)
    expect(prune.close).toEqual(['b'])
    expect(prune.keep).toEqual(['c'])
    expect(prune.close).not.toContain('a')
  })

  it('never proposes a tab nobody here opened', () => {
    /* The person's own tabs are alive and are not in our list. */
    const prune = overBudget(['ours'], new Set(['ours', 'theirs', 'other']), 0)
    expect(prune.close).toEqual(['ours'])
  })

  it('is six: a sign-in, its mail tab, and some room to read', () => {
    expect(TAB_BUDGET).toBe(6)
  })
})

describe('openAndChoose', () => {
  afterEach(() => forgetOpenedTabs())

  it('closes what it opened once the budget is passed', async () => {
    const closed: string[] = []
    let n = 0
    const alive = new Set<string>()
    const io = {
      list: async () => [...alive].map(id => ({ id })),
      close: async (_cdp: string, id: string) => {
        closed.push(id)
        alive.delete(id)
      },
    }
    const open = async () => {
      const id = `t${++n}`
      alive.add(id)
      return { id }
    }
    for (let i = 0; i < TAB_BUDGET + 2; i++) {
      await openAndChoose('144022504', 'pod:9223', 'https://x.com', open, io)
    }
    expect(closed).toEqual(['t1', 't2'])
    expect(alive.size).toBe(TAB_BUDGET)
  })

  it('MAKES ROOM BEFORE IT OPENS, not on the next clock tick', async () => {
    /*
     * Measured by doing it on the live pod, 2026-09-27: 14 pages open, one
     * more browser_open, and Chromium stopped being a browser seconds later.
     * The periodic sweep was deployed and green; it was simply not due. So the
     * order below is the whole point -- a close, and only then the open.
     */
    const order: string[] = []
    const alive = new Map<string, string>(
      Array.from({ length: TAB_CAP }, (_, i) => [
        `t${i}`,
        `https://site${i}.example/`,
      ])
    )
    const io = {
      list: async () => [...alive].map(([id, url]) => ({ id, url })),
      close: async (_cdp: string, id: string) => {
        order.push(`close ${id}`)
        alive.delete(id)
      },
    }
    const page = await openAndChoose(
      '144022504',
      'pod:9223',
      'https://www.reddit.com/',
      async () => {
        order.push('open')
        alive.set('fresh', 'https://www.reddit.com/')
        return { id: 'fresh' }
      },
      io
    )
    expect(page.id).toBe('fresh')
    expect(order[0]).toBe(`close t${TAB_CAP - 1}`)
    expect(order[1]).toBe('open')
    /* And the pod is left at the cap, not one over it. */
    expect(alive.size).toBe(TAB_CAP)
  })

  it('still returns the tab when the pod cannot be listed', async () => {
    const io = {
      list: async () => {
        throw new Error('pod unreachable')
      },
      close: async () => {
        throw new Error('should not be called')
      },
    }
    const page = await openAndChoose(
      '144022504',
      'pod:9223',
      'https://x.com',
      async () => ({ id: 'only' }),
      io
    )
    expect(page.id).toBe('only')
  })
})

interface Call {
  url: string
  method?: string
}

const nekoIo = (calls: Call[], token = 'bearer-1') => {
  return async (url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token }),
    }
  }
}

describe('withNekoAdmin', () => {
  it('logs in, does the one thing, and logs out', async () => {
    const calls: Call[] = []
    const seen: string[] = []
    const out = await withNekoAdmin(
      'pod:8080',
      'admin-secret',
      nekoIo(calls),
      async bearer => {
        seen.push(bearer)
        return 'done'
      }
    )
    expect(out).toBe('done')
    expect(seen).toEqual(['bearer-1'])
    expect(calls.map(c => c.url)).toEqual([
      'http://pod:8080/api/login',
      'http://pod:8080/api/logout',
    ])
  })

  it('gives the session back even when the errand throws', async () => {
    const calls: Call[] = []
    await expect(
      withNekoAdmin('pod:8080', 'admin-secret', nekoIo(calls), async () => {
        throw new Error('the pod refused the screen shot (500)')
      })
    ).rejects.toThrow('refused the screen shot')
    expect(calls.map(c => c.url)).toContain('http://pod:8080/api/logout')
  })

  it('does not fail the errand when the logout itself fails', async () => {
    const io = async (url: string) => {
      if (url.endsWith('/api/logout')) throw new Error('connection reset')
      return { ok: true, status: 200, text: async () => '{"token":"b"}' }
    }
    await expect(
      withNekoAdmin('pod:8080', 'admin-secret', io, async () => 'picture')
    ).resolves.toBe('picture')
  })

  it('carries the bearer, so the session it closes is its own', async () => {
    const headers: Record<string, string>[] = []
    const io = async (
      _url: string,
      init?: { headers?: Record<string, string> }
    ) => {
      if (init?.headers) headers.push(init.headers)
      return { ok: true, status: 200, text: async () => '' }
    }
    await nekoLogout('pod:8080', 'bearer-9', io)
    expect(headers[0].authorization).toBe('Bearer bearer-9')
  })
})
