import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { codeValues } from './failure-code-values'

/*
 * THE ASSETS ROUTES NAME THEIR REFUSALS; THE WEB MUST KNOW EVERY NAME.
 *
 * POST, DELETE and GET /api/assets back the avatar profile and the generation
 * history. Their refusals were Russian sentences, and the web showed them as
 * raw JSON after "HTTP 401 —". Since 2026-10-03 each refusal also carries a
 * `code`, and player/src/lib/assetsText.ts translates the code.
 *
 * This reads the codes out of the server -- no list is copied here -- one
 * route at a time, from its `if` to the end of its block, so a code added to
 * any of the three fails until the web has a sentence for it.
 */
const root = path.join(__dirname, '..', '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')

const server = read('apps', 'vibee-editor', 'render', 'render-server.ts')

/** One route's block: from its guard to the first top-level `}` after it. */
function route(guard: string): string {
  const start = server.indexOf(guard)
  if (start < 0) return ''
  const end = server.indexOf('\n    return\n  }\n', start)
  return end < 0 ? '' : server.slice(start, end)
}

const routes = {
  post: route("'/api/assets' && req.method === 'POST'"),
  del: route("'/api/assets' && req.method === 'DELETE'"),
  get: route("startsWith('/api/assets/') && req.method === 'GET'"),
}

describe('assets-route refusal codes', () => {
  for (const [name, src] of Object.entries(routes)) {
    it(`${name}: the slice is the route, and every refusal is named`, () => {
      // Positive controls: a moved route would otherwise read as "no codes".
      expect(src, `${name} route moved`).not.toBe('')
      expect(src).toContain('/api/assets')
      const refusals = src.match(/writeHead\((4|5)\d\d/g) ?? []
      const { found, opaque } = codeValues(src)
      expect(refusals.length, 'a route with no refusal').toBeGreaterThan(0)
      // One code per refusal, each a literal: a `code: reason` would name a
      // code this test cannot list.
      expect(found.length).toBe(refusals.length)
      expect(opaque).toEqual([])
    })
  }

  it('the web has an English sentence for every code', () => {
    const web = read(
      'apps',
      'vibee-editor',
      'player',
      'src',
      'lib',
      'assetsText.ts'
    )
    const codes = new Set(
      Object.values(routes).flatMap(src => codeValues(src).found)
    )
    expect(codes.size).toBeGreaterThanOrEqual(5)
    for (const code of codes)
      expect(web, code).toMatch(new RegExp(`\\b${code}:`))
  })
})
