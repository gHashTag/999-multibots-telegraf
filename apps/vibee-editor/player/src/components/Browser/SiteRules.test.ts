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

const { readSiteRules, putSiteRule, dropSiteRule, siteRowsOf } = await import(
  '@/lib/remoteBrowser'
)

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

describe('what the person sees', () => {
  it('says the unreadable list stops the agent, and who added a row', () => {
    expect(src).toContain("t('browser.sites.unreadable')")
    expect(src).toContain("t('browser.sites.byAgent')")
  })

  it('every string it shows exists in both languages', () => {
    const used = [...src.matchAll(/t\('([^']+)'/g)].map(m => m[1])
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
