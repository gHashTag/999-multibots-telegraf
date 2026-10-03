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
  deskTabsHeld,
  newDeskPage,
  resetDeskHoldsForTests,
  type DeskPageIo,
} from './src/browser/desk-page'
import { planTabSweep, podsToSweep, TAB_CAP } from './src/browser/tab-sweep'

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

beforeEach(() => resetDeskHoldsForTests())

describe('a desk opens under the ceiling', () => {
  it('one share run of four networks never takes the pod past TAB_CAP', async () => {
    const p = pod(tonight())
    for (const url of [
      'https://x.com/compose/post',
      'https://www.linkedin.com/feed/?shareActive=true',
      'https://www.reddit.com/r/t27ai/submit?url=x',
      'https://www.threads.net/intent/post?text=x',
    ]) {
      await newDeskPage('cdp', url, p)
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
      opened.push((await newDeskPage('cdp', url, p)).id)
    expect(p.closed).not.toContain('t1')
    for (const id of opened) expect(p.closed).not.toContain(id)
  })

  it('a pod that cannot be listed still gets the open', async () => {
    const p = pod(tonight())
    p.list = async () => {
      throw new Error('no list')
    }
    const page = await newDeskPage('cdp', 'https://x.com/compose/post', p)
    expect(page.id).toBe('new1')
  })
})

describe('the sweep spares what a desk is working in', () => {
  it('the composer beside x.com/home is held, then let go', async () => {
    const p = pod(tonight())
    const t0 = Date.parse('2026-10-03T02:00:00Z')
    const page = await newDeskPage('cdp', 'https://x.com/compose/post', p, t0)
    expect(deskTabsHeld(t0)).toContain(page.id)
    const plan = planTabSweep(p.tabs, deskTabsHeld(t0))
    expect(plan.close.map(d => d.id)).not.toContain(page.id)
    /* After the hold, the same tab is an ordinary duplicate again. */
    const later = deskTabsHeld(t0 + DESK_HOLD_MS)
    expect(later).toEqual([])
    expect(planTabSweep(p.tabs, later).close.map(d => d.id)).toContain(page.id)
  })

  it("the clock's own pod list carries the hold, for a row and for the unclaimed pod", async () => {
    await newDeskPage('cdp', 'https://x.com/compose/post', pod(tonight()))
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
