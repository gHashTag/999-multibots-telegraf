/**
 * A DESK OPENS ITS TABS THROUGH THE SAME CEILING AS THE TOOLS, AND THE SWEEP
 * DOES NOT CLOSE A TAB A DESK IS WORKING IN.
 *
 * 2026-10-03, asking why the blog does not reach the networks: the pod stood
 * at 10 of 12 tabs, and blog-share, reddit, engage and scenarios opened their
 * tabs with raw `newPage`, past `roomForOne` -- the check added after a
 * fifteenth tab wedged Chromium on 2026-09-27. And the five-minute sweep
 * closes every later tab of an origin, so the X composer opened beside the
 * person's x.com tab was litter to it, mid-thread.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  DESK_HOLD_MS,
  deskMayGo,
  deskTabsHeld,
  newDeskPage,
  resetDeskHoldsForTests,
  type DeskPageIo,
} from './src/browser/desk-page'
import { planTabSweep, podsToSweep, TAB_CAP } from './src/browser/tab-sweep'
import { resetSiteRulesCache } from './src/browser/site-rules'

/* A person whose site list is empty: every open goes ahead. */
const ANYONE = {
  telegramId: '144',
  pool: { query: async () => ({ rows: [] }) },
}

type Tab = { id: string; url: string; type: string }
const tab = (id: string, url: string): Tab => ({ id, url, type: 'page' })

/* The owner's pod at 01:39 UTC tonight, near enough: ten tabs, x.com open. */
const tonight = (): Tab[] => [
  tab('t1', 'https://x.com/home'),
  tab('t2', 'https://t27.ai/'),
  tab('t3', 'https://www.linkedin.com/feed/'),
  tab('t4', 'https://www.reddit.com/r/t27ai/submit'),
  tab('t5', 'https://www.tiktok.com/'),
  tab('t6', 'https://www.instagram.com/accounts/login/two_step_verification/'),
  tab('t7', 'https://studio.youtube.com/'),
  tab('t8', 'https://raw.githubusercontent.com/a/b/main/c.md'),
  tab('t9', 'https://api.github.com/repos/a/b'),
  tab('t10', 'about:blank'),
]

function pod(start: Tab[]): DeskPageIo & { tabs: Tab[]; closed: string[] } {
  let n = 0
  const state = {
    tabs: [...start],
    closed: [] as string[],
    list: async () => state.tabs.map(t => ({ ...t })),
    close: async (_c: string, id: string) => {
      state.closed.push(id)
      state.tabs = state.tabs.filter(t => t.id !== id)
    },
    open: async (_c: string, url: string) => {
      const t = tab(`new${++n}`, url)
      state.tabs.push(t)
      return { id: t.id, url, type: 'page', webSocketDebuggerUrl: '' } as never
    },
  }
  return state
}

beforeEach(() => {
  resetDeskHoldsForTests()
  resetSiteRulesCache()
})

describe('a desk opens under the ceiling', () => {
  it('one share run of four networks never takes the pod past TAB_CAP', async () => {
    const p = pod(tonight())
    for (const url of [
      'https://x.com/compose/post',
      'https://www.linkedin.com/feed/?shareActive=true',
      'https://www.reddit.com/r/t27ai/submit?url=x',
      'https://www.threads.net/intent/post?text=x',
    ]) {
      await newDeskPage('cdp', url, ANYONE, p)
      expect(p.tabs.length).toBeLessThanOrEqual(TAB_CAP)
    }
  })

  it("the run does not spend its own earlier tabs, nor the person's first x.com", async () => {
    const p = pod(tonight())
    const opened: string[] = []
    for (const url of [
      'https://x.com/compose/post',
      'https://www.linkedin.com/feed/?shareActive=true',
      'https://www.reddit.com/r/t27ai/submit?url=x',
      'https://www.threads.net/intent/post?text=x',
    ])
      opened.push((await newDeskPage('cdp', url, ANYONE, p)).id)
    expect(p.closed).not.toContain('t1')
    for (const id of opened) expect(p.closed).not.toContain(id)
  })

  it('a pod that cannot be listed still gets the open', async () => {
    const p = pod(tonight())
    p.list = async () => {
      throw new Error('no list')
    }
    const page = await newDeskPage(
      'cdp',
      'https://x.com/compose/post',
      ANYONE,
      p
    )
    expect(page.id).toBe('new1')
  })
})

describe('the sweep spares what a desk is working in', () => {
  it('the composer beside x.com/home is held, then let go', async () => {
    const p = pod(tonight())
    const t0 = Date.parse('2026-10-03T02:00:00Z')
    const page = await newDeskPage(
      'cdp',
      'https://x.com/compose/post',
      ANYONE,
      p,
      t0
    )
    expect(deskTabsHeld(t0)).toContain(page.id)
    const plan = planTabSweep(p.tabs, deskTabsHeld(t0))
    expect(plan.close.map(d => d.id)).not.toContain(page.id)
    /* After the hold, the same tab is an ordinary duplicate again. */
    const later = deskTabsHeld(t0 + DESK_HOLD_MS)
    expect(later).toEqual([])
    expect(planTabSweep(p.tabs, later).close.map(d => d.id)).toContain(page.id)
  })

  it("the clock's own pod list carries the hold, for a row and for the unclaimed pod", async () => {
    await newDeskPage(
      'cdp',
      'https://x.com/compose/post',
      ANYONE,
      pod(tonight())
    )
    const pool = {
      query: async () => ({
        rows: [{ telegram_id: '144022504', cdp_endpoint: 'pod-a:9222' }],
      }),
    }
    const jobs = await podsToSweep(pool as never, 'pod-b:9222')
    expect(jobs).toHaveLength(2)
    for (const j of jobs) expect(j.keep).toContain('new1')
  })
})

describe('no desk goes around the door', () => {
  it('nothing in src/agent opens a tab with raw newPage', () => {
    const dir = join(__dirname, 'src/agent')
    const raw = readdirSync(dir)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter(f => /\bnewPage\s*\(/.test(readFileSync(join(dir, f), 'utf8')))
    expect(raw).toEqual([])
  })
})

describe('browser_open spares a desk tab too (the note on #3469)', () => {
  it('at the ceiling, the agent opens without closing the composer a desk holds', async () => {
    const { openAndChoose } = await import('./src/browser/agent-tools')
    const full = [
      ...tonight(),
      tab('t11', 'https://www.threads.net/'),
      tab('t12', 'https://news.ycombinator.com/'),
    ]
    const p = pod(full)
    /* The desk opened the composer last: the newest tab, the first to go. */
    const composer = await newDeskPage(
      'cdp',
      'https://x.com/compose/post',
      ANYONE,
      p
    )
    const before = [...p.closed]
    await openAndChoose('144022504', 'cdp', 'https://example.org/', p.open, p)
    expect(p.closed.slice(before.length)).not.toContain(composer.id)
    expect(p.tabs.map(t => t.id)).toContain(composer.id)
  })
})

describe('the log names what was closed, host only', () => {
  it('a path is never printed: it can carry a one-time token', async () => {
    const { namesOfClosed, whereItWas } = await import(
      './src/browser/tab-sweep'
    )
    expect(
      whereItWas(
        'https://www.instagram.com/accounts/login/two_step_verification?encrypted=SECRET'
      )
    ).toBe('www.instagram.com')
    expect(whereItWas('about:blank')).toBe('about:blank')
    expect(whereItWas('chrome://newtab/')).toBe('chrome://newtab')
    expect(whereItWas('not a url')).toBe('(unreadable address)')
    const line = namesOfClosed([
      {
        id: 'a',
        url: 'https://x.com/compose/post?text=draft',
        why: 'duplicate',
      },
      { id: 'b', url: 'chrome://newtab/', why: 'over cap' },
    ])
    expect(line).toBe('x.com (duplicate), chrome://newtab (over cap)')
    expect(line).not.toMatch(/draft|compose/)
  })

  it("the clock's summary carries the names", async () => {
    const { sweepEveryPod } = await import('./src/browser/tab-sweep')
    const p = pod([
      tab('a', 'https://x.com/home'),
      tab('b', 'https://x.com/explore'),
    ])
    const pool = { query: async () => ({ rows: [] }) }
    const [one] = await sweepEveryPod(pool as never, p, TAB_CAP, 'pod-b:9222')
    expect(one.closed).toBe(1)
    expect(one.gone).toBe('x.com (duplicate)')
  })
})

describe("a desk answers to the person's site list", () => {
  /*
   * Found 2026-10-03: the list (site-rules.ts) held for the agent tools, but
   * the desks drive raw CDP. A person who blocked x.com would still have had
   * the blog desk's composer opened there. Refused here, before any tab is
   * made, or closed to make room.
   */
  const listOf = (rows: unknown[] | 'unreadable') => ({
    telegramId: '144',
    pool: {
      query: async (sql: string) => {
        if (rows === 'unreadable') throw new Error('db down')
        return sql.includes('SELECT') ? { rows } : { rows: [] }
      },
    },
  })
  const row = (site: string, rule: 'ask' | 'block') => ({
    site,
    rule,
    by_whom: 'person',
    at: '2026-10-03T00:00:00Z',
  })

  /*
   * At the ceiling, so an open that went ahead WOULD close a tab for room
   * (the control below proves it does): the bee's mutation on #3488 moved
   * the check after room-making, and a pod under the cap could not tell.
   */
  const full = (): Tab[] => {
    const tabs = tonight()
    for (let i = tabs.length; i < TAB_CAP; i++)
      tabs.push(tab(`f${i}`, `https://example${i}.com/`))
    return tabs
  }

  it('a blocked site is not opened, and nothing is closed for room', async () => {
    const p = pod(full())
    expect(p.tabs).toHaveLength(TAB_CAP)
    await expect(
      newDeskPage(
        'cdp',
        'https://x.com/compose/post',
        listOf([row('x.com', 'block')]),
        p
      )
    ).rejects.toThrow(/blocked list/)
    expect(p.tabs.map(t => t.id)).toEqual(full().map(t => t.id))
    expect(p.closed).toEqual([])
    expect(deskTabsHeld()).toEqual([])
  })

  it('control: the same full pod, unblocked, does close one for room', async () => {
    const p = pod(full())
    await newDeskPage('cdp', 'https://x.com/compose/post', ANYONE, p)
    expect(p.closed.length).toBeGreaterThan(0)
  })

  it('an unreadable list opens nothing', async () => {
    const p = pod([])
    await expect(
      newDeskPage('cdp', 'https://www.reddit.com/', listOf('unreadable'), p)
    ).rejects.toThrow(/could not be read/)
    expect(p.tabs).toEqual([])
  })

  it('a site the list does not block opens as before', async () => {
    const p = pod([])
    const page = await newDeskPage(
      'cdp',
      'https://www.linkedin.com/feed/',
      listOf([row('x.com', 'block'), row('reddit.com', 'ask')]),
      p
    )
    expect(p.tabs.map(t => t.id)).toEqual([page.id])
  })
})

describe('deskMayGo: the one check every desk road passes', () => {
  /*
   * Rounds navigates its own window, reddit reads through a tab already
   * open, scenarios acts on the tab in front -- none of them through
   * newDeskPage (the bee on #3488). They call this instead.
   */
  const blocks = {
    telegramId: '144',
    pool: {
      query: async (sql: string) =>
        sql.includes('SELECT')
          ? {
              rows: [
                {
                  site: 'reddit.com/message',
                  rule: 'block',
                  by_whom: 'person',
                  at: '2026-10-03T00:00:00Z',
                },
              ],
            }
          : { rows: [] },
    },
  }

  it('a blocked path is refused, the rest of the site is not', async () => {
    await expect(
      deskMayGo(blocks, 'https://www.reddit.com/message/inbox.json')
    ).rejects.toThrow(/blocked list/)
    await expect(
      deskMayGo(blocks, 'https://www.reddit.com/r/t27ai/new.json')
    ).resolves.toBeUndefined()
  })

  it('an address it cannot read is refused while anything is blocked', async () => {
    await expect(deskMayGo(blocks, '')).rejects.toThrow(/cannot tell/)
    await expect(deskMayGo(blocks, 'chrome-error://x')).rejects.toThrow(
      /cannot tell/
    )
    await expect(deskMayGo(blocks, 'about:blank')).resolves.toBeUndefined()
  })

  it('with nothing blocked, an unknown address goes ahead', async () => {
    await expect(deskMayGo(ANYONE, '')).resolves.toBeUndefined()
  })
})
