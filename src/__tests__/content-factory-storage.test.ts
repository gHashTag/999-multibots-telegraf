import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { putBytes } from '@/services/contentFactory/storage'

/**
 * THE SHELF THE BOT UPLOADS TO.
 *
 * Both properties here were REAL failures found on the live Railway service on
 * 2026-09-07, and both failed the same treacherous way: the upload threw, the
 * caller caught it, and the person was told politely that the file "did not
 * save on our side". A refusal that arrives calmly on every single file reads
 * as a working feature.
 */

const ORIGINAL = { ...process.env }

beforeEach(() => {
  process.env.RENDER_API_KEY = 'k'
  delete process.env.RENDER_SERVER_URL
  delete process.env.VIBEE_RENDER_URL
  delete process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL
})

afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.unstubAllGlobals()
})

function captureFetch() {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: any) => {
      calls.push({ url: String(url), headers: init.headers })
      return {
        ok: true,
        text: async () => JSON.stringify({ success: true, url: '/s3/x' }),
      }
    })
  )
  return calls
}

describe('the shelf address', () => {
  /*
   * Railway sets RAILWAY_SERVICE_VIBEE_RENDER_URL to a BARE HOST, with no
   * scheme, and it is the only one of the three set on the bot's service.
   * `fetch` cannot parse that: "Failed to parse URL from vibee-render-…".
   */
  it('a bare Railway host still produces a usable URL', async () => {
    process.env.RAILWAY_SERVICE_VIBEE_RENDER_URL =
      'vibee-render-production.up.railway.app'
    const calls = captureFetch()
    await putBytes(Buffer.from([1]), 'a.jpg')
    expect(calls[0].url).toBe(
      'https://vibee-render-production.up.railway.app/upload'
    )
    // The real proof: the URL parses at all.
    expect(() => new URL(calls[0].url)).not.toThrow()
  })

  it('an address that already has a scheme is left alone', async () => {
    process.env.RENDER_SERVER_URL = 'http://localhost:4000'
    const calls = captureFetch()
    await putBytes(Buffer.from([1]), 'a.jpg')
    expect(calls[0].url).toBe('http://localhost:4000/upload')
  })

  it('a trailing slash does not become a double slash', async () => {
    process.env.RENDER_SERVER_URL = 'https://shelf.example/'
    const calls = captureFetch()
    await putBytes(Buffer.from([1]), 'a.jpg')
    expect(calls[0].url).toBe('https://shelf.example/upload')
  })
})

describe('the file name in the header', () => {
  /*
   * An HTTP header value must be Latin-1. A Cyrillic file name -- routine for
   * documents arriving from Telegram -- throws inside `new Headers` before a
   * single byte leaves the process.
   */
  it('a Cyrillic name is percent-encoded, not thrown on', async () => {
    process.env.RENDER_SERVER_URL = 'https://shelf.example'
    const calls = captureFetch()
    await putBytes(Buffer.from([1]), 'Договор.pdf')
    const value = calls[0].headers['X-Filename']
    expect(value).toBe(encodeURIComponent('Договор.pdf'))
    // The header value must survive the Headers constructor, which is where
    // the original code died.
    expect(() => new Headers({ 'X-Filename': value })).not.toThrow()
    // And the server decodes it back to the same name.
    expect(decodeURIComponent(value)).toBe('Договор.pdf')
  })

  it('an ASCII name survives a round trip unchanged', async () => {
    process.env.RENDER_SERVER_URL = 'https://shelf.example'
    const calls = captureFetch()
    await putBytes(Buffer.from([1]), 'report.pdf')
    expect(decodeURIComponent(calls[0].headers['X-Filename'])).toBe(
      'report.pdf'
    )
  })
})
