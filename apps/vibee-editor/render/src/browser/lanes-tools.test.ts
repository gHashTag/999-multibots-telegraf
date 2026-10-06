/**
 * A LANE RUNS THE SAME TOOLS, IN ITS OWN WINDOW, UNDER THE SAME RULES.
 *
 * The browser itself is replaced by a list of tabs written down (cdp.ts and
 * windows.ts mocked): what is proved is which call each lane makes and where
 * it acts, not that Chromium answers. The guard, the site list and the wheel
 * are the real ones.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type Tab = { id: string; type: string; url: string; title: string }
const tabs: Tab[] = []
const said: string[] = []
let opened = 0

vi.mock('./cdp', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listTargets: async () => tabs.map(t => ({ ...t })),
  pageUrl: async (_e: string, id: string) =>
    tabs.find(t => t.id === id)?.url ?? '',
  newPage: async (_e: string, url: string) => {
    const t = { id: `tab-${++opened}`, type: 'page', url, title: '' }
    tabs.push(t)
    said.push(`newPage ${url}`)
    return t
  },
  closePage: async (_e: string, id: string) => {
    said.push(`closePage ${id}`)
    tabs.splice(
      tabs.findIndex(t => t.id === id),
      1
    )
  },
  evaluateOn: async (_e: string, id: string) => ({ readIn: id }),
}))

vi.mock('./windows', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  openWindow: async (_e: string, url: string) => {
    const t = { id: `win-${++opened}`, type: 'page', url, title: '' }
    tabs.push(t)
    said.push(`openWindow ${url}`)
    return t.id
  },
  goTo: async (_e: string, id: string, url: string) => {
    said.push(`goTo ${id} ${url}`)
    const t = tabs.find(x => x.id === id)
    if (t) t.url = url
  },
  closeWindow: async (_e: string, id: string) =>
    void said.push(`closeWindow ${id}`),
}))

import {
  BROWSER_TOOLS,
  WHEEL_TAKEN,
  stopExternalReportsForTests,
  stopTickersForTests,
} from './agent-tools'
import {
  chosenFront,
  chosenLaneFront,
  forgetFront,
  rememberFront,
} from './front-page'
import { claimLane, lanesOf, resetLanesForTests } from './lanes'
import { resetJournalCacheForTests } from './journal'

const WHO = '900000001'

const tool = (name: string) => {
  const t = BROWSER_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`no such tool: ${name}`)
  return t
}

/** One live browser, an optional wheel and site list, and the journal kept. */
function world(o: { wheelUntil?: number; blocked?: string } = {}) {
  const journal: Array<{ tool: unknown; detail: Record<string, unknown> }> = []
  const pool = {
    async query(sql: string, p: unknown[] = []) {
      if (/FROM browser_sessions/i.test(sql))
        return {
          rows: [
            {
              telegram_id: WHO,
              session_id: 's-1',
              pod_id: null,
              endpoint: null,
              cdp_endpoint: 'http://pod.test:9222',
              allowed_ms: null,
              wheel_ms: o.wheelUntil ?? null,
              state: 'live',
              view_token: null,
              admin_token: null,
            },
          ],
        }
      if (/FROM browser_site_rules/i.test(sql) && o.blocked)
        return {
          rows: [
            {
              site: o.blocked,
              rule: 'block',
              by_whom: 'person',
              at: new Date(0).toISOString(),
            },
          ],
        }
      if (/^\s*INSERT INTO browser_journal/i.test(sql))
        journal.push({ tool: p[1], detail: JSON.parse(String(p[4])) })
      return { rows: [] }
    },
  }
  const ctx = (lane?: string) =>
    ({
      telegramId: WHO,
      pool,
      turn: 'turn-1',
      ...(lane ? { lane } : {}),
    }) as never
  return { ctx, journal }
}

beforeEach(() => {
  tabs.length = 0
  said.length = 0
  opened = 0
  tabs.push({
    id: 'main-tab',
    type: 'page',
    url: 'https://main.test/',
    title: '',
  })
  resetLanesForTests()
  resetJournalCacheForTests()
  forgetFront(WHO)
})

afterEach(() => {
  stopTickersForTests()
  stopExternalReportsForTests()
})

describe('a lane works in a window of its own', () => {
  it('opens its window once, walks it after, and main still opens tabs', async () => {
    const w = world()
    const open = tool('browser_open')
    expect(
      await open.handler({ url: 'https://a.test/' }, w.ctx('research'))
    ).toEqual({ opened: 'https://a.test/', id: 'win-1' })
    expect(
      await open.handler({ url: 'https://b.test/' }, w.ctx('research'))
    ).toEqual({ opened: 'https://b.test/', id: 'win-1' })
    const mainOpen = (await open.handler(
      { url: 'https://c.test/' },
      w.ctx()
    )) as { id: string }
    expect(said).toEqual([
      'openWindow https://a.test/',
      'goTo win-1 https://b.test/',
      'newPage https://c.test/',
    ])
    expect(chosenLaneFront(WHO, 'research')).toBe('win-1')
    expect(chosenFront(WHO)).toBe(mainOpen.id)
  })

  it('reads in its own tab, and refuses rather than read in main s', async () => {
    const w = world()
    rememberFront(WHO, 'main-tab')
    const read = tool('browser_read')
    await expect(read.handler({}, w.ctx('research'))).rejects.toThrow(
      /lane research has no page of its own yet/
    )
    await tool('browser_open').handler(
      { url: 'https://a.test/' },
      w.ctx('research')
    )
    expect(await read.handler({}, w.ctx('research'))).toEqual({
      readIn: 'win-1',
    })
    /* Main is where it was. */
    expect(await read.handler({}, w.ctx())).toEqual({ readIn: 'main-tab' })
  })

  it('a lane past the cap is refused at the tool too, and opens nothing', async () => {
    const w = world()
    claimLane(WHO, 'a')
    claimLane(WHO, 'b')
    for (const [name, args] of [
      ['browser_open', { url: 'https://a.test/' }],
      /* Not only the opening tool: every tool claims its lane first. */
      ['browser_status', {}],
      ['browser_read', {}],
    ] as const)
      await expect(
        tool(name).handler(args as never, w.ctx('c'))
      ).rejects.toThrow(/already has 3 lanes working in it \(main, a, b\)/)
    expect(said).toEqual([])
  })
})

describe('the rules are the same in every lane', () => {
  it("the person's wheel stops a lane before it touches the browser", async () => {
    const w = world({ wheelUntil: Date.now() + 60_000 })
    for (const [name, args] of [
      ['browser_open', { url: 'https://a.test/' }],
      ['browser_click', { x: 1, y: 1 }],
      ['browser_type', { text: 'x' }],
    ] as const)
      await expect(
        tool(name).handler(args as never, w.ctx('research'))
      ).rejects.toThrow(WHEEL_TAKEN)
    expect(said).toEqual([])
    /* Stopped before the lane was even taken: a stopped chat holds no window. */
    expect(lanesOf(WHO)).toEqual([])
  })

  it("the person's blocked list binds a lane as it binds main", async () => {
    const w = world({ blocked: 'blocked.test' })
    await expect(
      tool('browser_open').handler(
        { url: 'https://blocked.test/x' },
        w.ctx('research')
      )
    ).rejects.toThrow(/blocked list/)
    expect(said).toEqual([])
  })
})

describe('the journal says which lane took a step', () => {
  it('a lane s step carries its lane; main s steps are written as before', async () => {
    const w = world()
    await tool('browser_status').handler({}, w.ctx('research'))
    await tool('browser_status').handler({}, w.ctx())
    await tool('browser_status').handler({}, w.ctx('main'))
    for (let i = 0; i < 200 && w.journal.length < 3; i++)
      await new Promise(r => setTimeout(r, 5))
    expect(w.journal.map(s => s.detail.lane)).toEqual([
      'research',
      undefined,
      undefined,
    ])
  })
})
