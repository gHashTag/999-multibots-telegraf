/**
 * A FRAME IS JUDGED WHERE IT IS (src/browser/embedded.ts).
 *
 * Found 2026-10-03: every guard judged the TAB's address. A shop on an
 * unguarded domain embeds js.stripe.com, and a click on "Pay" inside that
 * frame went through with no yes; a page embedding a site the person
 * blocked was shot and clicked into; browser_open answered with wherever a
 * redirect landed, blocked or not. What is asserted below is that nothing
 * happens in the browser -- not merely that a call threw.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FRAMES_PROBE,
  addressesOfAct,
  blockedEmbed,
  embeddedUrls,
  framesOf,
  framesOfTarget,
  landing,
  under,
  type SeenFrame,
} from './src/browser/embedded'
import { resetSiteRulesCache, type SiteRuleRow } from './src/browser/site-rules'

const frame = (over: Partial<SeenFrame>): SeenFrame => ({
  url: '',
  crossOrigin: true,
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  depth: 1,
  focused: false,
  ...over,
})

const rule = (site: string, r: 'ask' | 'block'): SiteRuleRow => ({
  site,
  rule: r,
  by: 'person',
  at: '2026-10-03T00:00:00.000Z',
})

describe('what a page embeds, read defensively', () => {
  it('a malformed probe answer is no frame, never a crash', () => {
    expect(framesOf(null)).toEqual([])
    expect(framesOf({ frames: 'x' })).toEqual([])
    expect(framesOf({ frames: [{ url: 1 }, null, {}] })).toEqual([])
    const [f] = framesOf({ frames: [{ url: 'https://a.example/', x: 1 }] })
    expect(f.url).toBe('https://a.example/')
    expect(f.depth).toBe(1)
    expect(Number.isNaN(f.w)).toBe(true)
  })

  it('a box we could not measure contains no point', () => {
    expect(under(5, 5)(frame({ w: NaN }))).toBe(false)
    expect(under(5, 5)(frame({ w: 0 }))).toBe(false)
    expect(under(5, 5)(frame({}))).toBe(true)
    expect(under(100, 5)(frame({}))).toBe(false)
  })

  it("Chromium's frames of THIS page: the parent chain, not every iframe", () => {
    const targets = [
      { id: 'p1', type: 'page', url: 'https://shop.example/' },
      {
        id: 'f1',
        type: 'iframe',
        url: 'https://js.stripe.com/v3',
        parentId: 'p1',
      },
      {
        id: 'f2',
        type: 'iframe',
        url: 'https://hooks.example/',
        parentId: 'f1',
      },
      { id: 'p2', type: 'page', url: 'https://other.example/' },
      { id: 'f3', type: 'iframe', url: 'https://x.com/embed', parentId: 'p2' },
      /* A cycle must end, not hang. */
      { id: 'c1', type: 'iframe', url: 'https://c1.example/', parentId: 'c2' },
      { id: 'c2', type: 'iframe', url: 'https://c2.example/', parentId: 'c1' },
    ]
    expect(framesOfTarget(targets, 'p1')).toEqual([
      'https://js.stripe.com/v3',
      'https://hooks.example/',
    ])
    expect(framesOfTarget(targets, 'p2')).toEqual(['https://x.com/embed'])
    expect(framesOfTarget(targets, 'nope')).toEqual([])
  })

  it('only web addresses are judged, each once', () => {
    expect(
      embeddedUrls(
        [frame({ url: 'about:blank' }), frame({ url: 'https://a.example/' })],
        ['https://a.example/', 'javascript:void 0', 'https://b.example/']
      )
    ).toEqual(['https://a.example/', 'https://b.example/'])
  })

  it('the first blocked embed is named', () => {
    const rules = [rule('x.com', 'block'), rule('bank.com', 'ask')]
    expect(
      blockedEmbed(['https://bank.com/', 'https://x.com/i/embed'], rules)
    ).toBe('https://x.com/i/embed')
    expect(blockedEmbed(['https://bank.com/'], rules)).toBeNull()
  })
})

describe('where an act inside a frame lands', () => {
  const stripe = frame({
    url: 'https://js.stripe.com/v3/elements',
    x: 200,
    y: 300,
    w: 300,
    h: 50,
  })

  it('a point inside the Stripe frame reaches stripe; outside, the page', () => {
    expect(addressesOfAct([stripe], [], under(250, 320))).toEqual([
      'https://js.stripe.com/v3/elements',
    ])
    expect(addressesOfAct([stripe], [], under(10, 10))).toEqual([])
  })

  it('nested frames: the deepest under the point wins', () => {
    const outer = frame({
      url: 'https://same.example/widget',
      crossOrigin: false,
      w: 800,
      h: 800,
    })
    const inner = frame({ ...stripe, depth: 2 })
    expect(addressesOfAct([outer, inner], [], under(250, 320))).toEqual([
      'https://js.stripe.com/v3/elements',
    ])
    expect(addressesOfAct([outer, inner], [], under(10, 10))).toEqual([
      'https://same.example/widget',
    ])
  })

  it('a cross-origin frame also brings what Chromium sees that the DOM cannot', () => {
    /* Its src says harmless.example; it navigated to stripe since. */
    const moved = frame({ url: 'https://harmless.example/' })
    expect(
      addressesOfAct([moved], ['https://checkout.stripe.com/pay'], () => true)
    ).toEqual(['https://harmless.example/', 'https://checkout.stripe.com/pay'])
    /* Accounted for by the DOM already: not added twice. */
    expect(
      addressesOfAct([moved], ['https://harmless.example/x'], () => true)
    ).toEqual(['https://harmless.example/'])
  })

  it('a frame Chromium lists that the probe cannot account for is in reach of EVERY act', () => {
    /* A closed shadow root hides it from the probe: hit or no hit, it counts. */
    const same = frame({ url: 'https://shop.example/cart', crossOrigin: false })
    expect(
      addressesOfAct([same], ['https://js.stripe.com/v3'], () => true)
    ).toEqual(['https://shop.example/cart', 'https://js.stripe.com/v3'])
    expect(
      addressesOfAct([], ['https://js.stripe.com/v3'], () => false)
    ).toEqual(['https://js.stripe.com/v3'])
    expect(addressesOfAct([same], [], () => false)).toEqual([])
  })
})

/* ---- the probe itself, against a fake DOM (it runs as page script) ---- */

interface FakeEl {
  tagName: string
  kids?: FakeEl[]
  shadow?: FakeEl[]
  box?: [number, number, number, number]
  src?: string
  inner?: FakeDoc
  focus?: boolean
}
interface FakeDoc {
  href: string
  kids: FakeEl[]
}

/** Builds the slice of the DOM the probe touches, nothing more. */
function fakeDocument(d: FakeDoc): unknown {
  const all = (els: FakeEl[]): FakeEl[] =>
    els.flatMap(e => [e, ...all(e.kids ?? [])])
  const build = (doc: FakeDoc): Record<string, unknown> => {
    const wrap = new Map<FakeEl, Record<string, unknown>>()
    const node = (e: FakeEl): Record<string, unknown> => {
      const got = wrap.get(e)
      if (got) return got
      const [left, top, width, height] = e.box ?? [0, 0, 0, 0]
      const inner = e.inner ? build(e.inner) : null
      const n: Record<string, unknown> = {
        tagName: e.tagName,
        src: e.src ?? '',
        clientLeft: 0,
        clientTop: 0,
        getBoundingClientRect: () => ({ left, top, width, height }),
        contentDocument: inner,
        contentWindow: inner ? { location: { href: e.inner?.href } } : null,
        shadowRoot: e.shadow ? root(e.shadow) : null,
      }
      wrap.set(e, n)
      return n
    }
    const root = (kids: FakeEl[]): Record<string, unknown> => {
      const els = all(kids)
      const focusedEl = els.find(e => e.focus)
      return {
        querySelectorAll: () => els.map(node),
        activeElement: focusedEl ? node(focusedEl) : null,
      }
    }
    return root(doc.kids)
  }
  return build(d)
}

const runProbe = (doc: FakeDoc) =>
  framesOf(
    new Function('document', `return ${FRAMES_PROBE}`)(fakeDocument(doc))
  )

describe('FRAMES_PROBE, run as the page would run it', () => {
  it('walks OPEN shadow roots: a frame inside one is found', () => {
    const frames = runProbe({
      href: 'https://shop.example/',
      kids: [
        {
          tagName: 'DIV',
          shadow: [
            {
              tagName: 'IFRAME',
              src: 'https://js.stripe.com/v3',
              box: [10, 20, 300, 50],
            },
          ],
        },
      ],
    })
    expect(frames).toEqual([
      expect.objectContaining({
        url: 'https://js.stripe.com/v3',
        crossOrigin: true,
        x: 10,
        y: 20,
      }),
    ])
  })

  it('reports focus through an open shadow root', () => {
    const iframe: FakeEl = {
      tagName: 'IFRAME',
      src: 'https://js.stripe.com/v3',
      box: [0, 0, 10, 10],
      focus: true,
    }
    const frames = runProbe({
      href: 'https://shop.example/',
      kids: [{ tagName: 'DIV', focus: true, shadow: [iframe] }],
    })
    expect(frames.map(f => f.focused)).toEqual([true])
  })

  it('enters a same-origin frame, reads where it is now, and offsets what it holds', () => {
    const frames = runProbe({
      href: 'https://shop.example/',
      kids: [
        {
          tagName: 'IFRAME',
          src: 'https://shop.example/old',
          box: [100, 200, 500, 500],
          inner: {
            href: 'https://shop.example/cart',
            kids: [
              {
                tagName: 'IFRAME',
                src: 'https://js.stripe.com/v3',
                box: [5, 6, 50, 20],
              },
            ],
          },
        },
      ],
    })
    expect(frames).toEqual([
      expect.objectContaining({
        url: 'https://shop.example/cart',
        crossOrigin: false,
        depth: 1,
      }),
      expect.objectContaining({
        url: 'https://js.stripe.com/v3',
        crossOrigin: true,
        x: 105,
        y: 206,
        depth: 2,
      }),
    ])
  })

  it('a CLOSED shadow root hides its frame from the probe -- why clicks ask Chromium', () => {
    /* shadowRoot is null for a closed root: this is the limit, pinned. */
    const frames = runProbe({
      href: 'https://shop.example/',
      kids: [{ tagName: 'DIV' }],
    })
    expect(frames).toEqual([])
  })
})

describe('where a tab landed', () => {
  const reads = (...urls: (string | null)[]) => {
    let i = 0
    return async () => urls[Math.min(i++, urls.length - 1)]
  }
  const now = async () => undefined

  it('a redirect a -> b settles on b and remembers a', async () => {
    expect(
      await landing(
        reads(
          'https://s.example/x',
          'https://b.example/',
          'https://b.example/'
        ),
        now
      )
    ).toEqual({
      landed: 'https://b.example/',
      seen: ['https://s.example/x', 'https://b.example/'],
    })
  })

  it('still on the address asked, written without its slash: four looks, not two', async () => {
    /* bit.ly is slow; Chromium reports the asked "https://s.example" as
       "https://s.example/". Two looks of it are not a landing. */
    const r = await landing(
      reads(
        'https://s.example/',
        'https://s.example/',
        'https://s.example/',
        'https://b.example/',
        'https://b.example/'
      ),
      now,
      6,
      0,
      'https://s.example'
    )
    expect(r.landed).toBe('https://b.example/')
  })

  it('a chain that passed THROUGH a site still went there', async () => {
    const r = await landing(
      reads(
        'https://s.example/',
        'https://x.com/r',
        'https://c.example/',
        'https://c.example/'
      ),
      now
    )
    expect(r.seen).toContain('https://x.com/r')
    expect(r.landed).toBe('https://c.example/')
  })

  it('about:blank is not a landing; a tab that vanished stops the wait', async () => {
    const r = await landing(
      reads(
        'about:blank',
        'about:blank',
        'https://b.example/',
        'https://b.example/'
      ),
      now
    )
    expect(r.landed).toBe('https://b.example/')
    expect(await landing(reads(null, null), now, 6, 0)).toEqual({
      landed: null,
      seen: [],
    })
  })
})

/* ---- the tools, against a fake browser ---- */

type Stored = { site: string; rule: string }
let table: Stored[] = []
const SESSION = {
  telegram_id: '900000001',
  session_id: 's1',
  pod_id: 'pod',
  endpoint: '127.0.0.1:1',
  cdp_endpoint: '127.0.0.1:2',
  allowed_ms: null as number | null,
  wheel_ms: null,
  state: 'live',
  view_token: 'v',
  admin_token: 'a',
}
const pool = {
  query: async (text: string) => {
    if (text.includes('browser_site_rules')) {
      if (WORLD.rulesDieOnOpen && opening) throw new Error('db gone')
      if (text.startsWith('SELECT'))
        return {
          rows: table.map(r => ({
            telegram_id: '900000001',
            by_whom: 'person',
            at: '2026-10-03T00:00:00.000Z',
            ...r,
          })),
        }
      return { rows: [] }
    }
    return { rows: [SESSION] }
  },
}

const cdpCalls: string[] = []
const PAGE = { url: 'https://blog.example/post' }
const WORLD = {
  frames: [] as SeenFrame[] | 'throws',
  iframes: [] as { id: string; url: string; parentId: string }[],
  /* What page-2 (a newly opened tab) reports, one address per look. */
  opened: [] as string[],
  /* Where the label search finds a button (find-target.ts), if anywhere. */
  found: null as { x: number; y: number } | null,
  /* Chromium's hit-test (cdp.ts frameAtPoint); 'throws' = the fallback. */
  hit: 'throws' as { frameId: string; url: string | null } | 'throws',
  /* Frame targets whose own world says focus is in them; 'throws' = unknown. */
  focusIn: [] as string[] | 'throws',
  /* The site list stops answering once a tab is open. */
  rulesDieOnOpen: false,
}
let looks = 0
let opening = false

vi.mock('./src/browser/cdp', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/cdp')>()),
  frontPage: async () => ({ id: 'page-1', url: PAGE.url }),
  listTargets: async () => {
    const out = [
      { id: 'page-1', url: PAGE.url, title: 'front', type: 'page' },
      ...WORLD.iframes.map(f => ({ ...f, title: '', type: 'iframe' })),
    ]
    /* page-2 exists from its open on; every look after that is the next hop. */
    if (opening && WORLD.opened.length) {
      const url = WORLD.opened[Math.min(looks++, WORLD.opened.length - 1)]
      out.push({ id: 'page-2', url, title: 'new', type: 'page' })
    }
    return out
  },
  newPage: async (_c: string, url: string) => {
    cdpCalls.push(`newPage ${url}`)
    opening = true
    return { id: 'page-2', url }
  },
  activatePage: async () => undefined,
  closePage: async (_c: string, id: string) =>
    void cdpCalls.push(`closePage ${id}`),
  frameAtPoint: async (_c: string, _t: string, x: number, y: number) => {
    cdpCalls.push(`frameAtPoint ${x},${y}`)
    if (WORLD.hit === 'throws') throw new Error('CDP DOM.getNodeForLocation: x')
    return WORLD.hit
  },
  evaluateOn: async (_c: string, t: string, expr: string) => {
    if (expr === 'document.hasFocus()') {
      cdpCalls.push(`hasFocus ${t}`)
      if (WORLD.focusIn === 'throws') throw new Error('frame did not answer')
      return WORLD.focusIn.includes(t)
    }
    if (expr === FRAMES_PROBE) {
      if (WORLD.frames === 'throws') throw new Error('page did not answer')
      return { frames: WORLD.frames }
    }
    cdpCalls.push('evaluateOn')
    return {
      title: 'x',
      url: PAGE.url,
      text: 'x',
      readyState: 'complete',
      visible: true,
      ...(WORLD.found ?? {}),
    }
  },
  clickAt: async () => void cdpCalls.push('clickAt'),
  typeText: async () => void cdpCalls.push('typeText'),
  screenshot: async () => {
    cdpCalls.push('screenshot')
    return 'AAAA'
  },
}))

vi.mock('./src/browser/screen', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/screen')>()),
  desktopShot: async () => {
    cdpCalls.push('desktopShot')
    return 'AAAA'
  },
}))

vi.mock('./src/agent/media-vision', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/agent/media-vision')>()),
  visionConfig: () => null,
}))

const ctx = { telegramId: '900000001', requestId: 'r1', pool } as never

const STRIPE = frame({
  url: 'https://js.stripe.com/v3/elements',
  x: 200,
  y: 300,
  w: 300,
  h: 50,
})

describe('the tools judge the frame, not only the tab', () => {
  beforeAll(async () => {
    const { setLandingStepForTests } = await import('./src/browser/agent-tools')
    setLandingStepForTests(1)
  }, 180_000)

  beforeEach(() => {
    cdpCalls.length = 0
    table = []
    resetSiteRulesCache()
    SESSION.allowed_ms = null
    PAGE.url = 'https://blog.example/post'
    WORLD.frames = []
    WORLD.iframes = []
    WORLD.opened = []
    WORLD.found = null
    WORLD.hit = 'throws'
    WORLD.focusIn = []
    WORLD.rulesDieOnOpen = false
    looks = 0
    opening = false
  })

  const tool = async (name: string) => {
    const { BROWSER_TOOLS } = await import('./src/browser/agent-tools')
    const t = BROWSER_TOOLS.find(x => x.name === name)
    if (!t) throw new Error(`no tool ${name}`)
    return t
  }

  it('PAY INSIDE THE STRIPE FRAME NEEDS A YES, though the page does not', async () => {
    WORLD.frames = [STRIPE]
    await expect(
      (await tool('browser_click')).handler({ x: 250, y: 320 }, ctx)
    ).rejects.toThrow(/stripe\.com.*frame embedded.*browser_ask_permission/s)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('with a fresh yes the same click goes through', async () => {
    WORLD.frames = [STRIPE]
    SESSION.allowed_ms = Date.now()
    await (await tool('browser_click')).handler({ x: 250, y: 320 }, ctx)
    expect(cdpCalls).toContain('clickAt')
  })

  it('a click BY ITS LABEL that lands in the Stripe frame needs a yes too', async () => {
    WORLD.frames = [STRIPE]
    WORLD.found = { x: 250, y: 320 }
    await expect(
      (await tool('browser_click')).handler({ text: 'Pay' }, ctx)
    ).rejects.toThrow(/stripe\.com.*frame embedded/s)
    expect(cdpCalls).not.toContain('clickAt')
    WORLD.found = { x: 10, y: 10 }
    await (await tool('browser_click')).handler({ text: 'Pay' }, ctx)
    expect(cdpCalls).toContain('clickAt')
  })

  it('a click beside the frame is a click on the page', async () => {
    WORLD.frames = [STRIPE]
    await (await tool('browser_click')).handler({ x: 10, y: 10 }, ctx)
    expect(cdpCalls).toContain('clickAt')
  })

  it('typing into the focused Stripe frame needs a yes', async () => {
    WORLD.frames = [{ ...STRIPE, focused: true }]
    await expect(
      (await tool('browser_type')).handler({ text: '4242' }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('typeText')
    WORLD.frames = [STRIPE]
    await (await tool('browser_type')).handler({ text: 'name' }, ctx)
    expect(cdpCalls).toContain('typeText')
  })

  it('"ask" on a site holds inside a frame of an unguarded page', async () => {
    table = [{ site: 'portal.clinic.example', rule: 'ask' }]
    WORLD.frames = [frame({ url: 'https://portal.clinic.example/form' })]
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('A BLOCKED SITE EMBEDDED: not shot, not clicked, even after a yes', async () => {
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.frames = [frame({ url: 'https://platform.x.com/embed/Tweet.html' })]
    SESSION.allowed_ms = Date.now()
    await expect(
      (await tool('browser_screenshot')).handler({}, ctx)
    ).rejects.toThrow(/blocked list.*frame/s)
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/blocked list/)
    expect(cdpCalls).not.toContain('screenshot')
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('a page that will not answer the probe is judged by every frame Chromium lists', async () => {
    WORLD.frames = 'throws'
    WORLD.iframes = [
      { id: 'f1', url: 'https://js.stripe.com/v3', parentId: 'page-1' },
    ]
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('a frame whose src is harmless but which navigated to stripe is stripe', async () => {
    WORLD.frames = [frame({ url: 'https://harmless.example/' })]
    WORLD.iframes = [
      { id: 'f1', url: 'https://checkout.stripe.com/pay', parentId: 'page-1' },
    ]
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it("CHROMIUM'S HIT-TEST NAMES THE FRAME: one in a closed shadow root is stripe", async () => {
    /* The probe sees nothing (closed shadow root); the browser does. */
    WORLD.iframes = [
      { id: 'f1', url: 'https://js.stripe.com/v3', parentId: 'page-1' },
    ]
    WORLD.hit = { frameId: 'f1', url: null }
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/stripe\.com.*frame embedded.*browser_ask_permission/s)
    expect(cdpCalls).toContain('frameAtPoint 5,5')
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('a lying box does not move the frame: the hit-test is believed, not the page', async () => {
    WORLD.frames = [frame({ ...STRIPE, x: -9999, y: -9999, w: 1, h: 1 })]
    WORLD.iframes = [
      { id: 'f1', url: 'https://js.stripe.com/v3', parentId: 'page-1' },
    ]
    WORLD.hit = { frameId: 'f1', url: null }
    await expect(
      (await tool('browser_click')).handler({ x: 250, y: 320 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
    /* And the other way: the browser says top page, the page says stripe. */
    WORLD.frames = [STRIPE]
    WORLD.hit = { frameId: 'page-1', url: null }
    await (await tool('browser_click')).handler({ x: 250, y: 320 }, ctx)
    expect(cdpCalls).toContain('clickAt')
  })

  it('a hit on a cross-origin frame reaches every frame inside it too', async () => {
    WORLD.iframes = [
      { id: 'f1', url: 'https://widget.example/', parentId: 'page-1' },
      { id: 'f2', url: 'https://js.stripe.com/v3', parentId: 'f1' },
    ]
    WORLD.hit = { frameId: 'f1', url: null }
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/stripe\.com/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('a same-process frame is judged by the address its frame tree gives', async () => {
    table = [{ site: 'portal.clinic.example', rule: 'ask' }]
    WORLD.hit = { frameId: 'local-1', url: 'https://portal.clinic.example/f' }
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('a frame the hit-test names but nobody can address falls back, closed', async () => {
    WORLD.iframes = [
      { id: 'f9', url: 'https://js.stripe.com/v3', parentId: 'page-1' },
    ]
    WORLD.hit = { frameId: 'ghost', url: null }
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('hit-test failed, frame hidden from the probe: the fallback still refuses', async () => {
    WORLD.frames = []
    WORLD.iframes = [
      { id: 'f1', url: 'https://js.stripe.com/v3', parentId: 'page-1' },
    ]
    await expect(
      (await tool('browser_click')).handler({ x: 5, y: 5 }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('clickAt')
  })

  it('TYPING into a frame the probe cannot see needs a yes', async () => {
    WORLD.frames = []
    WORLD.iframes = [
      { id: 'f1', url: 'https://js.stripe.com/v3', parentId: 'page-1' },
    ]
    await expect(
      (await tool('browser_type')).handler({ text: '4242' }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).not.toContain('typeText')
  })

  it('typing: the frame itself is asked where focus is, when the page says "not here"', async () => {
    WORLD.frames = [STRIPE]
    WORLD.iframes = [
      { id: 'f1', url: 'https://js.stripe.com/v3', parentId: 'page-1' },
    ]
    WORLD.focusIn = ['f1']
    await expect(
      (await tool('browser_type')).handler({ text: '4242' }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    expect(cdpCalls).toContain('hasFocus f1')
    expect(cdpCalls).not.toContain('typeText')
    /* A frame that cannot answer is treated as holding focus. */
    WORLD.focusIn = 'throws'
    await expect(
      (await tool('browser_type')).handler({ text: '4242' }, ctx)
    ).rejects.toThrow(/browser_ask_permission/)
    /* It says no: typing goes to the page. */
    WORLD.focusIn = []
    await (await tool('browser_type')).handler({ text: 'name' }, ctx)
    expect(cdpCalls).toContain('typeText')
  })

  it('typing: a BLOCKED frame is asked where focus is, though it needs no yes', async () => {
    /* x.com is not a guarded place: only the list's "block" makes it risky. */
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.frames = [frame({ url: 'https://platform.x.com/embed' })]
    WORLD.iframes = [
      { id: 'f1', url: 'https://platform.x.com/embed', parentId: 'page-1' },
    ]
    WORLD.focusIn = ['f1']
    await expect(
      (await tool('browser_type')).handler({ text: 'hi' }, ctx)
    ).rejects.toThrow(/embedded in this page as a frame/)
    expect(cdpCalls).toContain('hasFocus f1')
    expect(cdpCalls).not.toContain('typeText')
  })

  it('typing beside harmless frames asks none of them', async () => {
    WORLD.frames = [frame({ url: 'https://ads.example/slot' })]
    WORLD.iframes = [
      { id: 'f1', url: 'https://ads.example/slot', parentId: 'page-1' },
    ]
    await (await tool('browser_type')).handler({ text: 'hi' }, ctx)
    expect(cdpCalls.some(c => c.startsWith('hasFocus'))).toBe(false)
    expect(cdpCalls).toContain('typeText')
  })

  it('the whole-screen shot counts a blocked frame as a blocked tab', async () => {
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.iframes = [
      { id: 'f1', url: 'https://platform.x.com/embed', parentId: 'page-1' },
    ]
    await expect(
      (await tool('browser_screenshot')).handler({ desktop: true }, ctx)
    ).rejects.toThrow(/blocked list/)
    expect(cdpCalls).not.toContain('desktopShot')
  })

  it('A REDIRECT TO A BLOCKED SITE: the tab is closed, its address not handed back', async () => {
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.opened = [
      'https://short.example/abc',
      'https://x.com/someone',
      'https://x.com/someone',
    ]
    const err = await (await tool('browser_open'))
      .handler({ url: 'https://short.example/abc' }, ctx)
      .then(
        () => null,
        (e: Error) => e
      )
    expect(err?.message).toMatch(/blocked list.*redirect/s)
    expect(cdpCalls).toContain('closePage page-2')
  })

  it('a chain that passed THROUGH a blocked site is refused, though it landed elsewhere', async () => {
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.opened = [
      /* The first look is the open's own tab count, then the landing's. */
      'https://short.example/abc',
      'https://short.example/abc',
      'https://x.com/i/redirect',
      'https://b.example/',
      'https://b.example/',
    ]
    await expect(
      (await tool('browser_open')).handler(
        { url: 'https://short.example/abc' },
        ctx
      )
    ).rejects.toThrow(/blocked list.*redirect/s)
    expect(cdpCalls).toContain('closePage page-2')
  })

  it('a redirect to an allowed site answers with where it landed', async () => {
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.opened = [
      'https://short.example/abc',
      'https://b.example/',
      'https://b.example/',
    ]
    const r = (await (
      await tool('browser_open')
    ).handler({ url: 'https://short.example/abc' }, ctx)) as { opened: string }
    expect(r.opened).toBe('https://b.example/')
    expect(cdpCalls.some(c => c.startsWith('closePage'))).toBe(false)
  })

  it('a slow redirect does not settle the wait on the address asked', async () => {
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.opened = [
      'https://short.example/abc',
      'https://short.example/abc',
      'https://short.example/abc',
      'https://x.com/someone',
      'https://x.com/someone',
    ]
    await expect(
      (await tool('browser_open')).handler(
        { url: 'https://short.example/abc' },
        ctx
      )
    ).rejects.toThrow(/blocked list.*redirect/s)
    expect(cdpCalls).toContain('closePage page-2')
  })

  it('a list that dies after the open closes the tab it opened', async () => {
    table = [{ site: 'x.com', rule: 'block' }]
    WORLD.opened = ['https://short.example/abc']
    WORLD.rulesDieOnOpen = true
    await expect(
      (await tool('browser_open')).handler(
        { url: 'https://short.example/abc' },
        ctx
      )
    ).rejects.toThrow()
    expect(cdpCalls).toContain('closePage page-2')
  })

  it('no block on the list: open waits for nothing', async () => {
    WORLD.opened = ['https://x.com/someone']
    const r = (await (
      await tool('browser_open')
    ).handler({ url: 'https://short.example/abc' }, ctx)) as { opened: string }
    /* Not waited for: the answer is the address asked, not x.com. */
    expect(r.opened).toBe('https://short.example/abc')
  })
})
