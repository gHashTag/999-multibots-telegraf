/**
 * The tests of browser-tab-strip.t27, run against the code that carries it:
 * src/browser/tab-strip.ts (the rules and the strip's I/O) and the player's
 * TabStrip, which reads the byte copy of the generated module.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from './browser-tab-strip.gen'
import {
  agentMark,
  agentTabsOf,
  cacheFresh,
  cacheSlot,
  clipTitle,
  handleStrip,
  hostOnly,
  isStripTab,
  mayClose,
  mayCloseTab,
  mayOpen,
  resetStripMemory,
  stripOf,
  type StripIo,
} from '../browser/tab-strip'
import { TAB_CAP } from '../browser/tab-sweep'
import {
  deskTabsHeld,
  holdDeskTab,
  resetDeskHoldsForTests,
} from '../browser/desk-page'
import { chosenFront, forgetFront, rememberFront } from '../browser/front-page'
import type { CdpTarget } from '../browser/cdp'
import type { Queryable } from '../browser/sessions'

const PLAYER = join(__dirname, '..', '..', '..', 'player', 'src')

/* One live session row and every statement the strip sent. */
function livePool() {
  const statements: string[] = []
  const pool: Queryable = {
    async query(sql: string) {
      const s = sql.replace(/\s+/g, ' ').trim()
      statements.push(s)
      if (/^select/i.test(s) && /browser_sessions/i.test(s))
        return {
          rows: [
            {
              telegram_id: 'tg-1',
              session_id: 's',
              pod_id: 'p',
              endpoint: '127.0.0.1:1',
              cdp_endpoint: '127.0.0.1:9222',
              state: 'live',
              view_token: 'v',
              admin_token: 'a',
              last_seen_at: new Date(),
            },
          ],
        }
      return { rows: [] }
    },
  } as unknown as Queryable
  return { pool, statements }
}

function fakeIo(list: CdpTarget[]): StripIo {
  return {
    list: async () => list,
    visible: async () => new Set<string>(),
    activate: async () => {},
    open: async (_, url) => ({ id: 'N', type: 'page', title: '', url }),
    close: async () => {},
  }
}

const page = (id: string, url: string, title = id): CdpTarget => ({
  id,
  type: 'page',
  title,
  url,
})

beforeEach(() => resetStripMemory())

describe('browser-tab-strip.t27 against the host', () => {
  it("only real pages are tabs, never the browser's own", () => {
    expect(isStripTab(page('a', 'https://a.example/'))).toBe(true)
    expect(isStripTab(page('c', `${SPEC.HIDDEN_CHROME}settings`))).toBe(false)
    expect(isStripTab(page('d', `${SPEC.HIDDEN_DEVTOOLS}x`))).toBe(false)
    expect(isStripTab(page('e', `${SPEC.HIDDEN_EXTENSION}abc/p.html`))).toBe(
      false
    )
    expect(isStripTab({ type: 'service_worker', url: 'https://a/' })).toBe(
      false
    )
    expect(SPEC.TAB_TYPE).toBe('page')
  })

  it("the strip is the person's door, an agent key gets 403", () => {
    /* The door itself is in routes.ts; browser-broker.test.ts drives it. */
    const routes = readFileSync(
      join(__dirname, '..', 'browser', 'routes.ts'),
      'utf8'
    )
    const at = routes.indexOf(`'${SPEC.STRIP_DOOR}'`)
    expect(at).toBeGreaterThan(-1)
    const block = routes.slice(routes.indexOf(`=== '${SPEC.STRIP_DOOR}'`))
    expect(block.slice(0, 600)).toMatch(/actor[^\n]*!== 'person'/)
    expect(block.slice(0, 600)).toContain(String(SPEC.AGENT_STATUS))
    expect(SPEC.PERSON_ONLY).toBe(true)
  })

  it('the last page is never closed', async () => {
    expect(mayClose(0)).toBe(false)
    expect(mayClose(1)).toBe(false)
    expect(mayClose(2)).toBe(true)
    const { pool } = livePool()
    const io = fakeIo([
      page('a', 'https://a.example/'),
      page('x', `${SPEC.HIDDEN_CHROME}newtab`),
    ])
    const out = await handleStrip(
      pool,
      'tg-1',
      JSON.stringify({ action: SPEC.ACTION_CLOSE, id: 'a' }),
      io
    )
    expect(out.status).toBe(SPEC.REFUSED_STATUS)
  })

  it("a new tab respects the pod's cap", async () => {
    expect(SPEC.MAX_TABS_SHOWN).toBe(TAB_CAP)
    expect(mayOpen(1)).toBe(true)
    expect(mayOpen(SPEC.MAX_TABS_SHOWN - 1)).toBe(true)
    expect(mayOpen(SPEC.MAX_TABS_SHOWN)).toBe(false)
    const { pool } = livePool()
    const full = Array.from({ length: SPEC.MAX_TABS_SHOWN }, (_, i) =>
      page(`p${i}`, `https://s${i}.example/`)
    )
    const out = await handleStrip(
      pool,
      'tg-1',
      JSON.stringify({ action: SPEC.ACTION_NEW }),
      fakeIo(full)
    )
    expect(out.status).toBe(SPEC.REFUSED_STATUS)
  })

  it('only a clipped title and a host leave the pod', () => {
    expect([...clipTitle('x'.repeat(200))].length).toBe(SPEC.TITLE_MAX_CHARS)
    expect(clipTitle('x'.repeat(SPEC.TITLE_MAX_CHARS))).toBe(
      'x'.repeat(SPEC.TITLE_MAX_CHARS)
    )
    expect(clipTitle('  short  ')).toBe('short')
    expect(hostOnly('https://mail.example.com:8443/u/0?token=t#x')).toBe(
      'mail.example.com:8443'
    )
    expect(hostOnly('not a url')).toBe('')
    const tabs = stripOf(
      [page('a', 'https://mail.example.com/reset?token=secret', 'Reset')],
      new Set(),
      null
    )
    expect(Object.keys(tabs[0]).sort()).toEqual([
      'active',
      'agent',
      'host',
      'id',
      'title',
    ])
    expect(JSON.stringify(tabs)).not.toContain('secret')
    expect(SPEC.RETURNS_PATH).toBe(false)
    expect(SPEC.RETURNS_PAGE_TEXT).toBe(false)
  })

  it("every action renews the person's wheel", async () => {
    const io = fakeIo([
      page('a', 'https://a.example/'),
      page('b', 'https://b.example/'),
    ])
    for (const body of [
      { action: SPEC.ACTION_ACTIVATE, id: 'a' },
      { action: SPEC.ACTION_NEW },
      { action: SPEC.ACTION_CLOSE, id: 'b' },
    ]) {
      const { pool, statements } = livePool()
      const out = await handleStrip(pool, 'tg-1', JSON.stringify(body), io)
      expect(out.status).toBe(200)
      expect(
        statements.some(s => /person_wheel_until = now\(\)/i.test(s))
      ).toBe(true)
    }
    expect(SPEC.ACTION_RENEWS_WHEEL).toBe(true)
  })

  it('the strip is read every three seconds and fits a finger', () => {
    expect(SPEC.POLL_MS).toBe(3000)
    /* The player reads the same module, byte for byte. */
    expect(
      readFileSync(join(PLAYER, 'spec', 'browser-tab-strip.gen.ts'), 'utf8')
    ).toBe(readFileSync(join(__dirname, 'browser-tab-strip.gen.ts'), 'utf8'))
    const strip = readFileSync(
      join(PLAYER, 'components', 'Browser', 'TabStrip.tsx'),
      'utf8'
    )
    expect(strip).toContain('SPEC.POLL_MS')
    const css = readFileSync(
      join(PLAYER, 'components', 'Browser', 'TabStrip.css'),
      'utf8'
    )
    expect(css).toContain('min-height: var(--touch-target, 44px)')
    expect(css).toContain('min-width: var(--touch-target, 44px)')
    const root = readFileSync(join(PLAYER, 'index.css'), 'utf8')
    const px = Number(/--touch-target:\s*(\d+)px/.exec(root)?.[1])
    expect(px).toBeGreaterThanOrEqual(SPEC.MIN_TOUCH_PX)
  })

  it('a tab the agent works in is marked with a word, desk before chat', () => {
    expect(agentMark(false, false)).toBe(null)
    expect(agentMark(true, false)).toBe(SPEC.AGENT_DESK)
    expect(agentMark(false, true)).toBe(SPEC.AGENT_CHAT)
    expect(agentMark(true, true)).toBe(SPEC.AGENT_DESK)
    const tabs = stripOf(
      [
        page('d', 'https://x.example/compose/post?draft=secret'),
        page('c', 'https://c.example/'),
        page('p', 'https://p.example/'),
      ],
      new Set(),
      null,
      { desk: new Set(['d']), chat: new Set(['c', 'd']) }
    )
    expect(tabs.map(t => t.agent)).toEqual([
      SPEC.AGENT_DESK,
      SPEC.AGENT_CHAT,
      null,
    ])
    /* One word: nothing of the desk's work or the page rides along. */
    expect(JSON.stringify(tabs)).not.toContain('secret')
    expect(SPEC.RETURNS_DESK_INTERNALS).toBe(false)
    expect(SPEC.VERSION).toBe(2)
  })

  it("closing an agent tab needs the person's confirm", async () => {
    expect(mayCloseTab(2, false, false)).toBe(true)
    expect(mayCloseTab(2, true, false)).toBe(false)
    expect(mayCloseTab(2, true, true)).toBe(true)
    expect(mayCloseTab(1, true, true)).toBe(false)
    expect(mayCloseTab(1, false, false)).toBe(false)
    const io: StripIo = {
      ...fakeIo([
        page('a', 'https://a.example/'),
        page('b', 'https://b.example/'),
      ]),
      agents: () => ({ desk: new Set(['a']), chat: new Set() }),
    }
    const refused = await handleStrip(
      livePool().pool,
      'tg-1',
      JSON.stringify({ action: SPEC.ACTION_CLOSE, id: 'a' }),
      io
    )
    expect(refused.status).toBe(SPEC.AGENT_TAB_STATUS)
    expect(refused.body.reason).toBe(SPEC.REASON_AGENT_WORKING)
    const done = await handleStrip(
      livePool().pool,
      'tg-1',
      JSON.stringify({ action: SPEC.ACTION_CLOSE, id: 'a', confirm: true }),
      io
    )
    expect(done.status).toBe(200)
    expect(SPEC.CLOSE_AGENT_NEEDS_CONFIRM).toBe(true)
  })

  it('only a literal true confirms: "true", 1 and "yes" are refused', async () => {
    const io: StripIo = {
      ...fakeIo([
        page('a', 'https://a.example/'),
        page('b', 'https://b.example/'),
      ]),
      agents: () => ({ desk: new Set(), chat: new Set(['a']) }),
    }
    for (const confirm of ['true', 1, 'yes', {}, [true]]) {
      const r = await handleStrip(
        livePool().pool,
        'tg-1',
        JSON.stringify({ action: SPEC.ACTION_CLOSE, id: 'a', confirm }),
        io
      )
      expect(r.status).toBe(SPEC.AGENT_TAB_STATUS)
      expect(r.body.agent).toBe(SPEC.AGENT_CHAT)
    }
  })

  it("the person's own taps never mark a tab chat; the agent's choice does", async () => {
    const who = 'tg-mark'
    forgetFront(who, 'a')
    forgetFront(who, 'N')
    const io: StripIo = {
      ...fakeIo([
        page('a', 'https://a.example/'),
        page('b', 'https://b.example/'),
      ]),
      agents: w => agentTabsOf(w),
    }
    await handleStrip(
      livePool().pool,
      who,
      JSON.stringify({ action: SPEC.ACTION_ACTIVATE, id: 'a' }),
      io
    )
    await handleStrip(
      livePool().pool,
      who,
      JSON.stringify({ action: SPEC.ACTION_NEW }),
      io
    )
    expect([...agentTabsOf(who).chat]).toEqual([])
    /* The tap is still followed by the agent, just not marked as its work. */
    expect(chosenFront(who)).toBe('N')
    rememberFront(who, 'b')
    expect([...agentTabsOf(who).chat]).toEqual(['b'])
    forgetFront(who, 'b')
  })

  it('a desk hold marks the tab and a confirmed close lets it go', async () => {
    resetDeskHoldsForTests()
    holdDeskTab('d')
    const io: StripIo = {
      ...fakeIo([
        page('d', 'https://d.example/'),
        page('b', 'https://b.example/'),
      ]),
      agents: w => agentTabsOf(w),
    }
    const read = await handleStrip(livePool().pool, 'tg-1', null, io)
    const tabs = read.body.tabs as { id: string; agent: unknown }[]
    expect(tabs.find(t => t.id === 'd')?.agent).toBe(SPEC.AGENT_DESK)
    const done = await handleStrip(
      livePool().pool,
      'tg-1',
      JSON.stringify({ action: SPEC.ACTION_CLOSE, id: 'd', confirm: true }),
      io
    )
    expect(done.status).toBe(200)
    expect(deskTabsHeld()).toEqual([])
    /* A hold nobody released (a crash mid-round) still ends on its own. */
    holdDeskTab('x', 0, 1000)
    expect(deskTabsHeld(1000)).toEqual([])
    resetDeskHoldsForTests()
  })

  it('the shared answer is per person and pod, never across people', async () => {
    expect(cacheSlot('tg-1', 'pod:9222')).not.toBe(
      cacheSlot('tg-2', 'pod:9222')
    )
    let asked = 0
    const io: StripIo = {
      ...fakeIo([page('a', 'https://a.example/')]),
      visible: async () => {
        asked += 1
        return new Set(['a'])
      },
    }
    await handleStrip(livePool().pool, 'tg-1', null, io)
    await handleStrip(livePool().pool, 'tg-2', null, io)
    expect(asked).toBe(2)
  })

  it('the front tab is asked over one socket and shared briefly', async () => {
    expect(cacheFresh(0)).toBe(true)
    expect(cacheFresh(SPEC.VISIBILITY_CACHE_MS - 1)).toBe(true)
    expect(cacheFresh(SPEC.VISIBILITY_CACHE_MS)).toBe(false)
    expect(SPEC.VISIBILITY_CACHE_MS).toBeLessThan(SPEC.POLL_MS)
    expect(SPEC.VISIBILITY_PROBE_MS).toBeLessThan(SPEC.VISIBILITY_CACHE_MS)
    /* Two reads inside the cache ask the pod once. */
    let asked = 0
    const io: StripIo = {
      ...fakeIo([
        page('a', 'https://a.example/'),
        page('b', 'https://b.example/'),
      ]),
      visible: async () => {
        asked += 1
        return new Set(['b'])
      },
    }
    await handleStrip(livePool().pool, 'tg-1', null, io)
    await handleStrip(livePool().pool, 'tg-1', null, io)
    expect(asked).toBe(1)
    /*
     * One socket per read is held by src/browser/visible-pages.test.ts against
     * a real WebSocket server: SOCKETS_PER_POLL connections, not one per page.
     */
    expect(SPEC.SOCKETS_PER_POLL).toBe(1)
  })
})
