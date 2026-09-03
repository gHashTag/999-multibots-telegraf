// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import generateScriptHandler, {
  SAFE_BETA_LOCKED as VERCEL_SAFE_BETA_LOCKED,
} from '../../../api/generate-script'

const mediaServerSource = readFileSync(
  new URL('../../../script-server.mjs', import.meta.url),
  'utf8'
)
const scriptServerSource = readFileSync(
  new URL('../../../script-server.js', import.meta.url),
  'utf8'
)
const vercelHandlerSource = readFileSync(
  new URL('../../../api/generate-script.ts', import.meta.url),
  'utf8'
)
const simpleWorkerUrl = new URL('../../../simple-worker.js', import.meta.url)
const cloudflareWorkerUrl = new URL(
  '../../../cloudflare-script-worker.js',
  import.meta.url
)
const simpleWorkerSource = readFileSync(simpleWorkerUrl, 'utf8')
const cloudflareWorkerSource = readFileSync(cloudflareWorkerUrl, 'utf8')

function expectImmutableLock(source: string) {
  expect(source).toContain('SAFE_BETA_LOCKED = true')
  expect(source).toContain("error: 'SAFE_BETA_PAID_DISABLED'")
}

function expectGuardBefore(source: string, ...dispatchMarkers: string[]) {
  const guardIndex = source.indexOf('if (SAFE_BETA_LOCKED')
  expect(guardIndex).toBeGreaterThan(-1)

  for (const marker of dispatchMarkers) {
    const markerIndex = source.indexOf(marker)
    expect(markerIndex, `missing marker: ${marker}`).toBeGreaterThan(-1)
    expect(guardIndex, `guard must precede: ${marker}`).toBeLessThan(
      markerIndex
    )
  }
}

describe('legacy paid handlers SAFE BETA lock', () => {
  it('guards every media-server dispatch before selecting a handler', () => {
    const router = mediaServerSource.slice(
      mediaServerSource.indexOf('const server = http.createServer')
    )

    expectImmutableLock(mediaServerSource)
    expectGuardBefore(
      router,
      'handleImageGen(req, res)',
      'handleVideoStart(req, res)',
      'handleVideoPoll(req, res)',
      'handleScriptGen(req, res)',
      'handleTTS(req, res)',
      'handleSTT(req, res)'
    )
    expect(router).toContain("path !== '/health'")
  })

  it('guards the standalone script server before body or provider work', () => {
    const server = scriptServerSource.slice(
      scriptServerSource.indexOf('const server = http.createServer')
    )

    expectImmutableLock(scriptServerSource)
    expectGuardBefore(server, "req.on('data'", 'http.request(')
    expect(scriptServerSource).not.toContain('process.exit(')
  })

  it('guards the serverless handler before method dispatch, body, and fetch', () => {
    expectImmutableLock(vercelHandlerSource)
    expectGuardBefore(
      vercelHandlerSource,
      "if (req.method !== 'POST')",
      'req.body',
      'fetch('
    )
    expect(vercelHandlerSource).not.toContain('process.exit(')
  })

  it.each([
    ['simple worker', simpleWorkerSource],
    ['wrangler worker', cloudflareWorkerSource],
  ])(
    'guards the deployable %s before request parsing or provider fetch',
    (_label, source) => {
      expectImmutableLock(source)
      expectGuardBefore(
        source.slice(source.indexOf('async fetch')),
        'request.method',
        'await fetch('
      )
    }
  )

  it.each([
    ['simple worker', simpleWorkerUrl],
    ['wrangler worker', cloudflareWorkerUrl],
  ])(
    'runtime-denies the %s without reading env/request or calling fetch',
    async (_label, url) => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      let requestRead = false
      let envRead = false
      const request = new Proxy(
        {},
        {
          get() {
            requestRead = true
            throw new Error('request must remain unread')
          },
        }
      )
      const env = new Proxy(
        {},
        {
          get() {
            envRead = true
            throw new Error('env must remain unread')
          },
        }
      )
      const worker = (await import(url.href)).default

      const response = await worker.fetch(request, env, {})

      expect(response.status).toBe(423)
      await expect(response.json()).resolves.toMatchObject({
        error: 'SAFE_BETA_PAID_DISABLED',
      })
      expect(requestRead).toBe(false)
      expect(envRead).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  )

  it('denies a runtime request without reading body or calling fetch', async () => {
    expect(VERCEL_SAFE_BETA_LOCKED).toBe(true)

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    let bodyRead = false
    const request = {
      method: 'POST',
      get body() {
        bodyRead = true
        throw new Error('body must remain unread')
      },
    }
    const response = {
      setHeader: vi.fn(),
      status: vi.fn(),
      json: vi.fn(),
      end: vi.fn(),
    }
    response.status.mockReturnValue(response)

    await generateScriptHandler(request as never, response as never)

    expect(response.status).toHaveBeenCalledWith(423)
    expect(response.json).toHaveBeenCalledWith({
      error: 'SAFE_BETA_PAID_DISABLED',
    })
    expect(bodyRead).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
