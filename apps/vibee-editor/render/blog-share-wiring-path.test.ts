/**
 * The real publish path, driven against a fake browser.
 *
 * 2026-10-02: a missing `closePage` import in blog-share-wiring.ts passed
 * every vitest run, because the tests replaced `publish` wholesale, and only
 * tsc caught it. This walks publishEverywhere itself: every network's page is
 * opened, the button pressed, the receipt read, and confirmed tabs closed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const closed: string[] = []
let leaves = true
let blankLooks = 0
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
  newPage: async (_c: string, url: string) => ({ id: `p${++n}`, url }),
  evaluateOn: async (_c: string, id: string, expr: string) => {
    if (expr === 'location.href') {
      const k = (hrefs.get(id) ?? 0) + 1
      hrefs.set(id, k)
      return leaves && k > 1 ? `https://after/${id}` : `https://form/${id}`
    }
    if (blankLooks > 0) return (blankLooks--, null)
    return { x: 1, y: 1, label: 'Post' }
  },
  clickAt: async () => undefined,
  typeText: async () => undefined,
  closePage: async (_c: string, id: string) => void closed.push(id),
}))

beforeEach(() => {
  closed.length = 0
  hrefs.clear()
  n = 0
  blankLooks = 0
  vi.stubGlobal('setTimeout', (f: () => void) => (f(), 0))
})

const article = {
  slug: 's',
  title: 'T',
  link: 'https://t27.ai/blog/s',
  summary: 'x',
} as never

describe('the real publish path', () => {
  it('a page that left the form is confirmed and its tab closed', async () => {
    leaves = true
    const { publishEverywhere } = await import('./src/agent/blog-share-wiring')
    const out = await publishEverywhere(
      { query: async () => ({ rows: [] }) } as never,
      '1',
      article
    )
    expect(out.X).toMatch(/^тред опубликован.*ушла с формы/) // cyrillic-ok: receipt words
    expect(closed.length).toBe(4)
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
