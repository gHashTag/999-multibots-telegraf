import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sitesInWords } from '@/lib/remoteBrowser'
import { IMPORT_ACCEPTS } from './ImportLogins'

/**
 * BRING YOUR LOGINS OVER -- and never through a password field.
 *
 * The component is read as text where the property IS the text: which
 * inputs exist, which dictionary keys it uses. Behaviour that is a function
 * (sitesInWords) is run.
 */
const src = readFileSync(join(__dirname, 'ImportLogins.tsx'), 'utf8')
const dict = readFileSync(
  join(__dirname, '..', '..', 'atoms', 'language.ts'),
  'utf8'
)

describe('the import never collects a password', () => {
  it('HAS NO PASSWORD FIELD, and says where passwords go instead', () => {
    expect(src).not.toMatch(/type=["']password["']/)
    expect(src).not.toMatch(/autoComplete=["'](current|new)-password["']/)
    expect(src).toContain("t('browser.import.passwords')")
    expect(dict).toContain('Bitwarden')
  })

  it('takes only an export file: JSON or text', () => {
    expect(IMPORT_ACCEPTS.split(',').sort()).toEqual(
      ['.json', '.txt', 'application/json', 'text/plain'].sort()
    )
    expect(src).toContain('accept={IMPORT_ACCEPTS}')
  })

  it('DOES NOT LEAVE THE KEYS ON THE SCREEN after they are in', () => {
    const afterImport = src.slice(src.indexOf('await importBrowserLogins('))
    expect(afterImport.indexOf("setText('')")).toBeGreaterThan(-1)
    expect(afterImport.indexOf("setText('')")).toBeLessThan(
      afterImport.indexOf('catch (e)')
    )
  })

  it('warns that cookies are keys, in both languages', () => {
    expect(src).toContain("t('browser.import.warn')")
    expect(dict).toContain('Cookies are the keys to your accounts')
    expect(dict).toContain('Cookies — это ключи от ваших аккаунтов')
  })
})

describe('every string it shows exists in both languages', () => {
  it('has no key in one dictionary and not the other', () => {
    const used = [...src.matchAll(/t\('([^']+)'/g)].map(m => m[1])
    expect(used.length).toBeGreaterThan(8)
    const ruStart = dict.indexOf("'browser.forget.sure': 'Да, стереть'")
    const en = dict.slice(0, ruStart)
    const ru = dict.slice(ruStart - 20000)
    for (const key of used) {
      expect(en, `missing in en: ${key}`).toContain(`'${key}':`)
      expect(ru, `missing in ru: ${key}`).toContain(`'${key}':`)
    }
  })
})

describe('what the person is told', () => {
  const more = (n: number) => `and ${n} more`

  it('names the busiest sites first, then counts the rest', () => {
    expect(
      sitesInWords(
        { 'a.com': 1, 'habr.com': 9, 'github.com': 5, 'b.com': 2, 'c.com': 1 },
        more
      )
    ).toBe('habr.com, github.com, b.com and 2 more')
  })

  it('names them all when there are few', () => {
    expect(sitesInWords({ 'habr.com': 2 }, more)).toBe('habr.com')
  })
})
