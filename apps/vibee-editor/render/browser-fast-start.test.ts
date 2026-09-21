import { describe, it, expect } from 'vitest'
import {
  cachePolicyFor,
  EMPTY_EMOJI,
  posterOf,
  YEAR_IMMUTABLE,
} from './src/browser/fast-start'
import { BOOT_HTML, BRAND_CSS } from './src/browser/skin'

/**
 * THE WINDOW OPENS FAST, AND OPENS FASTER THE SECOND TIME.
 */

describe('what is cached for a year', () => {
  it('CACHES THE ENGINE BUNDLES, whose names carry their content hash', () => {
    for (const path of [
      '/js/app.48a1d8f5.js',
      '/js/chunk-vendors.025e045d.js',
      '/css/app.497e53ca.css',
      '/img/logo.800bec71.svg',
      '/fonts/fa-solid-900.1a2b3c4d.woff2',
    ])
      expect(cachePolicyFor('GET', path), path).toBe(YEAR_IMMUTABLE)
  })

  it('NEVER CACHES WHAT CAN CHANGE', () => {
    for (const path of [
      '/',
      '/?usr=you&pwd=x',
      '/api/login',
      '/ws',
      '/emoji.json',
      '/keyboard_layouts.json',
      '/js/app.js',
      '/__poster',
    ])
      expect(cachePolicyFor('GET', path), path).toBeNull()
  })

  it('caches only reads', () => {
    expect(cachePolicyFor('POST', '/js/app.48a1d8f5.js')).toBeNull()
  })
})

describe('the emoji the window hides', () => {
  it('is an empty set in the shape the engine reads at start', () => {
    /* neko: for (const t of e.data.groups) ... setList(e.data.list) ... */
    expect(JSON.parse(EMPTY_EMOJI)).toEqual({
      groups: [],
      list: [],
      keywords: {},
    })
  })
})

describe('the poster', () => {
  const page = { id: 'tab-1' }

  it('IS THE PAGE AS IT IS NOW, as JPEG bytes', async () => {
    const jpeg = await posterOf('pod:9223', {
      front: async () => page,
      shot: async (_e, id) => {
        expect(id).toBe('tab-1')
        return Buffer.from('JPEG').toString('base64')
      },
    })
    expect(jpeg?.toString()).toBe('JPEG')
  })

  it('is nothing without a way to reach the browser', async () => {
    expect(await posterOf(null)).toBeNull()
  })

  it('NEVER THROWS: no page, no poster', async () => {
    expect(
      await posterOf('pod:9223', {
        front: async () => {
          throw new Error('the browser has no page open')
        },
        shot: async () => '',
      })
    ).toBeNull()
  })

  it('DOES NOT MAKE THE LOADER WAIT for a slow browser', async () => {
    const started = Date.now()
    const never = new Promise<never>(() => {})
    const got = await posterOf(
      'pod:9223',
      { front: async () => page, shot: () => never },
      50
    )
    expect(got).toBeNull()
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('stands under the loader, and leaves when there is none', () => {
    expect(BOOT_HTML).toContain('class="poster" src="__poster"')
    expect(BOOT_HTML).toContain('onerror="this.remove()"')
    expect(BRAND_CSS).toMatch(/#t27-boot img\.poster \{[^}]*z-index: 0/)
  })
})

describe('through the real proxy, against a pod that sends no policy', () => {
  it('KEEPS THE DOCUMENT FRESH AND THE BUNDLES FOR A YEAR', async () => {
    const http = await import('node:http')
    const { pipeHttp } = await import('./src/browser/live-pipe')

    /* The pod: neko's file server, Last-Modified and no Cache-Control. */
    const pod = http.createServer((req, res) => {
      const html = (req.url || '').startsWith('/?') || req.url === '/'
      res.writeHead(200, {
        'Content-Type': html ? 'text/html' : 'application/javascript',
        'Last-Modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
      })
      res.end(html ? '<html><head></head><body></body></html>' : 'x()')
    })
    await new Promise<void>(r => pod.listen(0, '127.0.0.1', r))
    const podPort = (pod.address() as { port: number }).port

    const proxy = http.createServer((req, res) =>
      pipeHttp(
        {
          endpoint: `127.0.0.1:${podPort}`,
          upstreamPath: req.url || '/',
          sessionId: 'sessAbCd1234',
          viewToken: 'x',
        },
        req,
        res
      )
    )
    await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`

    try {
      const doc = await fetch(`${base}/?usr=you&pwd=x`)
      expect(doc.headers.get('cache-control')).toBe('no-cache')
      expect(doc.headers.get('last-modified')).toBeNull()
      expect(await doc.text()).toContain('data-t27-skin')

      const bundle = await fetch(`${base}/js/app.48a1d8f5.js`)
      expect(bundle.headers.get('cache-control')).toBe(YEAR_IMMUTABLE)

      const plain = await fetch(`${base}/keyboard_layouts.json`)
      expect(plain.headers.get('cache-control')).toBeNull()
    } finally {
      proxy.close()
      pod.close()
    }
  })
})
