/**
 * THE BOT AND THE MINI APP AGREE THROUGH start_param -- AND DRIFTED SILENTLY.
 *
 * The bot builds `Markup.button.webApp(..., buildMiniAppUrl('pair'))`; the
 * mini app matches the arriving value against a route map. A value the map
 * does not hold raises nothing: it falls through to `TELEGRAM_HOME`, and the
 * person lands on the feed instead of the screen they asked for.
 *
 * That is exactly what happened to app sign-in. The "Sign in to the app"
 * button opened the FEED, the person never saw a code, typed one anyway and
 * got a "code not found" refusal. Production measurement 2026-09-03: the logs
 * carry POST /api/auth/pair/start and THREE POST /api/auth/pair/claim, while
 * app_pairing_codes gained no row in 24 hours. No code existed for a single
 * second.
 *
 * A build cannot catch this: two applications, two languages, one shared
 * string literal. So this test reads BOTH sides FROM SOURCE rather than
 * restating them in a list of its own -- a list you must remember to extend
 * is a list that goes stale at the next button.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..', '..')
const BOT_SRC = path.join(REPO_ROOT, 'src')
const PROVIDER = path.join(__dirname, '..', 'TelegramProvider.tsx')

const APP = path.join(__dirname, '..', '..', '..', 'App.tsx')

/** Entries of the mini app's start_param -> route map. */
function routeEntries(): { key: string; target: string }[] {
  const src = fs.readFileSync(PROVIDER, 'utf8')
  // The map is the only object literal here whose values start with "/". Match
  // that shape rather than "the first object": the file is alive and other
  // constants will appear above the map over time.
  return [...src.matchAll(/^\s{2}([a-z_]+):\s*'(\/[^']*)',?\s*$/gm)].map(m => ({
    key: m[1],
    target: m[2],
  }))
}

/** Keys of the mini app's start_param -> route map. */
function routeKeys(): string[] {
  return routeEntries().map(e => e.key)
}

/** Every `path` App.tsx declares on a <Route>. */
function declaredRoutes(): string[] {
  return [...fs.readFileSync(APP, 'utf8').matchAll(/path="([^"]+)"/g)].map(
    m => m[1]
  )
}

/**
 * Does a declared route pattern cover this address?
 *
 * Segment by segment, because the real router is not a string comparison:
 * `/generate/:tab` must accept `/generate/avatar`, and `/hive/*` must accept
 * everything under the hive. Anything more faithful would mean importing
 * react-router's matcher, which would then also have to be kept in step with
 * the version the app builds against -- this covers the three shapes App.tsx
 * actually uses.
 */
function routeCovers(pattern: string, address: string): boolean {
  const pat = pattern.split('/').filter(Boolean)
  const addr = address.split('?')[0].split('/').filter(Boolean)
  for (let i = 0; i < pat.length; i++) {
    if (pat[i] === '*') return true
    if (i >= addr.length) return false
    if (pat[i].startsWith(':')) continue
    if (pat[i] !== addr[i]) return false
  }
  return pat.length === addr.length
}

/**
 * Every start_param value the bot ACTUALLY sends.
 *
 * Collected from three shapes at once: a direct buildMiniAppUrl('x'), a
 * createMiniAppButton(isRu, 'x'), and a named constant handed to the URL
 * builder. The bot's own tests are skipped: buildMiniAppUrl('a b&c') there
 * checks encoding, not routing.
 */
function paramsSentByBot(): { value: string; file: string }[] {
  const found: { value: string; file: string }[] = []

  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name === '__tests__' || e.name === 'node_modules') continue
        walk(p)
        continue
      }
      if (!e.name.endsWith('.ts') || e.name.endsWith('.test.ts')) continue
      const src = fs.readFileSync(p, 'utf8')
      const file = path.relative(REPO_ROOT, p)

      for (const m of src.matchAll(/buildMiniAppUrl\(\s*'([a-z_]+)'/g)) {
        found.push({ value: m[1], file })
      }
      for (const m of src.matchAll(
        /createMiniAppButton\([^,)]+,\s*'([a-z_]+)'/g
      )) {
        found.push({ value: m[1], file })
      }
      // A constant handed straight to the URL builder. Its name may be written
      // in a non-Latin script in the bot's source, so the class is broad.
      for (const m of src.matchAll(/const\s+([^\s=]+)\s*=\s*'([a-z_]+)'/g)) {
        const [, name, value] = m
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        if (new RegExp(`buildMiniAppUrl\\(\\s*${escaped}\\s*\\)`).test(src)) {
          found.push({ value, file })
        }
      }
    }
  }

  walk(BOT_SRC)
  return found
}

describe('start_param: the bot sends only what the mini app understands', () => {
  it('the scan found both the map and the senders', () => {
    // A zero denominator would pass every assertion below. A regex that
    // matches nothing is precisely the failure this file exists to prevent.
    expect(routeKeys().length).toBeGreaterThan(5)
    expect(paramsSentByBot().length).toBeGreaterThan(0)
  })

  it('every value the bot sends exists in the route map', () => {
    const map = new Set(routeKeys())
    const orphans = paramsSentByBot()
      .filter(p => !map.has(p.value))
      .map(p => `${p.value} (${p.file})`)
    expect(
      orphans,
      'the bot will open the mini app on the feed instead of the intended screen'
    ).toEqual([])
  })

  /**
   * THE CHECK THAT WOULD HAVE CAUGHT ALL THREE FAILURES OF THIS ONE VALUE.
   *
   * `pair` has been wrong three times in two weeks: missing from the map
   * (2026-09-03), naming a screen that opened on the wrong tab (09-07), and
   * naming a screen that had since been buried behind the welcome road's club
   * price (09-17). Every one of them was a value that LOOKED like an address
   * and led somewhere else, and none raised anything -- an unmatched target
   * falls through to the feed exactly like an unknown key.
   *
   * The sweep above only checks that the bot's KEYS are in the map. This
   * checks the other end: that the map's TARGETS are addresses the router
   * actually serves.
   */
  it('every address in the map is a route App.tsx declares', () => {
    const routes = declaredRoutes()
    expect(routes.length).toBeGreaterThan(10)

    const orphans = routeEntries()
      .filter(e => !routes.some(r => routeCovers(r, e.target)))
      .map(e => `${e.key} -> ${e.target}`)

    expect(
      orphans,
      'the mini app will fall through to the feed instead of this screen'
    ).toEqual([])
  })

  it('app sign-in leads to the screen that shows the code', () => {
    // Asserted on its own, not only through the sweeps above: this is the one
    // route whose failure is invisible -- the feed opens, everything "works".
    expect(routeKeys()).toContain('pair')

    /*
     * THE DESTINATION, NOT THE LITERAL.
     *
     * This assertion has been rewritten twice now, and both times because it
     * had been written to pin the ADDRESS. `toMatch(/pair:\s*'\/profile'/)`
     * pinned the version that opened on the "Templates" tab; its replacement,
     * `'\/profile\?tab=agent'`, pinned the version the welcome road had made
     * unreachable. Each time the test was green while the door was shut, and
     * each time the fix had to begin by deleting the assertion that described
     * the defect.
     *
     * So it no longer names an address at all. It follows `pair` through the
     * route table to the page component and insists that page mounts
     * `PairWithApp` -- the one thing that has to be true for the bot's promise
     * ("press the button, a window opens with your code") to hold. Move the
     * screen wherever you like; this passes as long as it still shows a code.
     */
    const target = routeEntries().find(e => e.key === 'pair')!.target
    const app = fs.readFileSync(APP, 'utf8')

    const route = app
      .split('<Route')
      .slice(1)
      .map(chunk => ({
        path: /path="([^"]+)"/.exec(chunk)?.[1],
        element: /element={<([A-Za-z]+)/.exec(chunk)?.[1],
      }))
      .find(r => r.path && routeCovers(r.path, target))

    expect(route, `no route serves ${target}`).toBeTruthy()

    const importedFrom = new RegExp(
      `const\\s+${route!.element}\\s*=\\s*lazy\\(\\s*\\(\\)\\s*=>\\s*import\\('@/pages/([A-Za-z]+)'\\)`
    ).exec(app)?.[1]
    expect(importedFrom, `${route!.element} is not a lazy page`).toBeTruthy()

    const page = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', 'pages', `${importedFrom}.tsx`),
      'utf8'
    )
    expect(page).toContain('PairWithApp')
  })
})
