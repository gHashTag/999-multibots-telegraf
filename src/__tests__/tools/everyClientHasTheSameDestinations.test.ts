import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * EVERY CLIENT SHOWS THE SAME PLACES TO GO.
 *
 * Owner, 2026-09-23: the structure must be the same in the web and in the iOS
 * app, taken from the backend on .t27.
 *
 * What it was: the web declared six destinations in a TypeScript file, the iOS
 * app declared five inline in the body of its `TabView`, and a comment above
 * that TabView claimed they were the same list in the same order. The web had
 * gained `browser` three days earlier. Nothing connected the two, so nothing
 * could notice -- and the same would have happened to the next change.
 *
 * Now one file is the list: apps/vibee-editor/render/src/navigation.json,
 * served at GET /api/navigation. Each client ships the same bytes so it can
 * open without the network, and `node scripts/sync-navigation.cjs` writes
 * those copies. This test is what makes a hand-edited copy impossible to miss.
 *
 * It compares BYTES, not parsed objects: a copy that differs only in key order
 * or whitespace is still a copy somebody edited by hand, and the next person
 * to diff them would have to prove it means the same thing.
 */

const ROOT = join(__dirname, '..', '..', '..')
const SOURCE = 'apps/vibee-editor/render/src/navigation.json'
const COPIES = [
  'apps/vibee-editor/player/src/lib/navigation.json',
  'apps/vibee-ios/Vibee/navigation.json',
]

const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('one list of destinations, copied where it must be read offline', () => {
  it('every client ships the bytes the server serves', () => {
    const source = read(SOURCE)
    for (const copy of COPIES) {
      expect(
        read(copy),
        `${copy} drifted from ${SOURCE} — run: node scripts/sync-navigation.cjs`
      ).toBe(source)
    }
  })

  it('the list says which client has a screen for what, and both are named', () => {
    const list = JSON.parse(read(SOURCE)) as {
      version: number
      destinations: Array<{
        id: string
        route: string
        platforms: string[]
        label: { en: string; ru: string }
        icon: { lucide: string; sf: string }
      }>
    }
    expect(list.version).toBeGreaterThan(0)
    expect(list.destinations.length).toBeGreaterThan(0)

    for (const d of list.destinations) {
      // A destination nobody can reach is a mistake, not a plan.
      expect(d.platforms.length, `${d.id} reaches no client`).toBeGreaterThan(0)
      expect(d.platforms.every(p => p === 'web' || p === 'ios')).toBe(true)
      // Two icon names on purpose: the same glyph does not exist in Lucide and
      // in SF Symbols, and a missing SF Symbol draws a blank square.
      expect(d.icon.lucide.length, `${d.id} has no web icon`).toBeGreaterThan(0)
      expect(d.icon.sf.length, `${d.id} has no iOS icon`).toBeGreaterThan(0)
      // Both languages, because only the web has a dictionary.
      expect(d.label.en.length && d.label.ru.length).toBeTruthy()
    }
  })

  it('the web reads the list instead of keeping its own', () => {
    // The pattern that tells one address from another stays on the web side
    // (a regex is not shippable data), but the ITEMS must come from the file.
    const web = read('apps/vibee-editor/player/src/lib/primaryNavigation.ts')
    expect(web).toContain("import navigation from './navigation.json'")
    expect(web).toContain('navigation.destinations')
    // Every shared id needs an address pattern, or that tab would never light.
    const list = JSON.parse(read(SOURCE)) as {
      destinations: Array<{ id: string; platforms: string[] }>
    }
    for (const d of list.destinations.filter(x =>
      x.platforms.includes('web')
    )) {
      expect(web, `no address pattern for ${d.id}`).toMatch(
        new RegExp(`\\b${d.id}:\\s*/`)
      )
    }
  })

  it('the iOS app builds its bar from the list, not from literals', () => {
    const app = read('apps/vibee-ios/Vibee/VibeeApp.swift')
    expect(app).toContain('ForEach(destinations)')
    expect(app).toContain('Navigation.bundled')
    // The five hand-written tabs are gone; a new one must not be added by hand.
    expect(app).not.toMatch(/\.tabItem \{ Label\(say\(/)
  })

  it('the server serves the file rather than a second copy of the list', () => {
    const server = read('apps/vibee-editor/render/render-server.ts')
    expect(server).toContain("req.url?.startsWith('/api/navigation')")
    expect(server).toContain("'navigation.json'")
    // If the ids were typed into the server too, this file would be pinning
    // three copies and the server would be a fourth.
    expect(server).not.toMatch(/destinations:\s*\[\s*\{\s*id:/)
  })
})
