import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * X'S COMPOSER IS READ BACK BEFORE "POST ALL" (2026-10-03).
 *
 * The thread that went out under the owner's name had lost about 115
 * characters from the middle of its first post -- the desk typed, never
 * looked, and pressed. Here the composer is faked: when it holds what was
 * typed the thread is posted; when it holds anything else nothing is
 * pressed after the typing, the draft is closed, and the desk falls back to
 * the share link whose text travels in the URL.
 */

let mangle = false
let noPostAll = false
const typed: { text: string; enter: boolean }[] = []
const clicks: string[] = []
const closed: string[] = []
const opened: string[] = []
let n = 0

vi.mock('../browser/sessions', () => ({
  readSession: async () => ({ state: 'live', cdpEndpoint: 'cdp' }),
  /* deskMayAct asks before every press (desk-page.ts): nobody drives here. */
  personHasTheWheel: () => false,
}))
vi.mock('../browser/routes', () => ({ startBrowserAsAgent: async () => true }))
/* The real reducers (login-use.ts judges with them), no pod. */
vi.mock('../browser/logins', async importOriginal => ({
  ...(await importOriginal<typeof import('../browser/logins')>()),
  loginsOfPerson: async () => null,
  readMarks: async () => [],
}))
vi.mock('../agent/reach-log', () => ({ noteShape: async () => undefined }))
vi.mock('../browser/cdp', () => ({
  newPage: async (_c: string, url: string) => {
    opened.push(url)
    return { id: `p${++n}`, url }
  },
  evaluateOn: async (_c: string, id: string, expr: string) => {
    if (expr === 'location.href') return `https://x.com/${n}/${clicks.length}`
    if (expr.includes('AppTabBar_Profile_Link')) return 'https://x.com/owner'
    if (expr.includes('tweetTextarea_'))
      return typed.map(t =>
        mangle ? t.text.slice(0, 8) + t.text.slice(40) : t.text
      )
    if (expr.startsWith('document.body')) return 'Feed\nOne regional clock'
    /* After the second post is typed, the only look on p1 is for Post all. */
    if (noPostAll && id === 'p1' && typed.length === 2) return null
    return { x: 1, y: 1, label: 'Post' }
  },
  pageUrl: async () => 'https://x.com/compose/post',
  clickAt: async (_c: string, id: string) => void clicks.push(id),
  typeText: async (
    _c: string,
    _id: string,
    text: string,
    opts: { enterForNewline?: boolean } = {}
  ) => void typed.push({ text, enter: !!opts.enterForNewline }),
  closePage: async (_c: string, id: string) => void closed.push(id),
}))

beforeEach(() => {
  typed.length = clicks.length = closed.length = opened.length = 0
  n = 0
  vi.stubGlobal('setTimeout', (f: () => void) => {
    f()
    return 0
  })
})

const article = {
  slug: 'one-regional-clock',
  title: 'One regional clock, twelve pull requests',
  link: 'https://t27.ai/blog/one-regional-clock/',
  summary:
    'Six pull requests to prjxray-db and six to nextpnr-xilinx, merged by the maintainer.',
} as never

describe('X thread: the composer is read back before posting', () => {
  it('posts the thread when the boxes hold what was typed', async () => {
    const { publishEverywhere } = await import('./blog-share-wiring')
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    expect(out.X).toMatch(/^тред отправлен/) // cyrillic-ok: the words the desk writes
    expect(typed).toHaveLength(2)
    /* Line breaks go in as Enter here, and only here. */
    expect(typed.every(t => t.enter)).toBe(true)
  })

  it('a mangled box posts nothing and falls back to the share link', async () => {
    mangle = true
    const { publishEverywhere } = await import('./blog-share-wiring')
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    mangle = false
    /* Typed once, then stopped: the second post was never typed. */
    expect(typed).toHaveLength(1)
    /* The composer page (p1) is closed, and its only press was the box. */
    expect(closed).toContain('p1')
    expect(clicks.filter(id => id === 'p1')).toHaveLength(1)
    /* The fallback: X's share link, its text in the URL, opened next. */
    expect(opened[0]).toBe('https://x.com/compose/post')
    expect(opened.some(u => u.startsWith('https://x.com/intent/'))).toBe(true)
    expect(out.X).not.toMatch(/^тред отправлен/) // cyrillic-ok: the words the desk writes
  })

  it('no "Post all" button: the full draft is closed, not left beside the fallback', async () => {
    noPostAll = true
    const { publishEverywhere } = await import('./blog-share-wiring')
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    noPostAll = false
    /* Both posts typed, nothing pressed after the plus, the draft closed. */
    expect(typed).toHaveLength(2)
    expect(clicks.filter(id => id === 'p1')).toHaveLength(2)
    expect(closed).toContain('p1')
    expect(opened.some(u => u.startsWith('https://x.com/intent/'))).toBe(true)
    expect(out.X).not.toMatch(/^тред отправлен/) // cyrillic-ok: the words the desk writes
  })

  it('composerHolds compares the words, in any box', async () => {
    const { composerHolds } = await import('./blog-share')
    const text = 'A title\n\nThe seed moved Fmax 1.22x. The pins moved it 2.6x.'
    expect(
      composerHolds(
        ['', 'A title\nThe seed moved Fmax 1.22x. The pins moved it 2.6x.'],
        text
      )
    ).toBe(true)
    expect(composerHolds(['A title The seeg; moved it 2.6x.'], text)).toBe(
      false
    )
    expect(composerHolds('A title', 'A title')).toBe(false)
    expect(composerHolds([], 'A title')).toBe(false)
    expect(composerHolds(['x'], '')).toBe(false)
  })
})
