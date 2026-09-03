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

/** Keys of the mini app's start_param -> route map. */
function routeKeys(): string[] {
  const src = fs.readFileSync(PROVIDER, 'utf8')
  // The map is the only object literal here whose values start with "/". Match
  // that shape rather than "the first object": the file is alive and other
  // constants will appear above the map over time.
  return [...src.matchAll(/^\s{2}([a-z_]+):\s*'\/[^']*',?\s*$/gm)].map(
    m => m[1]
  )
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

  it('app sign-in leads to the screen that shows the code', () => {
    // Asserted on its own, not only through the sweep above: this is the one
    // route whose failure is invisible -- the feed opens, everything "works".
    expect(routeKeys()).toContain('pair')
    expect(fs.readFileSync(PROVIDER, 'utf8')).toMatch(/pair:\s*'\/profile'/)
  })
})
