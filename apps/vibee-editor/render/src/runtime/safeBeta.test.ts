import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  enforceSafeBetaHttpLock,
  runSafeBetaPublishingAction,
  SAFE_BETA_LOCKED,
  safeBetaHttpDecision,
  safeBetaStatus,
} from './safeBeta'

describe('SAFE BETA release lock', () => {
  it('cannot be disabled by environment configuration', () => {
    process.env.TRINITY_SAFE_BETA = '0'
    expect(SAFE_BETA_LOCKED).toBe(true)
    expect(safeBetaStatus()).toEqual({
      locked: true,
      paidGeneration: false,
      rendering: false,
      charges: false,
      publishing: false,
      externalActions: false,
      approvals: false,
    })
  })

  it.each([
    ['/api/generate/image', 'paid-generation-disabled'],
    ['/api/generate/audio?voice=example', 'paid-generation-disabled'],
    ['/api/ai/generate-script', 'paid-generation-disabled'],
    ['/api/agent/chat', 'paid-generation-disabled'],
    ['/render', 'render-disabled'],
    ['/render/template', 'render-disabled'],
    ['/api/feed/publish', 'publishing-disabled'],
    ['/api/feed/42/star', 'publishing-disabled'],
    ['/api/tokens/invoice', 'charges-disabled'],
    ['/api/tokens/verify', 'charges-disabled'],
    ['/api/star-paid', 'charges-disabled'],
    ['/api/telegram/stars-wh/example-secret', 'charges-disabled'],
    ['/api/notify/lead', 'external-action-disabled'],
    ['/api/assets/owner-from-client', 'external-action-disabled'],
    ['/api/agent/access/issue', 'approval-path-disabled'],
    ['/api/agent/approvals/42', 'approval-path-disabled'],
  ] as const)('blocks POST %s before its handler', (path, reason) => {
    expect(safeBetaHttpDecision('POST', path)).toEqual({
      blocked: true,
      reason,
    })
  })

  it.each([
    ['GET', '/api/feed'],
    ['GET', '/api/users/me'],
    ['POST', '/mcp'],
    ['POST', '/api/users/me'],
  ] as const)(
    'leaves the read/draft beta route %s %s to its own guard',
    (method, path) => {
      expect(safeBetaHttpDecision(method, path)).toEqual({ blocked: false })
    }
  )

  it.each([
    ['POST', '/api/assets'],
    ['PUT', '/api/profile'],
    ['PATCH', '/api/unknown-future-handler'],
    ['DELETE', '/api/assets?id=7'],
  ] as const)(
    'fails closed for an unreviewed write route %s %s',
    (method, path) => {
      expect(safeBetaHttpDecision(method, path)).toEqual({
        blocked: true,
        reason: 'external-action-disabled',
      })
    }
  )

  it('blocks payment verification for every attempted HTTP verb', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      expect(safeBetaHttpDecision(method, '/api/tokens/verify')).toEqual({
        blocked: true,
        reason: 'charges-disabled',
      })
    }
  })

  it('blocks the client-addressed assets feature for every HTTP verb', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE']) {
      for (const path of [
        '/api/assets/client-supplied-owner?limit=1',
        '/assets',
      ]) {
        expect(safeBetaHttpDecision(method, path)).toEqual({
          blocked: true,
          reason: 'external-action-disabled',
        })
      }
    }
  })

  it('stops legacy assets before body, database or handler dispatch', () => {
    const bodyRead = vi.fn()
    const getPool = vi.fn()
    const routeHandler = vi.fn(() => {
      bodyRead()
      getPool()
    })
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    }

    const handled = enforceSafeBetaHttpLock(
      'GET',
      '/api/assets/client-supplied-owner',
      response
    )
    if (!handled) routeHandler()

    expect(handled).toBe(true)
    expect(routeHandler).not.toHaveBeenCalled()
    expect(bodyRead).not.toHaveBeenCalled()
    expect(getPool).not.toHaveBeenCalled()
  })

  it('answers blocked payment requests before body or route dispatch', () => {
    const bodyRead = vi.fn()
    const fetchPaymentProvider = vi.fn()
    const getPool = vi.fn()
    const answerPreCheckoutQuery = vi.fn()
    const routeHandler = vi.fn(() => {
      bodyRead()
      fetchPaymentProvider()
      getPool()
      answerPreCheckoutQuery()
    })
    const response = {
      writeHead: vi.fn(),
      end: vi.fn(),
    }

    process.env.RENDER_AUTH_MODE = 'warn'
    const handled = enforceSafeBetaHttpLock(
      'POST',
      '/api/telegram/stars-wh/example-secret',
      response
    )
    if (!handled) routeHandler()

    expect(handled).toBe(true)
    expect(response.writeHead).toHaveBeenCalledWith(403, {
      'Content-Type': 'application/json',
    })
    expect(routeHandler).not.toHaveBeenCalled()
    expect(bodyRead).not.toHaveBeenCalled()
    expect(fetchPaymentProvider).not.toHaveBeenCalled()
    expect(getPool).not.toHaveBeenCalled()
    expect(answerPreCheckoutQuery).not.toHaveBeenCalled()
  })

  it('keeps automatic publishing unreachable outside the HTTP router', async () => {
    const publishToFeed = vi.fn(async () => true)

    await expect(
      runSafeBetaPublishingAction(publishToFeed)
    ).resolves.toBeUndefined()
    expect(publishToFeed).not.toHaveBeenCalled()
  })

  it('places the artifact lock after auth and before route dispatch', () => {
    const source = readFileSync(
      new URL('../../render-server.ts', import.meta.url),
      'utf8'
    )
    const server = source.slice(source.indexOf('const server = createServer'))
    const auth = server.indexOf('const auth = authenticate(req)')
    const lock = server.indexOf(
      'enforceSafeBetaHttpLock(req.method, req.url, res)'
    )
    const firstSideEffectRoute = server.indexOf("'/api/notify/lead'")

    expect(auth).toBeGreaterThanOrEqual(0)
    expect(lock).toBeGreaterThan(auth)
    expect(firstSideEffectRoute).toBeGreaterThan(lock)
  })

  it('wraps every render completion autopublish in the immutable lock', () => {
    const source = readFileSync(
      new URL('../../render-server.ts', import.meta.url),
      'utf8'
    )
    expect(source).not.toMatch(/await\s+publishToFeed\s*\(/)
    expect(
      source.match(
        /runSafeBetaPublishingAction\(\(\)\s*=>\s*\n?\s*publishToFeed\s*\(/g
      )
    ).toHaveLength(3)
  })

  it('excludes manual paid/publish agents from the production Docker context', () => {
    const dockerIgnore = readFileSync(
      new URL('../../../.dockerignore', import.meta.url),
      'utf8'
    )
    expect(dockerIgnore).toContain('render/scripts/agent-autopilot.ts')
    expect(dockerIgnore).toContain('render/scripts/morning-summary.ts')
  })
})
