/**
 * ONE ROUTE TABLE IN FOUR FILES, READ FROM SOURCE.
 *
 * The bot (src/navigation/helpers/appLinks.ts), the render
 * (apps/vibee-editor/render/src/app-links.ts) and the player
 * (apps/vibee-editor/player/src/lib/appLink.ts) each build links to the app,
 * and the player's START_PARAM_ROUTES decides where a start parameter lands.
 * Three packages cannot import one another, so the table is mirrored -- and a
 * mirror drifts silently: a route the player does not know opens the feed.
 * This reads every copy as text and fails on the first difference.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  APP_ROUTES,
  APP_HOSTS,
  APP_NON_SCREEN_PREFIXES,
  APP_START_PREFIX,
  UNLINKABLE_APP_ROUTES,
} from '@/navigation/helpers/appLinks'

const ROOT = path.join(__dirname, '..', '..', '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** The string items of `export const <name> = [ ... ]` in a source file. */
function arrayLiteral(src: string, name: string): string[] {
  const m = new RegExp(
    `export const ${name}(?::[^=]+)?\\s*=\\s*\\[([\\s\\S]*?)\\]`
  ).exec(src)
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

function stringConst(src: string, name: string): string | null {
  return (
    new RegExp(`export const ${name}\\s*=\\s*'([^']*)'`).exec(src)?.[1] ?? null
  )
}

/** Keys of START_PARAM_ROUTES, the same shape startParamContract.test reads. */
function playerRouteKeys(): string[] {
  const src = read(
    'apps/vibee-editor/player/src/components/Telegram/TelegramProvider.tsx'
  )
  const body = /const START_PARAM_ROUTES[^{]*\{([\s\S]*?)\n\}/.exec(src)?.[1]
  if (!body) return []
  return [...body.matchAll(/^\s{2}([a-z_]+):\s*'\//gm)].map(m => m[1])
}

const RENDER = 'apps/vibee-editor/render/src/app-links.ts'
const PLAYER = 'apps/vibee-editor/player/src/lib/appLink.ts'

describe('the app route table is one table', () => {
  it('the scan finds every copy (a regex matching nothing would pass all)', () => {
    expect(APP_ROUTES.length).toBeGreaterThan(10)
    expect(arrayLiteral(read(RENDER), 'APP_ROUTES').length).toBeGreaterThan(10)
    expect(arrayLiteral(read(PLAYER), 'APP_ROUTES').length).toBeGreaterThan(10)
    expect(playerRouteKeys().length).toBeGreaterThan(10)
  })

  it('bot, render and player list the same routes', () => {
    const bot = [...APP_ROUTES].sort()
    expect(arrayLiteral(read(RENDER), 'APP_ROUTES').sort()).toEqual(bot)
    expect(arrayLiteral(read(PLAYER), 'APP_ROUTES').sort()).toEqual(bot)
  })

  it('every route is one the player actually opens, and none is missing', () => {
    expect(playerRouteKeys().sort()).toEqual([...APP_ROUTES].sort())
  })

  it('all three copies refuse the same screens to a link', () => {
    // A mirror that still builds `?start=app_pair` is a mirror that hands out
    // a sign-in code; the set must be one set in all three files.
    const bot = [...UNLINKABLE_APP_ROUTES].sort()
    expect(bot.length).toBeGreaterThan(0)
    expect(bot.every(r => (APP_ROUTES as readonly string[]).includes(r))).toBe(
      true
    )
    expect(arrayLiteral(read(RENDER), 'UNLINKABLE_APP_ROUTES').sort()).toEqual(
      bot
    )
    expect(arrayLiteral(read(PLAYER), 'UNLINKABLE_APP_ROUTES').sort()).toEqual(
      bot
    )
  })

  it('the /start prefix and the app hosts agree', () => {
    expect(stringConst(read(RENDER), 'APP_START_PREFIX')).toBe(APP_START_PREFIX)
    expect(stringConst(read(PLAYER), 'APP_START_PREFIX')).toBe(APP_START_PREFIX)
    expect(arrayLiteral(read(RENDER), 'APP_HOSTS').sort()).toEqual(
      [...APP_HOSTS].sort()
    )
  })

  it('bot and render leave the same file URLs alone', () => {
    // One side that still rewrites /covers/ turns a working picture link into
    // a t.me link -- on the render only, which is where the reels are made.
    const bot = [...APP_NON_SCREEN_PREFIXES].sort()
    expect(bot.length).toBeGreaterThan(5)
    expect(
      arrayLiteral(read(RENDER), 'APP_NON_SCREEN_PREFIXES').sort()
    ).toEqual(bot)
    const ext = (src: string) =>
      /const FILE_EXT_RE\s*=\s*(\/[^\n]*\/)/.exec(src)?.[1] ?? null
    const botExt = ext(read('src/navigation/helpers/appLinks.ts'))
    expect(botExt).toBeTruthy()
    expect(ext(read(RENDER))).toBe(botExt)
  })

  it('bot and render end a raw app URL at the same character', () => {
    // The URL body of rewriteAppUrls: one copy that still ran on through
    // closing marks would put the review-of-#2870 bug back on one side only.
    const body = (src: string) =>
      /const APP_URL_BODY\s*=\s*'([^']*)'/.exec(src)?.[1] ?? null
    const bot = body(read('src/navigation/helpers/appLinks.ts'))
    expect(bot).toBeTruthy()
    expect(body(read(RENDER))).toBe(bot)
  })
})
