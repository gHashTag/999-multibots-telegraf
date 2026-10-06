import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticate, isDiscoveryProbe, logsRefusal } from './auth'
import type { IncomingMessage } from 'node:http'

/**
 * AN MCP CLIENT LOOKING FOR AN OAUTH SERVER IS NOT AN ERROR.
 *
 * Production 2026-10-05: every MCP client connect fetched
 * /.well-known/oauth-protected-resource, /.well-known/oauth-authorization-server
 * and POSTed /register (dynamic client registration), and crawlers fetched
 * /robots.txt. The guard answered 401 -- correct, we run no OAuth server -- and
 * printed a refusal on stderr for each, which Railway files as an error. Those
 * lines buried real refusals.
 *
 * The 401 itself stays exactly as it was (pinned below); only the log line goes.
 */

const req = (
  method: string,
  url: string,
  headers: Record<string, string> = {}
) => ({ method, url, headers }) as unknown as IncomingMessage

const KEYS = ['RENDER_API_KEY', 'RENDER_AUTH_MODE'] as const
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k]
  process.env.RENDER_API_KEY = 'server-key-for-test' // secret-guard-ok: invented for this test
  process.env.RENDER_AUTH_MODE = 'enforce'
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

const PROBES: Array<[string, string]> = [
  ['GET', '/robots.txt'],
  ['GET', '/.well-known/oauth-protected-resource'],
  ['GET', '/.well-known/oauth-protected-resource/mcp'],
  ['GET', '/.well-known/oauth-authorization-server'],
  ['GET', '/.well-known/oauth-authorization-server/mcp?x=1'],
  ['HEAD', '/robots.txt'],
  ['POST', '/register'],
]

describe('OAuth discovery probes', () => {
  it.each(PROBES)('%s %s is still refused with 401, but not logged', (m, u) => {
    const r = req(m, u)
    const auth = authenticate(r)
    expect(auth.allowed).toBe(false)
    expect(auth.statusCode ?? 401).toBe(401)
    expect(isDiscoveryProbe(m, u)).toBe(true)
    expect(logsRefusal(r, auth)).toBe(false)
  })

  it('every other refusal is still logged', () => {
    for (const [m, u] of [
      ['GET', '/render/some-job/status'],
      ['POST', '/render'],
      ['GET', '/register'], // only POST is registration
      ['POST', '/robots.txt'],
      ['DELETE', '/.well-known/oauth-protected-resource'],
      ['GET', '/.well-known/oauth-protected-resourcex'],
      ['GET', '/.well-known/openid-configuration'],
      ['POST', '/register/extra'],
    ]) {
      const r = req(m, u)
      const auth = authenticate(r)
      expect(auth.wouldReject, `${m} ${u}`).toBe(true)
      expect(logsRefusal(r, auth), `${m} ${u}`).toBe(true)
    }
  })

  it('a probe that offered a credential which failed is still logged', () => {
    const r = req('POST', '/register', { 'x-telegram-init-data': 'forged=1' })
    const auth = authenticate(r)
    expect(auth.allowed).toBe(false)
    expect(logsRefusal(r, auth)).toBe(true)
  })

  it('a probe on a server with no key configured is still logged', () => {
    delete process.env.RENDER_API_KEY
    const r = req('GET', '/robots.txt')
    const auth = authenticate(r)
    expect(auth.wouldReject).toBe(true)
    expect(logsRefusal(r, auth)).toBe(true)
  })

  it('an admitted request is never logged as a refusal', () => {
    const r = req('POST', '/register', { 'x-api-key': 'server-key-for-test' })
    const auth = authenticate(r)
    expect(auth.allowed).toBe(true)
    expect(logsRefusal(r, auth)).toBe(false)
  })
})
