import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/*
 * THE SIGN-IN DOOR NAMES ITS REFUSALS; THE APP MUST KNOW EVERY NAME.
 *
 * `/api/auth/pair/claim` words its refusals in Russian, and the iPhone showed
 * the `detail` as it came: Russian on an English phone, at the one moment a
 * person cannot get past the screen. Since 2026-10-02 every refusal there
 * carries a `code` (the 401 repeats its `reason` as the code), and the app
 * translates the code.
 *
 * Only the native app claims a code (the web issues them), so only the app
 * is checked. The codes are read out of the server itself -- no list is
 * copied here -- and a new one fails this until the app can say it.
 */
const root = path.join(__dirname, '..', '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')

const routes = read('apps', 'vibee-editor', 'render', 'session-routes.ts')
const start = routes.indexOf("path === '/api/auth/pair/claim'")
const end = routes.indexOf('mintSession(', start)
const claim = routes.slice(start, end)
const literalCodes = [...claim.matchAll(/code: '([a-z_]+)'/g)].map(m => m[1])

// The 401 says `code: outcome.reason`, so its names live in the store's type.
const store = read('apps', 'vibee-editor', 'render', 'session-store.ts')
const union = store.match(/ok: false; reason: ((?:'[a-z_]+'\s*\|?\s*)+)\}/)
const reasons = union
  ? [...union[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1])
  : []

const codes = [...new Set([...literalCodes, ...reasons])]
const ios = read('apps', 'vibee-ios', 'Vibee', 'Identity.swift')

describe('pairing refusal codes', () => {
  it('the slice is the claim route, and it names its refusals', () => {
    // Positive controls: a moved route would otherwise read as "no codes, all known".
    expect(start, 'the claim route moved').toBeGreaterThan(-1)
    expect(end, 'the session mint moved').toBeGreaterThan(start)
    expect(claim).toContain('code: outcome.reason')
    expect(literalCodes).toEqual(
      expect.arrayContaining(['too_often', 'bad_body', 'bad_length'])
    )
    expect(reasons).toEqual(['unknown', 'expired', 'exhausted'])
  })

  it('the app has a sentence for every code', () => {
    for (const code of codes) expect(ios, code).toContain(`"${code}":`)
  })

  it('the app reads the wait and the digit count the server sends', () => {
    // A renamed field would silently drop the number from the sentence.
    expect(claim).toContain('ждать_секунд:') // cyrillic-ok: the API field
    expect(ios).toContain('body["ждать_секунд"]') // cyrillic-ok: the API field
    expect(claim).toContain('digits: PAIRING.DIGITS')
    expect(ios).toContain('body["digits"]')
  })
})
