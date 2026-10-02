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
const hrefs = new Map<string, number>()

vi.mock('./src/browser/sessions', () => ({
  readSession: async () => ({ state: 'live', cdpEndpoint: 'cdp' }),
}))
vi.mock('./src/browser/routes', () => ({
  startBrowserAsAgent: async () => true,
}))
vi.mock('./src/browser/logins', () => ({ loginsOfPerson: async () => null }))
vi.mock('./src/agent/reach-log', () => ({ noteShape: async () => undefined }))
vi.mock('./src/browser/cdp', () => ({
  newPage: async (_c: string, url: string) => {
    opened.push(url)
    return { id: `p${++n}`, url }
  },
  evaluateOn: async (_c: string, id: string, expr: string) => {
    if (expr === 'location.href') {
      const k = (hrefs.get(id) ?? 0) + 1
      hrefs.set(id, k)
      return leaves && k > 1 ? `https://after/${id}` : `https://form/${id}`
    }
    if (expr.includes('AppTabBar_Profile_Link')) return 'https://x.com/owner'
    if (expr === 'document.body ? document.body.innerText : ""')
      return profileShows ? 'Posts\nOpen FPGA Ethernet, at last' : 'Posts'
    if (blankLooks > 0) return (blankLooks--, null)
    return { x: 1, y: 1, label: 'Post' }
  },
  clickAt: async () => undefined,
  typeText: async () => undefined,
  closePage: async (_c: string, id: string) => void closed.push(id),
}))

beforeEach(() => {
  closed.length = 0
  opened.length = 0
  profileShows = true
  hrefs.clear()
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
