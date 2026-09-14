import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

/**
 * POST /api/auth/game-token -- A NARROW, SHORT TOKEN FOR THE GAME ORIGIN.
 *
 * The game on https://t27.ai must be able to say who the person is without
 * holding anything that works as the person: no refresh token, no app access
 * token, no initData. The token minted here is v:2, lives 300 s, names exactly
 * one audience, and is signed under a key derived from the session key, so no
 * route that verifies app sessions can accept it.
 *
 * The parent credential is the one other routes accept: a live Bearer access
 * token, or initData from a bot in LAUNCH_BOT_IDS. Never an agent key, the
 * service key, or another game token.
 */

const BOT_ID = '4440003'
const TOKEN = `${BOT_ID}:FakeBotTokenForGameTokenTests`
const OTHER_BOT = '4440004:FakeOtherBotTokenForGameTests'
const KEY = 'game-token-test-signing-key-long-enough-0123456789'
const AGENT_KEY = 'agent-key-for-game-token-tests'
const SERVER_KEY = 'service-key-for-game-token-tests'
const GAME = 'https://t27.ai'
const ALICE = 1001
const BOB = 2002

function signInitData(fields: Record<string, string>, token: string): string {
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(token)
    .digest()
  const p = new URLSearchParams(fields)
  p.set(
    'hash',
    crypto.createHmac('sha256', secret).update(checkString).digest('hex')
  )
  return p.toString()
}

const launch = (id: number, token = TOKEN) =>
  signInitData(
    {
      user: JSON.stringify({ id, first_name: 'Test' }),
      auth_date: String(Math.floor(Date.now() / 1000)),
    },
    token
  )

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const decode = (part: string) =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))

/** Sign any header and claims with any key, for tokens the server never mints. */
function forge(header: unknown, claims: unknown, key: Buffer): string {
  const head = b64(header)
  const body = b64(claims)
  const mac = crypto
    .createHmac('sha256', key)
    .update(`${head}.${body}`)
    .digest('base64url')
  return `${head}.${body}.${mac}`
}

const gameKey = () =>
  crypto
    .createHmac('sha256', Buffer.from(KEY))
    .update('tri-game-token-v1')
    .digest()

let source = 0
function request(
  headers: Record<string, string>,
  method = 'POST',
  url = '/api/auth/game-token'
) {
  const r = Readable.from([Buffer.from('')]) as any
  r.url = url
  r.method = method
  r.headers = headers
  r.socket = { remoteAddress: `10.6.0.${++source}` }
  return r
}

function response() {
  const o: any = { status: 0, body: null, head: {} }
  o.setHeader = (k: string, v: string) => {
    o.head[k] = v
  }
  o.writeHead = (code: number, head?: Record<string, string>) => {
    o.status = code
    Object.assign(o.head, head ?? {})
    return o
  }
  o.end = (s: string) => {
    o.body = s ? JSON.parse(s) : null
  }
  return o
}

const emptyPool = () => {
  const client = {
    async query() {
      return { rows: [] as any[] }
    },
    release() {},
  }
  return { ...client, connect: async () => client }
}

const ENV = [
  'TELEGRAM_BOT_TOKEN',
  'BOT_TOKEN_1',
  'SESSION_SIGNING_KEY',
  'LAUNCH_BOT_IDS',
  'AGENT_KEYS',
  'RENDER_API_KEY',
] as const
const saved: Record<string, string | undefined> = {}

describe('POST /api/auth/game-token', () => {
  let session: typeof import('./session')
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute

  beforeEach(async () => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    process.env.BOT_TOKEN_1 = OTHER_BOT
    process.env.SESSION_SIGNING_KEY = KEY
    delete process.env.LAUNCH_BOT_IDS
    process.env.AGENT_KEYS = `${AGENT_KEY}:${ALICE}`
    process.env.RENDER_API_KEY = SERVER_KEY
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.resetModules()
    session = await import('./session')
    handleAuthRoute = (await import('./session-routes')).handleAuthRoute
    session.setRevokedSessions([])
  })

  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.restoreAllMocks()
  })

  const bearerOf = (id: number, sessionId = `s-${id}`, now?: number) =>
    `Bearer ${session.signAccessToken({
      telegramId: String(id),
      sessionId,
      deviceKeyThumbprint: '',
      now,
    })}`

  async function mint(headers: Record<string, string>, method = 'POST') {
    const res = response()
    await handleAuthRoute(
      request(headers, method),
      res,
      () => emptyPool() as any
    )
    return res
  }

  it('mints a v:2 identity token for the game origin from a live Bearer', async () => {
    const res = await mint({ origin: GAME, authorization: bearerOf(ALICE) })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual([
      'expires_in',
      'game_token',
      'telegram_id',
    ])
    expect(res.body.expires_in).toBe(300)
    expect(res.body.telegram_id).toBe(String(ALICE))

    const [head, body] = String(res.body.game_token).split('.')
    expect(decode(head)).toEqual({ alg: 'HS256', typ: 'tri-game' })
    const claims = decode(body)
    expect(Object.keys(claims).sort()).toEqual(
      ['aud', 'exp', 'iat', 'jti', 'scope', 'sub', 'v'].sort()
    )
    expect(claims).toMatchObject({
      v: 2,
      sub: String(ALICE),
      aud: GAME,
      scope: 'identity',
    })
    expect(claims.exp - claims.iat).toBe(300)

    expect(session.verifyGameToken(res.body.game_token, GAME).sub).toBe(
      String(ALICE)
    )
  })

  it('verifyAppSession refuses a game token: other key, and v !== 1 even under the same key', async () => {
    const res = await mint({ origin: GAME, authorization: bearerOf(ALICE) })
    expect(res.status).toBe(200)
    // Signed under the derived key, so it fails before its claims are read.
    expect(() => session.verifyAppSession(res.body.game_token)).toThrow(
      expect.objectContaining({ code: 'bad_signature' })
    )
    // A v:2 claim set under the session key itself is refused by version.
    const now = Math.floor(Date.now() / 1000)
    const sameKey = forge(
      { alg: 'HS256', typ: 'JWT' },
      {
        v: 2,
        sub: String(ALICE),
        sid: 's',
        dkt: '',
        jti: 'j',
        iat: now,
        exp: now + 300,
      },
      Buffer.from(KEY)
    )
    expect(() => session.verifyAppSession(sameKey)).toThrow(
      expect.objectContaining({ code: 'wrong_version' })
    )
  })

  it('refuses every Origin that is not exactly the game origin', async () => {
    for (const origin of [
      undefined,
      '',
      'https://www.t27.ai',
      'https://app.t27.ai',
      'http://t27.ai',
      'https://t27.ai/',
      'https://t27.ai.evil.example',
      'null',
    ]) {
      const headers: Record<string, string> = { authorization: bearerOf(ALICE) }
      if (origin !== undefined) headers.origin = origin
      const res = await mint(headers)
      expect(res.status, `origin ${origin}`).toBe(403)
      expect(res.body.error).toBe('game_token_origin_refused')
      expect(res.body).not.toHaveProperty('game_token')
    }
  })

  it('refuses a caller with no parent credential, an agent key, or the service key', async () => {
    const callers: Record<string, string>[] = [
      { origin: GAME },
      { origin: GAME, 'x-agent-key': AGENT_KEY },
      { origin: GAME, 'x-api-key': SERVER_KEY },
    ]
    for (const headers of callers) {
      const res = await mint(headers)
      expect(res.status, JSON.stringify(headers)).toBe(401)
      expect(res.body.error).toBe('game_token_credential_required')
    }
  })

  it('refuses a game token as parent, and an expired or revoked Bearer', async () => {
    const first = await mint({ origin: GAME, authorization: bearerOf(ALICE) })
    expect(first.status).toBe(200)
    const chained = await mint({
      origin: GAME,
      authorization: `Bearer ${first.body.game_token}`,
    })
    expect(chained.status).toBe(401)
    expect(chained.body.error).toBe('game_token_credential_rejected')

    const hourAgo = Math.floor(Date.now() / 1000) - 3600
    const expired = await mint({
      origin: GAME,
      authorization: bearerOf(ALICE, 's-old', hourAgo),
    })
    expect(expired.status).toBe(401)
    expect(expired.body.detail).toMatch(/expired/)

    session.revokeNow('s-revoked')
    const revoked = await mint({
      origin: GAME,
      authorization: bearerOf(ALICE, 's-revoked'),
    })
    expect(revoked.status).toBe(401)
    expect(revoked.body.detail).toMatch(/revoked/)
  })

  it('refuses initData parents while LAUNCH_BOT_IDS is unset', async () => {
    const res = await mint({
      origin: GAME,
      'x-telegram-init-data': launch(ALICE),
    })
    expect(res.status, JSON.stringify(res.body)).toBe(403)
    expect(res.body.error).toBe('game_token_launch_bots_unset')
  })

  it('accepts initData only from a bot in LAUNCH_BOT_IDS', async () => {
    process.env.LAUNCH_BOT_IDS = ` ${BOT_ID} , not-a-number`
    const allowed = await mint({
      origin: GAME,
      'x-telegram-init-data': launch(ALICE),
    })
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200)
    expect(allowed.body.telegram_id).toBe(String(ALICE))

    const otherBot = await mint({
      origin: GAME,
      'x-telegram-init-data': launch(ALICE, OTHER_BOT),
    })
    expect(otherBot.status, JSON.stringify(otherBot.body)).toBe(403)
    expect(otherBot.body.error).toBe('game_token_bot_not_allowed')

    const forged = await mint({
      origin: GAME,
      'x-telegram-init-data': launch(ALICE, '4440003:NotTheConfiguredBotToken'),
    })
    expect(forged.status).toBe(401)
    expect(forged.body.error).toBe('game_token_credential_rejected')
  })

  it('rate-limits per telegram_id, not globally', async () => {
    const auth = bearerOf(ALICE)
    for (let i = 0; i < 10; i++) {
      const ok = await mint({ origin: GAME, authorization: auth })
      expect(ok.status, `mint ${i + 1}`).toBe(200)
    }
    const limited = await mint({ origin: GAME, authorization: auth })
    expect(limited.status).toBe(429)
    expect(limited.body.error).toBe('game_token_rate_limited')
    expect(Number(limited.head['Retry-After'])).toBeGreaterThan(0)
    expect(limited.body.retry_after_seconds).toBe(
      Number(limited.head['Retry-After'])
    )

    const neighbour = await mint({ origin: GAME, authorization: bearerOf(BOB) })
    expect(neighbour.status).toBe(200)
  })

  it('answers 405 with Allow: POST to any other verb', async () => {
    const res = await mint(
      { origin: GAME, authorization: bearerOf(ALICE) },
      'GET'
    )
    expect(res.status).toBe(405)
    expect(res.head.Allow).toBe('POST')
  })
})

describe('verifyGameToken', () => {
  let session: typeof import('./session')

  beforeEach(async () => {
    saved.SESSION_SIGNING_KEY = process.env.SESSION_SIGNING_KEY
    process.env.SESSION_SIGNING_KEY = KEY
    vi.resetModules()
    session = await import('./session')
    session.setRevokedSessions([])
  })

  afterEach(() => {
    if (saved.SESSION_SIGNING_KEY === undefined)
      delete process.env.SESSION_SIGNING_KEY
    else process.env.SESSION_SIGNING_KEY = saved.SESSION_SIGNING_KEY
  })

  const codeOf = (fn: () => unknown) => {
    try {
      fn()
      return 'accepted'
    } catch (e: any) {
      return e.code ?? String(e)
    }
  }

  it('refuses a request Origin other than the audience, or none', () => {
    const t = session.signGameToken({
      telegramId: String(ALICE),
      audience: GAME,
    })
    expect(codeOf(() => session.verifyGameToken(t, GAME))).toBe('accepted')
    expect(codeOf(() => session.verifyGameToken(t, 'https://app.t27.ai'))).toBe(
      'wrong_audience'
    )
    expect(codeOf(() => session.verifyGameToken(t, ''))).toBe('wrong_audience')
  })

  it('refuses an audience outside GAME_AUDIENCES even when it matches the Origin', () => {
    const now = Math.floor(Date.now() / 1000)
    const t = forge(
      { alg: 'HS256', typ: 'tri-game' },
      {
        v: 2,
        sub: String(ALICE),
        aud: 'https://evil.example',
        scope: 'identity',
        iat: now,
        exp: now + 300,
        jti: 'j',
      },
      gameKey()
    )
    expect(
      codeOf(() => session.verifyGameToken(t, 'https://evil.example'))
    ).toBe('wrong_audience')
    expect(() =>
      session.signGameToken({
        telegramId: '1',
        audience: 'https://evil.example',
      })
    ).toThrow()
  })

  it('refuses an expired token, a wrong typ, a wrong scope, and a v:1 token', () => {
    const now = Math.floor(Date.now() / 1000)
    const old = session.signGameToken({
      telegramId: String(ALICE),
      audience: GAME,
      now: now - 400,
    })
    expect(codeOf(() => session.verifyGameToken(old, GAME, now))).toBe(
      'expired'
    )

    const claims = {
      v: 2,
      sub: String(ALICE),
      aud: GAME,
      scope: 'identity',
      iat: now,
      exp: now + 300,
      jti: 'j',
    }
    expect(
      codeOf(() =>
        session.verifyGameToken(
          forge({ alg: 'HS256', typ: 'JWT' }, claims, gameKey()),
          GAME
        )
      )
    ).toBe('bad_algorithm')
    expect(
      codeOf(() =>
        session.verifyGameToken(
          forge(
            { alg: 'HS256', typ: 'tri-game' },
            { ...claims, scope: 'crm' },
            gameKey()
          ),
          GAME
        )
      )
    ).toBe('wrong_version')
    const app = session.signAccessToken({
      telegramId: String(ALICE),
      sessionId: 's',
      deviceKeyThumbprint: '',
    })
    expect(codeOf(() => session.verifyGameToken(app, GAME))).not.toBe(
      'accepted'
    )
  })

  it('refuses a token issued before the person signed out everywhere', () => {
    const now = Math.floor(Date.now() / 1000)
    const t = session.signGameToken({
      telegramId: String(ALICE),
      audience: GAME,
      now: now - 100,
    })
    session.setRevokedSessions([], [[String(ALICE), now - 50]])
    expect(codeOf(() => session.verifyGameToken(t, GAME, now))).toBe('revoked')
    const later = session.signGameToken({
      telegramId: String(ALICE),
      audience: GAME,
      now,
    })
    expect(codeOf(() => session.verifyGameToken(later, GAME, now))).toBe(
      'accepted'
    )
  })

  it('fails closed when the revocation state is stale', () => {
    const t = session.signGameToken({
      telegramId: String(ALICE),
      audience: GAME,
    })
    const realNow = Date.now
    const frozen = realNow()
    Date.now = () => frozen + 16_000
    try {
      expect(codeOf(() => session.verifyGameToken(t, GAME))).toBe(
        'revocation_unavailable'
      )
    } finally {
      Date.now = realNow
    }
  })
})
