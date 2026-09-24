import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE THIRD OF A SECOND NOBODY WAS COUNTING.
 *
 * MEASURED 2026-09-24 against production. An OPTIONS preflight to
 * /api/my-bots on vibee-render answered in 328 ms and carried no
 * Access-Control-Max-Age, so a browser is entitled to ask again almost
 * immediately -- Chromium's fallback is FIVE SECONDS.
 *
 * Every call the player makes sends X-Telegram-Init-Data, which is not a
 * CORS-safelisted request header, so every one of them is preflighted. On a
 * screen that makes four calls that is over a second of pure handshake, paid
 * on a phone, repeatedly, for an answer that is a constant in the server.
 *
 * WHY A TEST AND NOT JUST THE HEADER. Because the header is invisible when it
 * works and nobody will ever look at it again. This test is the only thing that
 * will notice if it is dropped in a refactor -- and the cost of dropping it is
 * not a broken page, it is a slow one, which no other test measures.
 *
 * When the app is served from the same origin as the API, preflights stop
 * existing and this becomes dead weight; delete it together with the second
 * origin, not before.
 */

const SERVER = readFileSync(join(__dirname, 'render-server.ts'), 'utf8')

describe('a preflight is answered once, not once per call', () => {
  it('tells the browser how long it may remember the CORS answer', () => {
    expect(SERVER).toMatch(
      /setHeader\(\s*'Access-Control-Max-Age',\s*'(\d+)'\s*\)/
    )
  })

  it('asks for a day, which is what browsers actually cap at', () => {
    const m = SERVER.match(
      /setHeader\(\s*'Access-Control-Max-Age',\s*'(\d+)'\s*\)/
    )
    const seconds = Number(m?.[1])
    // Under an hour and the tax comes back on any longer session; over a day
    // and every browser silently clamps it, which is a number that lies.
    expect(seconds).toBeGreaterThanOrEqual(3600)
    expect(seconds).toBeLessThanOrEqual(86400)
  })

  it('sits with the other CORS headers, so it cannot be set after a reply', () => {
    // A header written after writeHead never reaches the browser. This one is
    // in the same block as Allow-Headers, before any route can answer.
    const allow = SERVER.indexOf("'Access-Control-Allow-Headers'")
    const maxAge = SERVER.indexOf("'Access-Control-Max-Age'")
    const firstWriteHead = SERVER.indexOf('res.writeHead', allow)
    expect(maxAge).toBeGreaterThan(allow)
    expect(maxAge).toBeLessThan(firstWriteHead)
  })
})
