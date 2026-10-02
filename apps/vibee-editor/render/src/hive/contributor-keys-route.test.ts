import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  signAccessToken,
  signGameToken,
  setRevokedSessions,
} from '../../session'
import {
  contributorKeyPath,
  contributorRequestIdentity,
  handleContributorKeys,
  readContributorBody,
  safeContributorResponse,
} from './contributor-keys-route'

const work = { xp: 320, accepted: 1, specs: 1, finished: 2, hours: 2 }
const key = {
  id: -1,
  provider: 'nvidia',
  label: 'My key',
  fingerprint: 'abcdef123456',
  model: 'test-model',
  enabled: true,
  createdAt: '2026-10-01T00:00:00Z',
  lastProbe: { status: 'ok', checkedAt: '2026-10-01T00:00:00Z', latencyMs: 20 },
  contribution: work,
}
const listing = {
  keys: [key],
  providers: [{ id: 'nvidia', label: 'NVIDIA NIM', model: 'test-model' }],
  contribution: work,
  attribution: { subject: 'telegram:123', github: 'test-owner' },
  scoring: { acceptedXp: 100, specXp: 200, hourXp: 10 },
}
const signed = () =>
  signAccessToken({
    telegramId: '123',
    sessionId: 'test-contributor-session',
    deviceKeyThumbprint: 'test-device',
  })
function request(
  path = '/api/hive/keys',
  method = 'GET',
  bearer = signed()
): IncomingMessage {
  return {
    url: path,
    method,
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      'x-queen-contributor-id': 'telegram:456',
    },
  } as unknown as IncomingMessage
}
const config = {
  proxyToken: 'test-server-proxy-token', // secret-guard-ok: synthetic unit-test fixture
  baseUrl: 'https://queen.example',
}

beforeEach(() => {
  vi.stubEnv(
    'SESSION_SIGNING_KEY',
    'test-signing-key-long-enough-for-local-tests'
  )
  vi.stubEnv('RENDER_API_KEY', 'test-server-api-key')
  vi.stubEnv('RENDER_AUTH_MODE', 'warn')
  setRevokedSessions([])
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('the contributor proxy authenticates the person', () => {
  it('uses the verified app session, ignoring spoofed owner headers and query', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(listing)))
    const result = await handleContributorKeys(
      request('/api/hive/keys?owner=456'),
      { ...config, fetchImpl }
    )
    expect(result.status).toBe(200)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.href).toBe('https://queen.example/queen/contributor-keys')
    expect(init.headers).toEqual({
      Authorization: 'Bearer test-server-proxy-token',
      'X-Queen-Contributor-Id': 'telegram:123',
      'Content-Type': 'application/json',
    })
    expect(init.redirect).toBe('error')
  })

  it('rejects a signed game token and service key even in local warn mode', async () => {
    const game = signGameToken({
      telegramId: '123',
      audience: 'https://t27.ai',
    })
    const fetchImpl = vi.fn()
    for (const req of [
      request('/api/hive/keys', 'GET', game),
      {
        ...request(),
        headers: { 'x-api-key': 'test-server-api-key' },
      } as unknown as IncomingMessage,
    ]) {
      expect(
        (await handleContributorKeys(req, { ...config, fetchImpl })).status
      ).toBe(401)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects expired, forged and revoked app sessions before reading a body', async () => {
    const token = signed()
    setRevokedSessions(['test-contributor-session'])
    const readBody = vi.fn()
    expect(
      contributorRequestIdentity(request('/api/hive/keys', 'POST', token))
        .allowed
    ).toBe(false)
    const out = await handleContributorKeys(
      request('/api/hive/keys', 'POST', token),
      { ...config, readBody, fetchImpl: vi.fn() }
    )
    expect(out.status).toBe(401)
    expect(readBody).not.toHaveBeenCalled()
  })
})

describe('credential transport stays narrow', () => {
  it('fails closed without configuration and refuses insecure or redirecting destinations', async () => {
    vi.stubEnv('QUEEN_CONTRIBUTOR_PROXY_TOKEN', '')
    const fetchImpl = vi.fn()
    expect((await handleContributorKeys(request(), { fetchImpl })).status).toBe(
      503
    )
    for (const baseUrl of [
      'http://queen.example',
      // Credentials in the URL must be refused. Assembled from parts so the
      // repository's secret scanner does not read the fixture as a leak.
      `https://${['user', 'password'].join(':')}@queen.example`,
      'https://queen.example/path',
      'https://queen.example/?url=evil',
    ]) {
      expect(
        (
          await handleContributorKeys(request(), {
            ...config,
            baseUrl,
            fetchImpl,
          })
        ).status
      ).toBe(503)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends a new secret once in the request body, and projects metadata only', async () => {
    const secret = 'nvapi-test-credential' // secret-guard-ok: synthetic unit-test fixture
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            key: {
              ...key,
              apiKey: secret,
              ciphertext: 'encrypted-secret',
              lastProbe: { ...key.lastProbe, error: secret },
            },
          }),
          { status: 201 }
        )
    )
    const out = await handleContributorKeys(request('/api/hive/keys', 'POST'), {
      ...config,
      fetchImpl,
      readBody: async () =>
        JSON.stringify({
          provider: 'nvidia',
          apiKey: secret,
          label: ' My key ',
        }),
    })
    expect(out).toEqual({ status: 201, body: { key } })
    expect(JSON.stringify(out)).not.toContain(secret)
    expect(
      (fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1].body
    ).toBe(
      JSON.stringify({ provider: 'nvidia', apiKey: secret, label: 'My key' })
    )
  })

  it('rejects caller-selected attribution and malformed mutation bodies', async () => {
    const fetchImpl = vi.fn()
    const invalid = [
      JSON.stringify({ provider: 'nvidia', apiKey: 'test', owner: '456' }),
      JSON.stringify({
        provider: 'nvidia',
        apiKey: 'test',
        url: 'https://evil.example',
      }),
    ]
    for (const body of invalid)
      expect(
        (
          await handleContributorKeys(request('/api/hive/keys', 'POST'), {
            ...config,
            fetchImpl,
            readBody: async () => body,
          })
        ).status
      ).toBe(400)
    for (const body of ['[]', 'null', '""', '{"owner":"456"}'])
      expect(
        (
          await handleContributorKeys(
            request('/api/hive/keys/-1/disable', 'POST'),
            { ...config, fetchImpl, readBody: async () => body }
          )
        ).status
      ).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts legacy zero and negative managed IDs, rejects traversal and unsafe numbers', () => {
    expect(contributorKeyPath('/api/hive/keys/0/probe')).toBe(
      '/queen/contributor-keys/0/probe'
    )
    expect(contributorKeyPath('/api/hive/keys/-1/disable')).toBe(
      '/queen/contributor-keys/-1/disable'
    )
    for (const path of [
      '/api/hive/keys/../status',
      '/api/hive/keys/01/probe',
      '/api/hive/keys/-0/probe',
      '/api/hive/keys/9007199254740992/probe',
      '/api/hive/keys/1/delete',
    ])
      expect(contributorKeyPath(path)).toBeNull()
  })

  it('never echoes upstream errors or mismatched owner responses', async () => {
    for (const status of [401, 403, 409, 429, 500]) {
      const out = await handleContributorKeys(request(), {
        ...config,
        fetchImpl: async () =>
          new Response('apiKey=secret-provider-value', { status }),
      })
      expect(JSON.stringify(out)).not.toContain('secret-provider-value')
      expect(out.status).toBe(status === 409 || status === 429 ? status : 502)
    }
    expect(
      safeContributorResponse(
        { ...listing, attribution: { subject: 'telegram:456' } },
        'telegram:123'
      )
    ).toBeNull()
    expect(
      safeContributorResponse(
        { ...listing, contribution: null },
        'telegram:123'
      )
    ).toBeNull()
  })

  it('stops waiting for an upstream that hangs', async () => {
    vi.useFakeTimers()
    const fetchImpl: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(new Error('secret-provider-error'))
        )
      )
    const task = handleContributorKeys(request(), { ...config, fetchImpl })
    await vi.runAllTimersAsync()
    expect(await task).toEqual({
      status: 502,
      body: { error: 'upstream_unavailable' },
    })
  })

  it('bounds the real streamed body and handles aborted requests', async () => {
    expect(
      await readContributorBody(
        Readable.from(['{"', 'ok":true}']) as IncomingMessage
      )
    ).toBe('{"ok":true}')
    await expect(
      readContributorBody(Readable.from(['x'.repeat(9000)]) as IncomingMessage)
    ).rejects.toThrow('body_too_large')
    const aborted = new Readable({
      read() {
        this.emit('aborted')
      },
    }) as IncomingMessage
    await expect(readContributorBody(aborted)).rejects.toThrow('invalid_body')
  })
})
