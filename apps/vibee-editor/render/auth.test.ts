import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
  authenticate,
  authMode,
  redactRequestTarget,
  verifiedTelegramId,
  verifiedTelegramUser,
  verifyTelegramInitData,
} from './auth'

/**
 * Trinity открывается только из @t27ai_bot. Валидная Telegram-подпись другого
 * бота платформы не должна становиться входом в Trinity.
 */
const sign = (token: string, params: Record<string, string>): string => {
  const check = Object.entries(params)
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

const CLUB = '111111:club-token'
const MAIN = '222222:main-token'
const fresh = (user: unknown = { id: 1, first_name: 'Ada' }) => ({
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify(user),
})
const managedEnvNames = [
  'TELEGRAM_BOT_TOKEN',
  'BOT_TOKEN_TEST_1',
  'BOT_TOKEN_TEST_2',
  'TELEGRAM_AUTH_ENV',
  'TELEGRAM_AUTH_BOT_USERNAME',
  'TELEGRAM_AUTH_BOT_TOKEN',
  'RENDER_AUTH_MODE',
  'RENDER_API_KEY',
  'NODE_ENV',
  ...Array.from({ length: 20 }, (_, index) => `BOT_TOKEN_${index + 1}`),
]
const originalEnv = new Map(
  managedEnvNames.map(name => [name, process.env[name]])
)

const protectedRequest = (initData?: string, method: 'GET' | 'POST' = 'GET') =>
  ({
    url: initData
      ? `/render/abc/status?initData=${encodeURIComponent(initData)}`
      : method === 'POST'
        ? '/render'
        : '/render/abc/status',
    method,
    headers: {},
  }) as unknown as import('node:http').IncomingMessage

beforeEach(() => {
  for (const name of managedEnvNames) delete process.env[name]
  process.env.TELEGRAM_AUTH_ENV = 'production'
})

afterAll(() => {
  for (const name of managedEnvNames) {
    const value = originalEnv.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('verifyTelegramInitData', () => {
  it('отвергает подпись бота, чьего токена у сервера нет', () => {
    process.env.TELEGRAM_BOT_TOKEN = MAIN
    expect(verifyTelegramInitData(sign(CLUB, fresh())).ok).toBe(false)
  })

  it('принимает BOT_TOKEN_12 для ожидаемого @t27ai_bot и называет bot id', () => {
    process.env.TELEGRAM_BOT_TOKEN = MAIN
    process.env.BOT_TOKEN_12 = CLUB
    const r = verifyTelegramInitData(sign(CLUB, fresh()))
    expect(r.ok).toBe(true)
    expect(r.botId).toBe('111111')
  })

  it('не использует другой платформенный bot token вместо BOT_TOKEN_12', () => {
    process.env.TELEGRAM_BOT_TOKEN = '222222:stale-rotated-away'
    process.env.BOT_TOKEN_1 = MAIN
    process.env.BOT_TOKEN_12 = CLUB
    expect(verifyTelegramInitData(sign(MAIN, fresh())).ok).toBe(false)
  })

  it('отвергает просроченный launch, даже с верной подписью', () => {
    process.env.BOT_TOKEN_12 = MAIN
    const old = {
      auth_date: String(Math.floor(Date.now() / 1000) - 90000),
      user: JSON.stringify({ id: 1, first_name: 'Ada' }),
    }
    expect(verifyTelegramInitData(sign(MAIN, old)).ok).toBe(false)
  })

  it.each([
    ['missing user', { auth_date: String(Math.floor(Date.now() / 1000)) }],
    ['invalid JSON', { ...fresh(), user: '{not-json' }],
    ['missing id', fresh({ first_name: 'Ada' })],
    ['zero id', fresh({ id: 0, first_name: 'Ada' })],
    ['missing first_name', fresh({ id: 1 })],
  ])('отвергает structurally malformed signed user: %s', (_label, params) => {
    process.env.BOT_TOKEN_12 = MAIN
    expect(verifyTelegramInitData(sign(MAIN, params)).ok).toBe(false)
  })

  it('без единого токена не пропускает никого', () => {
    expect(verifyTelegramInitData(sign(MAIN, fresh())).ok).toBe(false)
  })
})

describe('verified Telegram identity', () => {
  it('returns normalized profile fields only from fresh signed initData', () => {
    process.env.BOT_TOKEN_12 = MAIN
    const initData = sign(
      MAIN,
      fresh({
        id: 123,
        first_name: ' Ada ',
        last_name: 'Owner',
        username: 'ada',
        photo_url: 'https://t.me/i/userpic/example.jpg',
      })
    )
    const req = protectedRequest(initData)

    expect(verifiedTelegramUser(req)).toEqual({
      id: '123',
      firstName: 'Ada',
      lastName: 'Owner',
      username: 'ada',
      photoUrl: 'https://t.me/i/userpic/example.jpg',
    })
    expect(verifiedTelegramId(req)).toBe('123')
  })
})

describe('request log redaction', () => {
  it('never writes Telegram initData from a query string to logs', () => {
    const target = redactRequestTarget(
      '/render/job/status?safe=1&initData=auth_date%3D1%26hash%3Dsecret'
    )

    expect(target).toBe('/render/job/status?safe=1&initData=%5BREDACTED%5D')
    expect(target).not.toContain('auth_date')
    expect(target).not.toContain('secret')
  })

  it('redacts generic credential-like query parameters on public routes', () => {
    const target = redactRequestTarget(
      '/public/avatar.png?token=private-token-value&agent_key=private-agent-key&safe=1' // secret-guard-ok: synthetic log-redaction fixture
    )

    expect(target).toContain('safe=1')
    expect(target).not.toContain('private-token-value')
    expect(target).not.toContain('private-agent-key')
    expect(target.match(/%5BREDACTED%5D/g)).toHaveLength(2)
  })
})

describe('подпись в строке запроса (SSE)', () => {
  it('EventSource не умеет заголовки — подпись должна приниматься из query', () => {
    process.env.BOT_TOKEN_12 = MAIN
    const initData = sign(MAIN, fresh())
    const req = {
      url: `/render/abc/status?initData=${encodeURIComponent(initData)}`,
      method: 'GET',
      headers: {},
    } as unknown as import('node:http').IncomingMessage
    expect(authenticate(req).allowed).toBe(true)
  })

  it('подделка в query не проходит', () => {
    process.env.BOT_TOKEN_12 = MAIN
    const bad = sign('999:not-ours', fresh())
    const req = {
      url: `/render/abc/status?initData=${encodeURIComponent(bad)}`,
      method: 'GET',
      headers: {},
    } as unknown as import('node:http').IncomingMessage
    expect(authenticate(req).allowed).toBe(false)
  })
})

describe('production authentication result', () => {
  it('defaults to enforce so an unauthenticated protected request becomes 401', () => {
    delete process.env.RENDER_AUTH_MODE

    expect(authMode()).toBe('enforce')
    expect(authenticate(protectedRequest())).toMatchObject({
      allowed: false,
      wouldReject: true,
      via: 'none',
    })
  })

  it('fails closed for an unknown runtime environment', () => {
    process.env.TELEGRAM_AUTH_ENV = 'preview'
    process.env.BOT_TOKEN_12 = MAIN

    expect(authMode()).toBe('enforce')
    expect(authenticate(protectedRequest(sign(MAIN, fresh())))).toMatchObject({
      allowed: false,
      wouldReject: true,
      via: 'none',
    })
  })

  it.each(['GET', 'POST'] as const)(
    'ignores RENDER_AUTH_MODE=warn in a production artifact for %s',
    method => {
      process.env.NODE_ENV = 'production'
      process.env.TELEGRAM_AUTH_ENV = 'development'
      process.env.RENDER_AUTH_MODE = 'warn'

      expect(authMode()).toBe('enforce')
      expect(authenticate(protectedRequest(undefined, method))).toMatchObject({
        allowed: false,
        wouldReject: true,
        via: 'none',
      })
    }
  )

  it('preserves explicit warn semantics in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.TELEGRAM_AUTH_ENV = 'development'
    process.env.RENDER_AUTH_MODE = 'warn'

    expect(authMode()).toBe('warn')
    expect(authenticate(protectedRequest())).toMatchObject({
      allowed: true,
      wouldReject: true,
      via: 'none',
    })
  })
})
