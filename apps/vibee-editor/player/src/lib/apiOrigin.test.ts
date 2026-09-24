import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { apiPreconnectOrigin } from './apiOrigin'

/**
 * A QUARTER OF A SECOND SPENT ON A HANDSHAKE NOBODY STARTED EARLY.
 *
 * Measured 2026-09-24 from a cold client: the render's origin costs 82 ms of
 * DNS and 198 ms of TLS, and neither begins until the first API call -- which
 * cannot happen until the HTML, the main bundle and the route chunk have all
 * arrived. `preconnect` moves it to the top of the page.
 *
 * Every case below is a way this could quietly become wrong: a host typed by
 * hand in two places, a connection opened to somewhere nobody will ask, or a
 * tag left behind after the API becomes same-origin.
 */

describe('what to preconnect to', () => {
  it('names the origin, not the whole url', () => {
    expect(apiPreconnectOrigin('https://api.example.com/api/v2?x=1')).toBe(
      'https://api.example.com'
    )
  })

  it('says nothing when the API is this same origin', () => {
    // Which is where the one-service question leads: then there is no second
    // handshake to save and the tag is dead weight.
    expect(
      apiPreconnectOrigin('https://app.t27.ai/api', 'https://app.t27.ai')
    ).toBeNull()
  })

  it('says nothing for a relative base', () => {
    // '/api' is already this origin -- there is no connection to open.
    expect(apiPreconnectOrigin('/api')).toBeNull()
    expect(apiPreconnectOrigin('')).toBeNull()
    expect(apiPreconnectOrigin(undefined)).toBeNull()
  })

  it('says nothing rather than guessing at a broken value', () => {
    // A preconnect to nowhere is a silent cost: the browser opens a connection
    // and nothing ever uses it.
    expect(apiPreconnectOrigin('http://')).toBeNull()
    expect(apiPreconnectOrigin('not a url')).toBeNull()
  })

  it('keeps the port, because a different port is a different connection', () => {
    expect(apiPreconnectOrigin('http://localhost:4000/api')).toBe(
      'http://localhost:4000'
    )
  })
})

describe('the host has one home', () => {
  const HTML = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8')

  it('is not typed into index.html', () => {
    // It used to be: a hand-written dns-prefetch for the render's Railway host
    // sat there while VITE_API_URL decided where the app actually calls. Two
    // homes for one value, and the copy cannot be wrong loudly.
    expect(HTML).not.toContain('vibee-render')
    expect(HTML).not.toMatch(/dns-prefetch[^>]*railway/)
  })

  it('and the build still preconnects to the fonts it does hardcode', () => {
    // Those are third-party and not configurable, so a literal is right there.
    expect(HTML).toContain(
      'rel="preconnect" href="https://fonts.googleapis.com"'
    )
  })
})
