import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { authenticate, hasServerKey } from './auth'
import {
  agentKeyOwner,
  chatIdentity,
  resolveAgentIdentity,
  resolveIdentity,
} from './src/agent/routes'

const KEY = 'editorial-test-credential'
const OWNER = '123456789'
const req = (
  url = '/mcp',
  headers: Record<string, string | string[] | undefined> = {
    'x-agent-key': KEY,
  },
  method = 'POST'
) => ({ url, headers, method }) as IncomingMessage

beforeEach(() => {
  vi.stubEnv('LEELA_EDITORIAL_AGENT_KEYS', `${KEY}:${OWNER}`)
  vi.stubEnv('AGENT_KEYS', 'full-test-credential:987654321')
  vi.stubEnv('RENDER_API_KEY', 'server-test-credential')
  vi.stubEnv('RENDER_AUTH_MODE', 'warn')
  vi.stubEnv('RAILWAY_GIT_COMMIT_SHA', '')
  vi.stubEnv('RAILWAY_ENVIRONMENT', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('editorial scope before public and credential precedence', () => {
  it.each([
    '/api/agent/chat',
    '/a2a',
    '/api/soul/playom',
    '/api/agent/keys',
    '/api/feed/pending',
    '/api/tokens/balance',
    '/api/projects',
    '/mcp/other',
    '/api/render',
    '/',
    '/mcp/../api/agent/chat',
  ])('denies %s even in warn mode', async path => {
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const request = req(path, undefined, method)
      expect(authenticate(request)).toMatchObject({
        allowed: false,
        statusCode: 403,
      })
      const pool = vi.fn()
      expect(await resolveIdentity(request, pool)).toBeNull()
      expect(chatIdentity(request, '987654321')).toBeNull()
      expect(pool).not.toHaveBeenCalled()
    }
  })

  it.each(['PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])(
    'denies unsupported MCP method %s',
    method => {
      expect(authenticate(req('/mcp', undefined, method))).toMatchObject({
        allowed: false,
        statusCode: 403,
      })
    }
  )

  it.each([
    '/mcp',
    '/health',
    '/.well-known/agent-card.json',
    '/.well-known/agent.json',
  ])('allows harmless GET %s', path => {
    expect(authenticate(req(path, undefined, 'GET'))).toMatchObject({
      allowed: true,
      scope: 'leela-editorial',
    })
  })

  it('binds MCP to configured identity without a database fallback', async () => {
    const request = req('/mcp?telegram_id=987654321')
    expect(authenticate(request)).toMatchObject({
      allowed: true,
      telegramId: OWNER,
      scope: 'leela-editorial',
    })
    const pool = vi.fn()
    expect(await resolveAgentIdentity(request, pool)).toEqual({
      telegramId: OWNER,
      scope: 'leela-editorial',
    })
    // Legacy string-only resolvers cannot discard the scope.
    expect(await resolveIdentity(request, pool)).toBeNull()
    expect(pool).not.toHaveBeenCalled()
  })

  it.each([
    'x-api-key',
    'authorization',
    'x-telegram-init-data',
    'x-telegram-initdata',
  ])(
    'rejects editorial key under %s, even alongside a valid full key',
    async header => {
      for (const value of [KEY, `Bearer ${KEY}`]) {
        const request = req('/mcp', {
          [header]: value,
          'x-agent-key': 'full-test-credential',
        })
        expect(authenticate(request)).toMatchObject({
          allowed: false,
          statusCode: 403,
        })
        expect(await resolveAgentIdentity(request, vi.fn())).toBeNull()
        expect(hasServerKey(request)).toBe(false)
      }
    }
  )

  it.each([
    { 'x-api-key': 'server-test-credential' },
    { authorization: 'Bearer unrelated-session' },
    { 'x-telegram-init-data': 'unrelated-signature' },
    { 'x-telegram-initdata': 'unrelated-signature' },
  ])('rejects mixed credentials %j', extra => {
    expect(
      authenticate(req('/mcp', { 'x-agent-key': KEY, ...extra }))
    ).toMatchObject({ allowed: false, statusCode: 403 })
  })

  it('rejects duplicate and combined header values', () => {
    for (const value of [[KEY, KEY], `${KEY}, full-test-credential`]) {
      expect(authenticate(req('/mcp', { 'x-agent-key': value }))).toMatchObject(
        { allowed: false, statusCode: 403 }
      )
    }
    const request = req()
    request.rawHeaders = ['X-Agent-Key', KEY, 'X-Agent-Key', KEY]
    expect(authenticate(request).allowed).toBe(false)
    const discarded = req('/mcp', {
      'x-agent-key': 'full-test-credential',
      authorization: 'Bearer unrelated-session',
    })
    discarded.rawHeaders = [
      'X-Agent-Key',
      'full-test-credential',
      'Authorization',
      'Bearer unrelated-session',
      'Authorization',
      `Bearer ${KEY}`,
    ]
    expect(authenticate(discarded).allowed).toBe(false)
  })

  it('never upgrades a collision with full agent/server credentials', async () => {
    vi.stubEnv('AGENT_KEYS', `${KEY}:987654321`)
    vi.stubEnv('RENDER_API_KEY', KEY)
    expect(agentKeyOwner(KEY)).toBeNull()
    expect(hasServerKey(req('/mcp', { 'x-api-key': KEY }))).toBe(false)
    expect(authenticate(req('/api/render')).allowed).toBe(false)
    expect(await resolveAgentIdentity(req(), vi.fn())).toEqual({
      telegramId: OWNER,
      scope: 'leela-editorial',
    })
  })

  it.each([
    `${KEY}:not-a-number`,
    `${KEY}:`,
    `${KEY}:${OWNER}:extra`,
    `${KEY}:${OWNER},${KEY}:987654321`,
    KEY,
  ])('fails closed for malformed binding %s', async binding => {
    vi.stubEnv('LEELA_EDITORIAL_AGENT_KEYS', binding)
    vi.stubEnv('AGENT_KEYS', `${KEY}:987654321`)
    expect(authenticate(req()).allowed).toBe(false)
    expect(await resolveAgentIdentity(req(), vi.fn())).toBeNull()
  })

  it('retains full credential behavior and no editorial marker', async () => {
    const request = req('/api/tokens/balance', {
      'x-agent-key': 'full-test-credential',
    })
    expect(authenticate(request)).toMatchObject({
      allowed: true,
      via: 'agent-key',
      telegramId: '987654321',
    })
    expect(authenticate(request).scope).toBeUndefined()
    expect(await resolveAgentIdentity(request, vi.fn())).toEqual({
      telegramId: '987654321',
      scope: 'full',
    })
  })

  it.each([
    '1',
    '101',
    '9999',
    '10000',
    '4503599627370495',
    '9007199254740991',
  ])(
    'accepts the canonical positive safe-integer actor %s',
    async telegramId => {
      vi.stubEnv('LEELA_EDITORIAL_AGENT_KEYS', `${KEY}:${telegramId}`)
      expect(authenticate(req())).toMatchObject({
        allowed: true,
        telegramId,
        scope: 'leela-editorial',
      })
      expect(await resolveAgentIdentity(req(), vi.fn())).toEqual({
        telegramId,
        scope: 'leela-editorial',
      })
    }
  )

  it.each([
    '0',
    '01',
    '+1',
    '-1',
    '1.0',
    '1e2',
    '1 01',
    '１２３',
    '9007199254740992',
    '9999999999999999',
    '10000000000000000',
  ])(
    'rejects noncanonical or unsafe actor %s without full-key fallback',
    async owner => {
      vi.stubEnv('LEELA_EDITORIAL_AGENT_KEYS', `${KEY}:${owner}`)
      vi.stubEnv('AGENT_KEYS', `${KEY}:987654321`)
      expect(authenticate(req())).toMatchObject({
        allowed: false,
        statusCode: 403,
      })
      expect(await resolveAgentIdentity(req(), vi.fn())).toBeNull()
    }
  )
})
