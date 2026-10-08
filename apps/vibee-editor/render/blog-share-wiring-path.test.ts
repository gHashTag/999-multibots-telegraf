/**
 * The real publish path, driven against a fake browser.
 *
 * 2026-10-02: a missing `closePage` import in blog-share-wiring.ts passed
 * every vitest run, because the tests replaced `publish` wholesale, and only
 * tsc caught it. This walks publishEverywhere itself: every network's page is
 * opened, the button pressed, the receipt read, and confirmed tabs closed.
 *
 * Spec v2: a receipt is not a post. After it the owner's own profile is
 * read in the same browser, and only a post seen there counts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const closed: string[] = []
let leaves = true
let blankLooks = 0
let profileShows = true
const opened: string[] = []
let n = 0
const typed: string[] = []
const hrefs = new Map<string, number>()
/* Pages opened, by id; and the URL prefixes a site answers with its sign-in page. */
const pageUrl = new Map<string, string>()
const walls = new Map<string, string>()
const clicks: string[] = []

vi.mock('./src/browser/sessions', () => ({
  readSession: async () => ({ state: 'live', cdpEndpoint: 'cdp' }),
  /* deskMayAct asks before every press (desk-page.ts): nobody drives here. */
  personHasTheWheel: () => false,
}))
vi.mock('./src/browser/routes', () => ({
  startBrowserAsAgent: async () => true,
}))
/* The real reducers, a fake pod: login-use.ts judges with them. */
let logins: Array<{ id: string; name: string; state: string }> | null = null
vi.mock('./src/browser/logins', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/browser/logins')>()),
  loginsOfPerson: async () => logins,
  readMarks: async () => [
    { name: 'auth_token', domain: '.x.com', expires: 1_900_000_000 },
  ],
}))
vi.mock('./src/agent/reach-log', () => ({ noteShape: async () => undefined }))
/*
 * The Reddit leg asks whether the community is open, the server's own read
 * first (reddit.ts readAnonymously). Unstubbed, that was a real request to
 * reddit.com from every run: ENOTFOUND in the cloud, r/t27ai's LIVE state on
 * a machine with the network. Here it answers as Reddit answers an anonymous
 * server -- a block page, read as "did not know" -- and the person's own
 * browser below decides (test-support/no-network.ts).
 */
vi.mock('./src/agent/reddit', async importOriginal => ({
  ...(await importOriginal<typeof import('./src/agent/reddit')>()),
  readAnonymously: async () => '<!doctype html><title>Blocked</title>',
}))
vi.mock('./src/browser/cdp', () => ({
  newPage: async (_c: string, url: string) => {
    opened.push(url)
    const id = `p${++n}`
    pageUrl.set(id, url)
    return { id, url }
  },
  evaluateOn: async (_c: string, id: string, expr: string) => {
    if (expr === 'location.origin + location.pathname') {
      const url = pageUrl.get(id) ?? ''
      for (const [prefix, wall] of walls)
        if (url.startsWith(prefix)) return wall
      return url ? new URL(url).origin + new URL(url).pathname : ''
    }
    if (expr === 'location.href') {
      const k = (hrefs.get(id) ?? 0) + 1
      hrefs.set(id, k)
      return leaves && k > 1 ? `https://after/${id}` : `https://form/${id}`
    }
    if (expr.includes('AppTabBar_Profile_Link')) return 'https://x.com/owner'
    /* X's composer holds what was typed (blog-share.ts composerHolds). */
    if (expr.includes('tweetTextarea_')) return [...typed]
    if (expr === 'document.body ? document.body.innerText : ""')
      return profileShows ? 'Posts\nOpen FPGA Ethernet, at last' : 'Posts'
    if (blankLooks > 0) return (blankLooks--, null)
    return { x: 1, y: 1, label: 'Post' }
  },
  pageUrl: async (_c: string, id: string) => pageUrl.get(id) ?? '',
  clickAt: async (_c: string, id: string) => void clicks.push(id),
  typeText: async (_c: string, _id: string, text: string) =>
    void typed.push(text),
  closePage: async (_c: string, id: string) => void closed.push(id),
}))

beforeEach(() => {
  closed.length = 0
  opened.length = 0
  typed.length = 0
  profileShows = true
  hrefs.clear()
  pageUrl.clear()
  walls.clear()
  clicks.length = 0
  logins = null
  n = 0
  blankLooks = 0
  vi.stubGlobal('setTimeout', (f: () => void) => (f(), 0))
})

const article = {
  slug: 's',
  title: 'Open FPGA Ethernet, at last',
  link: 'https://t27.ai/blog/s',
  summary: 'x',
} as never

describe('the real publish path', () => {
  it('a post seen on the profile is published and its tab closed', async () => {
    leaves = true
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const { outcomeOf } = await import('./src/agent/blog-share')
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    expect(out.X).toMatch(/^тред отправлен.*ушла с формы.*найдено в профиле/) // cyrillic-ok: receipt words
    expect(out.LinkedIn).toMatch(/найдено в профиле/) // cyrillic-ok: receipt words
    expect(out.Reddit).toMatch(/найдено в профиле/) // cyrillic-ok: receipt words
    /* Threads has no profile check, so it is never counted. */
    expect(out.Threads).toMatch(/профиль не проверяется/) // cyrillic-ok: receipt words
    expect(outcomeOf(out)).toBe('posted')
    /* The owner's own pages were read: X via its home page, then the profile. */
    expect(opened).toContain('https://x.com/owner')
    expect(opened).toContain(
      'https://www.linkedin.com/in/me/recent-activity/all/'
    )
    expect(opened).toContain('https://www.reddit.com/user/me/submitted/')
  })
  it('a page that left the form but is NOT on the profile is unconfirmed', async () => {
    leaves = true
    profileShows = false
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const { outcomeOf, publishedSomewhere, headlineOf } = await import(
      './src/agent/blog-share'
    )
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    expect(Object.values(out).every(v => /не подтверждено/.test(v))).toBe(true) // cyrillic-ok: receipt words
    expect(publishedSomewhere(out)).toBe(false)
    expect(outcomeOf(out)).toBe('unconfirmed')
    expect(headlineOf(out)).not.toMatch(/Опубликовано/) // cyrillic-ok: test
    /* Only the profile pages were closed; every share page stays open. */
    const shareIds = new Set(
      opened
        .map((u, i) => [u, `p${i + 1}`])
        .filter(([u]) => /intent|share-offsite|\/submit\?|compose/.test(u))
        .map(([, id]) => id)
    )
    expect(closed.some(id => shareIds.has(id))).toBe(false)
  })
  it('a page still on the form is NOT confirmed and stays open', async () => {
    leaves = false
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    expect(Object.values(out).every(v => /не подтверждено/.test(v))).toBe(true) // cyrillic-ok: receipt words
    expect(closed).toEqual([])
  })
  it('a composer that draws late is waited for, not reported missing', async () => {
    leaves = true
    blankLooks = 10
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    expect(Object.values(out).some(v => /не найдена/.test(v))).toBe(false) // cyrillic-ok: receipt words
  })
})

/**
 * A LOGIN CHECKED BY USE (login-use.ts). The cookie said "signed in"; X had
 * revoked the session and sent the composer to its sign-in page. The desk
 * used to look for Post there, report "button not found" and leave a sign-in
 * form open in the owner's browser.
 */
describe('a site that sends the desk to sign in', () => {
  const pool = () => {
    const sql: Array<{ text: string; params: unknown[] }> = []
    return {
      sql,
      query: async (text: string, params: unknown[] = []) => {
        sql.push({ text, params })
        return { rows: [] }
      },
    }
  }

  it("X's composer lands on X's sign-in: refused, written down, closed, nothing pressed on X", async () => {
    leaves = true
    walls.set('https://x.com/', 'https://x.com/i/flow/login')
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const p = pool()
    const out = await publishEverywhere(p as never, '1', article)
    expect(out.X).toMatch(/^вход слетел/) // cyrillic-ok: the owner's words
    const xPages = [...pageUrl].filter(([, u]) =>
      u.startsWith('https://x.com/')
    )
    /* One X page only (the composer): no single-post fallback on top. */
    expect(xPages.map(([, u]) => u)).toEqual(['https://x.com/compose/post'])
    expect(closed).toContain(xPages[0][0])
    expect(clicks).not.toContain(xPages[0][0])
    const insert = p.sql.find(q =>
      /INSERT INTO browser_login_refusals/.test(q.text)
    )
    expect(insert?.params.slice(0, 4)).toEqual([
      '1',
      'x',
      1_900_000_000,
      'x.com/i/flow/login',
    ])
    /* The other networks went on as before. */
    expect(out.LinkedIn).toMatch(/найдено в профиле/) // cyrillic-ok: receipt words
  })

  it('a share page that lands on its sign-in is closed and named, not "button not found"', async () => {
    leaves = true
    walls.set(
      'https://www.linkedin.com/sharing',
      'https://www.linkedin.com/uas/login'
    )
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const out = await publishEverywhere(pool() as never, '1', article)
    expect(out.LinkedIn).toMatch(/^вход слетел/) // cyrillic-ok: the owner's words
    expect(out.LinkedIn).not.toMatch(/не найдена/) // cyrillic-ok: receipt words
    const li = [...pageUrl].find(([, u]) => u.includes('share-offsite'))!
    expect(closed).toContain(li[0])
    expect(clicks).not.toContain(li[0])
  })

  it('a page that stayed on the network clears an old refusal', async () => {
    leaves = true
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const p = pool()
    await publishEverywhere(p as never, '1', article)
    const cleared = p.sql
      .filter(q => /DELETE FROM browser_login_refusals/.test(q.text))
      .map(q => q.params[1])
    expect(cleared).toEqual(expect.arrayContaining(['x', 'linkedin', 'reddit']))
  })

  it('a login already refused is not opened at all, and says why', async () => {
    leaves = true
    logins = [
      {
        id: 'x',
        name: 'X',
        state: 'refused',
        refusedAt: '2026-10-03T01:02:03.000Z',
      } as never,
      { id: 'linkedin', name: 'LinkedIn', state: 'signed_out' },
    ]
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const out = await publishEverywhere(pool() as never, '1', article)
    expect(out.X).toMatch(/^вход слетел.*2026-10-03 01:02 UTC/) // cyrillic-ok: the owner's words
    expect(out.LinkedIn).toMatch(/^не подключена/) // cyrillic-ok: the owner's words
    expect(opened.some(u => u.startsWith('https://x.com/'))).toBe(false)
    expect(opened.some(u => u.includes('linkedin.com/sharing'))).toBe(false)
  })
})
