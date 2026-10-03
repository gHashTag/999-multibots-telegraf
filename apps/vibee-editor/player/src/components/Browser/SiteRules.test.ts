import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE PERSON'S SITE LIST, ON THEIR SIDE (render/src/browser/site-rules.ts).
 *
 * Functions are run: what the app sends and how it reads the answer. The
 * component is read as text where the property IS the text: which strings it
 * shows, in both languages.
 */
const apiFetch = vi.fn()
vi.mock('@/lib/apiFetch', () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}))

const {
  readSiteRules,
  readSiteListState,
  putSiteRule,
  dropSiteRule,
  siteRowsOf,
  nextRule,
  siteRuleFailKey,
} = await import('@/lib/remoteBrowser')

const src = readFileSync(join(__dirname, 'SiteRules.tsx'), 'utf8')
const dict = readFileSync(
  join(__dirname, '..', '..', 'atoms', 'language.ts'),
  'utf8'
)

beforeEach(() => apiFetch.mockReset())

describe('reading the list', () => {
  it('AN UNREADABLE LIST IS null, NEVER AN EMPTY ONE', async () => {
    apiFetch.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 503 })
    )
    expect(await readSiteRules()).toBeNull()
  })

  it('other failures are not dressed up as "no sites"', async () => {
    apiFetch.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 401 })
    )
    await expect(readSiteRules()).rejects.toThrow()
  })

  it('only a 503 says the agent is stopped; a 401 is this screen failing', async () => {
    apiFetch.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 503 })
    )
    expect(await readSiteListState()).toEqual({ unreadable: true })
    apiFetch.mockRejectedValueOnce(
      Object.assign(new Error('x'), { status: 401, code: 'sign_in' })
    )
    expect(await readSiteListState()).toEqual({ failed: 'sign_in' })
    apiFetch.mockResolvedValueOnce({ sites: [] })
    expect(await readSiteListState()).toEqual({ rows: [] })
  })

  it('keeps only rows it can name, and says which the agent added', () => {
    expect(
      siteRowsOf([
        { site: 'bank.com', rule: 'block', by: 'agent' },
        { site: 'clinic.example', rule: 'ask', by: 'person' },
        { site: 'x.com', rule: 'allow' },
        { rule: 'block' },
        null,
      ])
    ).toEqual([
      { site: 'bank.com', rule: 'block', by: 'agent' },
      { site: 'clinic.example', rule: 'ask', by: 'person' },
    ])
    expect(siteRowsOf('nope')).toEqual([])
  })
})

describe('changing the list', () => {
  it('adds with POST {site, rule}', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true })
    await putSiteRule('bank.com', 'block')
    const [url, init] = apiFetch.mock.calls[0]
    expect(url).toMatch(/\/api\/browser\/sites$/)
    expect(init).toMatchObject({ method: 'POST' })
    expect(JSON.parse(init.body)).toEqual({ site: 'bank.com', rule: 'block' })
  })

  it('removes with DELETE ?site=, encoded', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, removed: true })
    await dropSiteRule('yandex.ru/mail')
    const [url, init] = apiFetch.mock.calls[0]
    expect(url).toMatch(/\/api\/browser\/sites\?site=yandex\.ru%2Fmail$/)
    expect(init).toMatchObject({ method: 'DELETE' })
  })
})

describe('the row flip and the refusals', () => {
  it('flips never to ask first and back', () => {
    expect(nextRule('block')).toBe('ask')
    expect(nextRule('ask')).toBe('block')
  })

  it("the server's English refusals become the person's words", () => {
    const err = (status: number) => Object.assign(new Error('x'), { status })
    expect(siteRuleFailKey(err(400))).toBe('browser.sites.badSite')
    expect(siteRuleFailKey(err(409))).toBe('browser.sites.full')
    expect(siteRuleFailKey(err(503))).toBe('browser.sites.unreadableNow')
    expect(siteRuleFailKey(err(500))).toBeNull()
    expect(siteRuleFailKey(new Error('offline'))).toBeNull()
  })
})

describe('what the person sees', () => {
  it('says the unreadable list stops the agent, and who added a row', () => {
    expect(src).toContain("t('browser.sites.unreadable')")
    expect(src).toContain("t('browser.sites.byAgent')")
  })

  it('every string it shows exists in both languages', () => {
    const used = [
      ...[...src.matchAll(/t\('([^']+)'/g)].map(m => m[1]),
      'browser.sites.badSite',
      'browser.sites.full',
      'browser.sites.unreadableNow',
    ]
    expect(used.length).toBeGreaterThan(10)
    const ruStart = dict.indexOf("'browser.forget.sure': 'Да, стереть'")
    const en = dict.slice(0, ruStart)
    const ru = dict.slice(ruStart - 20000)
    for (const key of used) {
      expect(en, `missing in en: ${key}`).toContain(`'${key}':`)
      expect(ru, `missing in ru: ${key}`).toContain(`'${key}':`)
    }
  })
})
