import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { GENERATION_REFUSAL_CODES } from './generation-refusal'

/*
 * THE SERVER NAMES A FAILED GENERATION; EVERY CLIENT MUST KNOW THE NAME.
 *
 * The same contract as money-route-codes.test.ts, for the four generation
 * routes. The list is imported from the server, not copied here, and both
 * clients must have a sentence for every name: a new code fails this until
 * the web (player/src/lib/generationRefusal.ts) and the app
 * (vibee-ios/Vibee/ПодборЗадачи.swift) can say it.  // cyrillic-ok: a file name
 */
const root = path.join(__dirname, '..', '..', '..')
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8')

describe('generation refusal codes', () => {
  it('the four routes stamp their failures', () => {
    const server = read('apps', 'vibee-editor', 'render', 'render-server.ts')
    for (const kind of ['image', 'video', 'audio', 'lipsync']) {
      const head = `'/api/generate/${kind}' && req.method === 'POST') {`
      const at = server.indexOf(head)
      expect(at, `${kind} route moved`).toBeGreaterThan(-1)
      // The stamp is the first thing the route does, before any answer.
      const next = server.slice(at, at + 300)
      expect(next, kind).toContain('stampRefusalCode(res)')
    }
    expect(GENERATION_REFUSAL_CODES.length).toBeGreaterThanOrEqual(6)
  })

  it('the shared auth guard names its refusal too', () => {
    // It answers before any route, so the routes' stamp never sees it; an
    // expired session is the most common failed generation of all.
    const server = read('apps', 'vibee-editor', 'render', 'render-server.ts')
    const at = server.indexOf("hint: 'send X-Api-Key (server to server)")
    expect(at, 'the guard moved').toBeGreaterThan(-1)
    expect(server.slice(at - 600, at)).toContain(
      'code: refusalCodeFor(auth.statusCode ?? 401)'
    )
  })

  it('a duration ceiling says too_long, not "something is missing"', () => {
    // A 400 is bad_input by status; only the ceiling knows it is length.
    const server = read('apps', 'vibee-editor', 'render', 'render-server.ts')
    const ceilings = [...server.matchAll(/seconds or shorter`,/g)]
    expect(ceilings.length).toBeGreaterThanOrEqual(2)
    for (const m of ceilings)
      expect(server.slice(m.index, m.index! + 80)).toContain("code: 'too_long'")
  })

  it('the web has a sentence for every code', () => {
    const web = read(
      'apps',
      'vibee-editor',
      'player',
      'src',
      'lib',
      'generationRefusal.ts'
    )
    for (const code of GENERATION_REFUSAL_CODES)
      expect(web, code).toMatch(new RegExp(`\\b${code}: \\{`))
  })

  it('the app has a sentence for every code', () => {
    const ios = read('apps', 'vibee-ios', 'Vibee', 'ПодборЗадачи.swift') // cyrillic-ok: a file name
    for (const code of GENERATION_REFUSAL_CODES)
      expect(ios, code).toContain(`"${code}": (`)
  })
})
