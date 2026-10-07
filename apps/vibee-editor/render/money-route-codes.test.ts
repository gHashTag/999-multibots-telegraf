import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { codeValues } from './failure-code-values'

/*
 * THE SERVER NAMES A MONEY REFUSAL; EVERY CLIENT MUST KNOW THE NAME.
 *
 * `/api/tokens/invoice` and `/api/tokens/verify` word their refusals in
 * Russian. The web hid the ones it could not translate, and the iPhone showed
 * them as they came -- Russian on an English phone, at the moment money is
 * involved. Since 2026-10-02 each refusal also carries a `code`, and the
 * clients translate the code, not the sentence.
 *
 * A code is only useful if the reader knows it. This reads the codes out of
 * the server itself -- no list is copied here -- and checks that the web
 * (player/src/lib/topUpText.ts) and the app (vibee-ios/Vibee/API.swift) each
 * have a sentence for every one. A new code on the server fails this until
 * both clients can say it.
 */
const root = path.join(__dirname, '..', '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')

const server = read('apps', 'vibee-editor', 'render', 'render-server.ts')
const start = server.indexOf("'/api/tokens/invoice'")
const end = server.indexOf('зачисление_провалено: true', start) // cyrillic-ok: the API field this slice ends at
const routes = server.slice(start, end)
const { found, opaque } = codeValues(routes)
const codes = [...new Set(found)]

describe('money-route refusal codes', () => {
  it('the slice is the money routes, and they name their refusals', () => {
    // Positive controls: a moved route would otherwise read as "no codes, all known".
    expect(start, 'the invoice route moved').toBeGreaterThan(-1)
    expect(end, 'the verify failure flag moved').toBeGreaterThan(start)
    expect(routes).toContain("'/api/tokens/verify'")
    expect(codes.length).toBeGreaterThanOrEqual(4)
  })

  it('sets every code as a literal the contract can read', () => {
    // No reference is trusted here: a `code: reason` would name a code this
    // test cannot list, so it would pass while a client lacked the sentence.
    expect(opaque).toEqual([])
  })

  it('the web has an English sentence for every code', () => {
    const web = read(
      'apps',
      'vibee-editor',
      'player',
      'src',
      'lib',
      'topUpText.ts'
    )
    for (const code of codes)
      expect(web, code).toMatch(new RegExp(`\\b${code}:`))
  })

  it('the app has an English sentence for every code', () => {
    const ios = read('apps', 'vibee-ios', 'Vibee', 'API.swift')
    for (const code of codes) expect(ios, code).toContain(`"${code}":`)
  })
})
