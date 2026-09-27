/**
 * The rules that keep the pod under its PID ceiling, checked without a pod.
 * What is NOT closed matters more here than what is: the person is watching
 * this browser.
 */
import { describe, it, expect } from 'vitest'
import {
  planTabSweep,
  sweepEveryPod,
  sweepPodTabs,
  viewEveryPodTabs,
  TAB_CAP,
  UNCLAIMED,
} from './tab-sweep'

const page = (id: string, url: string) => ({ id, type: 'page', url })

describe('planTabSweep', () => {
  it('closes the later tabs of an origin and keeps the oldest, which is the person’s', () => {
    const plan = planTabSweep([
      page('a', 'https://www.reddit.com/r/FPGA/'),
      page('b', 'https://www.reddit.com/r/Zig/'),
      page('c', 'https://www.reddit.com/message/inbox'),
    ])
    expect(plan.close.map(t => t.id)).toEqual(['b', 'c'])
    expect(plan.close.every(t => t.why === 'duplicate')).toBe(true)
    expect(plan.left).toBe(1)
  })

  it('leaves a browser that is already tidy alone', () => {
    const plan = planTabSweep([
      page('a', 'https://x.com/home'),
      page('b', 'https://www.reddit.com/'),
    ])
    expect(plan.close).toEqual([])
    expect(plan.left).toBe(2)
  })

  it('never closes the tab the agent is working in, duplicate or not', () => {
    const plan = planTabSweep(
      [
        page('a', 'https://www.reddit.com/'),
        page('b', 'https://www.reddit.com/r/Zig/'),
      ],
      ['b']
    )
    expect(plan.close).toEqual([])
    expect(plan.left).toBe(2)
  })

  it('collapses the blank tabs a failed open leaves behind', () => {
    const plan = planTabSweep([
      page('a', 'about:blank'),
      page('b', 'about:blank'),
      page('c', 'about:blank'),
    ])
    expect(plan.close.map(t => t.id)).toEqual(['b', 'c'])
    expect(plan.left).toBe(1)
  })

  it('does not treat two blank-ish pages as the same page when they are not', () => {
    const plan = planTabSweep([
      page('a', 'about:blank'),
      page('b', 'data:text/html,<p>hi'),
    ])
    expect(plan.close).toEqual([])
  })

  it('closes the newest first when distinct sites still exceed the cap', () => {
    const many = Array.from({ length: TAB_CAP + 3 }, (_, i) =>
      page(`t${i}`, `https://site${i}.example/`)
    )
    const plan = planTabSweep(many)
    expect(plan.left).toBe(TAB_CAP)
    /* The oldest survive: only the last three are given up. */
    expect(plan.close.map(t => t.id).sort()).toEqual(
      [`t${TAB_CAP}`, `t${TAB_CAP + 1}`, `t${TAB_CAP + 2}`].sort()
    )
    expect(plan.close.every(t => t.why === 'over cap')).toBe(true)
  })

  it('keeps a protected tab even when it is over the cap, and gives up an older one instead', () => {
    const many = Array.from({ length: TAB_CAP + 1 }, (_, i) =>
      page(`t${i}`, `https://site${i}.example/`)
    )
    const newest = `t${TAB_CAP}`
    const plan = planTabSweep(many, [newest])
    expect(plan.close.map(t => t.id)).not.toContain(newest)
    expect(plan.left).toBe(TAB_CAP)
  })

  it('always leaves one page open, because a browser with none looks broken', () => {
    const plan = planTabSweep([page('a', 'https://x.com/')], [], 0)
    expect(plan.close).toEqual([])
    expect(plan.left).toBe(1)
  })

  it('counts only real pages: a worker and an extension page hold no tab to close', () => {
    const plan = planTabSweep([
      { id: 'w', type: 'service_worker', url: 'https://www.reddit.com/sw.js' },
      page('p', 'https://www.reddit.com/'),
      page('e', 'chrome-extension://abc/popup.html'),
    ])
    expect(plan.close).toEqual([])
    expect(plan.left).toBe(1)
  })
})

describe('sweepPodTabs', () => {
  it('closes what the plan names and reports it', async () => {
    const closed: string[] = []
    const out = await sweepPodTabs('cdp', [], {
      list: async () => [
        page('a', 'https://www.reddit.com/'),
        page('b', 'https://www.reddit.com/r/Zig/'),
      ],
      close: async (_c, id) => {
        closed.push(id)
      },
    })
    expect(closed).toEqual(['b'])
    expect(out.closed.map(t => t.id)).toEqual(['b'])
    expect(out.left).toBe(1)
  })

  it('counts a tab that refused to close as still open, so the next pass tries again', async () => {
    const out = await sweepPodTabs('cdp', [], {
      list: async () => [
        page('a', 'https://www.reddit.com/'),
        page('b', 'https://www.reddit.com/r/Zig/'),
      ],
      close: async () => {
        throw new Error('the tab did not answer')
      },
    })
    expect(out.closed).toEqual([])
    expect(out.left).toBe(2)
  })
})

/**
 * The state the wedge actually grew in: a pod still running with nobody named
 * on it, because this platform's `stop` cannot stop a provisioned service.
 */
describe('sweepEveryPod', () => {
  const poolOf = (rows: Record<string, unknown>[]) => ({
    query: async () => ({ rows }),
  })
  const ioOf = (closed: string[][]) => ({
    list: async (cdp: string) => [
      page('a', `https://www.reddit.com/?pod=${cdp}`),
      page('b', 'https://www.reddit.com/r/Zig/'),
    ],
    close: async (cdp: string, id: string) => {
      closed.push([cdp, id])
    },
  })

  it('sweeps the configured pod when no session row names it', async () => {
    const closed: string[][] = []
    const done = await sweepEveryPod(
      poolOf([]) as never,
      ioOf(closed),
      TAB_CAP,
      'browser-pod.railway.internal:9223'
    )
    expect(done.map(p => p.who)).toEqual([UNCLAIMED])
    expect(closed).toEqual([['browser-pod.railway.internal:9223', 'b']])
  })

  it('does not sweep the same pod twice when a row already names it', async () => {
    const closed: string[][] = []
    const done = await sweepEveryPod(
      poolOf([
        { telegram_id: '144022504', cdp_endpoint: 'pod.internal:9223' },
      ]) as never,
      ioOf(closed),
      TAB_CAP,
      /* Same pod, written with a scheme and a trailing slash. */
      'http://pod.internal:9223/'
    )
    expect(done.map(p => p.who)).toEqual(['144022504'])
    expect(closed).toHaveLength(1)
  })

  it('sweeps nothing extra on a deployment that starts a pod per session', async () => {
    const done = await sweepEveryPod(poolOf([]) as never, ioOf([]), TAB_CAP)
    expect(done).toEqual([])
  })
})

/** The number that was invisible while the pod wedged. */
describe('viewEveryPodTabs', () => {
  const poolOf = (rows: Record<string, unknown>[]) => ({
    query: async () => ({ rows }),
  })

  it('counts pages and sites and names what a sweep would close, closing nothing', async () => {
    const view = await viewEveryPodTabs(
      poolOf([]) as never,
      async () => [
        page('a', 'https://www.reddit.com/'),
        page('b', 'https://www.reddit.com/r/Zig/'),
        page('c', 'https://x.com/home'),
        { id: 'w', type: 'service_worker', url: 'https://x.com/sw.js' },
      ],
      'pod.internal:9223'
    )
    expect(view).toHaveLength(1)
    expect(view[0].who).toBe(UNCLAIMED)
    expect(view[0].pages).toBe(3)
    expect(view[0].origins).toBe(2)
    expect(view[0].cap).toBe(TAB_CAP)
    expect(view[0].wouldClose.map(t => t.id)).toEqual(['b'])
    expect(view[0].reachable).toBe(true)
  })

  it('says plainly that a pod could not be asked instead of reporting zero tabs', async () => {
    const view = await viewEveryPodTabs(
      poolOf([
        { telegram_id: '144022504', cdp_endpoint: 'gone:9223' },
      ]) as never,
      async () => {
        throw new Error('no browser there')
      }
    )
    expect(view[0]).toMatchObject({ who: '144022504', reachable: false })
  })
})
