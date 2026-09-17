/**
 * THE MINI APP READ THE BOT'S RAILWAY CONFIG, AND EVERY PLAYER CHANGE WAS SKIPPED.
 *
 * 2026-09-17: service `vibee-editor` (Root Directory `apps/vibee-editor`) had
 * its config file set to `/railway.toml`. Railway resolves that path from the
 * repository root, so it read the bot's file, watched `src/**`, and answered
 * "No changes to watched files" to every merge that touched only the player.
 *
 * These pin the decisions the check makes, against the real files where it
 * matters: the pattern matcher must agree with how the repository's own
 * railway.toml files are written, or the check reports the wrong merges.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const check = require('./railway-config-check.cjs')

const ROOT = path.resolve(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')

describe('which config a service reads', () => {
  it('flags the exact mistake: a root config for a service with a Root Directory', () => {
    const r = check.configInsideRoot('apps/vibee-editor', '/railway.toml')
    expect(r.ok).toBe(false)
    expect(r.why).toMatch(/outside Root Directory/)
  })

  it('accepts the corrected setting and the render service as it is', () => {
    expect(
      check.configInsideRoot(
        'apps/vibee-editor',
        '/apps/vibee-editor/railway.toml'
      ).ok
    ).toBe(true)
    expect(
      check.configInsideRoot(
        'apps/vibee-editor',
        '/apps/vibee-editor/render/railway.toml'
      ).ok
    ).toBe(true)
  })

  /*
   * A service at the repository root may read any file; whether it is its OWN
   * is the [service] name check, not this one.
   */
  it('does not judge a service without a Root Directory by location', () => {
    expect(check.configInsideRoot(null, '/railway.toml').ok).toBe(true)
    expect(check.configInsideRoot('', '/railway.toml').ok).toBe(true)
  })

  it('does not mistake a sibling folder with a shared prefix for the root', () => {
    expect(
      check.configInsideRoot('apps/vibee', '/apps/vibee-editor/railway.toml').ok
    ).toBe(false)
  })

  it('treats a missing config as a problem, not as fine', () => {
    expect(check.configInsideRoot('apps/vibee-editor', undefined).ok).toBe(
      false
    )
  })
})

describe('reading the repository railway.toml files', () => {
  it("reads the bot's file: its name and the src patterns that caused the skips", () => {
    const bot = check.parseRailwayToml(read('railway.toml'))
    expect(bot.name).toBe('999-multibots-telegraf')
    expect(bot.patterns).toContain('src/**')
    expect(bot.patterns.some((p: string) => p.startsWith('apps/'))).toBe(false)
  })

  it("reads the mini app's own file, multi-line array and comments included", () => {
    const app = check.parseRailwayToml(read('apps/vibee-editor/railway.toml'))
    expect(app.name).toBe('vibee-editor')
    expect(app.patterns).toContain('apps/vibee-editor/player/**')
    expect(app.patterns).toContain('!apps/vibee-editor/player/**/*.test.ts')
  })

  it('says null, not an empty list, when a file sets no watchPatterns', () => {
    const render = check.parseRailwayToml(
      read('apps/vibee-editor/render/railway.toml')
    )
    expect(render.name).toBe('vibee-render')
    expect(render.patterns).toBeNull()
  })
})

describe('does a changed file trigger a deploy', () => {
  const app = check.parseRailwayToml(
    read('apps/vibee-editor/railway.toml')
  ).patterns
  const bot = check.parseRailwayToml(read('railway.toml')).patterns

  /*
   * The files from #2516, which was skipped. Under the bot's patterns they
   * trigger nothing -- that IS the defect -- and under the mini app's own they
   * trigger a build.
   */
  it('a player source change deploys the mini app and not the bot', () => {
    const f = 'apps/vibee-editor/player/src/components/Profile/ConnectCode.tsx'
    expect(check.watched(f, app)).toBe(true)
    expect(check.watched(f, bot)).toBe(false)
  })

  it('a player test alone deploys nothing: the later negation wins', () => {
    const t =
      'apps/vibee-editor/player/src/components/Profile/ConnectCode.test.tsx'
    expect(check.watched(t, app)).toBe(false)
  })

  it('a bot test does not redeploy the bot, a bot source file does', () => {
    expect(check.watched('src/__tests__/money/x.test.ts', bot)).toBe(false)
    expect(check.watched('src/services/crmProactive.ts', bot)).toBe(true)
  })

  it('reads single stars as one path segment', () => {
    expect(check.watched('tsconfig.base.json', ['tsconfig.*.json'])).toBe(true)
    expect(check.watched('a/tsconfig.base.json', ['tsconfig.*.json'])).toBe(
      false
    )
  })

  it('treats a dot as a dot, not as any character', () => {
    expect(check.watched('railwayXtoml', ['railway.toml'])).toBe(false)
  })
})
