import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

/**
 * SIGN OUT EVERYWHERE LEAVES A PER-PERSON CUTOFF, AND EVERY DOOR HONOURS IT.
 *
 * logout-all revokes every refresh family of the person. That alone left two
 * credentials alive: an access token of a family the revocation raced with,
 * and -- the one that mattered -- a captured Mini App launch string, which
 * stays valid for 24 hours and mints a brand-new family at /api/auth/telegram
 * (or a pairing code at pair/start) right after the person signed out.
 *
 * The cutoff is per telegram_id: an access token whose iat, or initData whose
 * auth_date, is older than it is refused. It reaches other replicas through the
 * same poll as the revoked-session set, and it fails closed the same way when
 * that poll goes stale.
 *
 * NOT covered, by construction: initData FORGED with a bot token the server
 * accepts carries whatever auth_date the forger writes, so it is always fresh.
 */

const TOKEN = '4440002:FakeBotTokenForNotBeforeTests'
const ALICE = 1001
const BOB = 2002
const KEY = 'not-before-test-signing-key-long-enough-0123456789'

function signInitData(fields: Record<string, string>): string {
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TOKEN)
    .digest()
  const p = new URLSearchParams(fields)
  p.set(
    'hash',
    crypto.createHmac('sha256', secret).update(checkString).digest('hex')
  )
  return p.toString()
}

const launchAt = (id: number, authDate: number) =>
  signInitData({
    user: JSON.stringify({ id, first_name: 'Test' }),
    auth_date: String(authDate),
  })

const nowSeconds = () => Math.floor(Date.now() / 1000)

let source = 0
function request(
  url: string,
  headers: Record<string, string>,
  body: unknown = {}
) {
  const r = Readable.from([Buffer.from(JSON.stringify(body))]) as any
  r.url = url
  r.method = 'POST'
  r.headers = headers
  r.socket = { remoteAddress: `10.7.0.${++source}` }
  return r
}

function response() {
  const o: any = { status: 0, body: null }
  o.setHeader = () => undefined
  o.writeHead = (code: number) => {
    o.status = code
    return o
  }
  o.end = (s: string) => {
    o.body = s ? JSON.parse(s) : null
  }
  return o
}

/** Answers every query with no rows: enough for the sign-in doors. */
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
  'SESSION_SIGNING_KEY',
  'RENDER_AUTH_MODE',
] as const
const saved: Record<string, string | undefined> = {}

describe('per-person not-before cutoff', () => {
  let session: typeof import('./session')
  let auth: typeof import('./auth')
  let store: typeof import('./session-store')
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute

  beforeEach(async () => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    process.env.SESSION_SIGNING_KEY = KEY
    process.env.RENDER_AUTH_MODE = 'enforce'
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.resetModules()
    session = await import('./session')
    auth = await import('./auth')
    store = await import('./session-store')
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

  it('refuses an access token issued before the cutoff, and only that one', () => {
    const now = nowSeconds()
    const token = (id: number, iat: number) =>
      session.signAccessToken({
        telegramId: String(id),
        sessionId: `s-${id}-${iat}`,
        deviceKeyThumbprint: '',
        now: iat,
      })
    const before = token(ALICE, now - 100)
    const after = token(ALICE, now - 10)
    const neighbour = token(BOB, now - 100)

    session.setRevokedSessions([], [[String(ALICE), now - 50]])

    expect(() => session.verifyAppSession(before, now)).toThrow(
      /before sign-out everywhere/
    )
    expect(() => session.verifyAppSession(after, now)).not.toThrow()
    expect(() => session.verifyAppSession(neighbour, now)).not.toThrow()
  })

  it('the poll carries the cutoff to a replica that never saw the logout', async () => {
    const now = nowSeconds()
    const before = session.signAccessToken({
      telegramId: String(ALICE),
      sessionId: 'on-another-replica',
      deviceKeyThumbprint: '',
      now: now - 100,
    })
    expect(() => session.verifyAppSession(before, now)).not.toThrow()

    // The fake answers the cutoff query only when it selects recent rows of
    // the cutoff table, the way Postgres would for that WHERE clause.
    const pool = {
      async query(sql: string) {
        const s = sql.replace(/\s+/g, ' ')
        if (/FROM app_user_not_before WHERE not_before > now\(\)/.test(s))
          return {
            rows: [
              { telegram_id: String(ALICE), not_before: `${now - 50}.000000` },
            ],
          }
        return { rows: [] }
      },
    }
    await store.pollRevocations(pool)
    expect(() => session.verifyAppSession(before, now)).toThrow(
      /before sign-out everywhere/
    )

    /*
     * AND WHAT CAME AFTER THE CUTOFF STILL WORKS.
     *
     * Refusals alone cannot catch a unit slip: a cutoff read in milliseconds
     * lies tens of thousands of years ahead and refuses the old credential
     * just as well -- and then every new one, forever, since the row always
     * looks recent. So the poll is also held to admitting credentials issued
     * in the cutoff's own second and later.
     */
    const cutoff = now - 50
    const token = (iat: number) =>
      session.signAccessToken({
        telegramId: String(ALICE),
        sessionId: `issued-${iat}`,
        deviceKeyThumbprint: '',
        now: iat,
      })
    expect(() => session.verifyAppSession(token(cutoff), now)).not.toThrow()
    expect(() => session.verifyAppSession(token(now), now)).not.toThrow()
    expect(auth.verifyTelegramInitData(launchAt(ALICE, cutoff)).ok).toBe(true)
    expect(auth.verifyTelegramInitData(launchAt(ALICE, cutoff - 1)).ok).toBe(
      false
    )
    const game = session.signGameToken({
      telegramId: String(ALICE),
      audience: 'https://t27.ai',
      now,
    })
    expect(session.verifyGameToken(game, 'https://t27.ai', now).sub).toBe(
      String(ALICE)
    )
  })

  it('a poll that read before a local mark does not erase it; a later poll retires it', async () => {
    const now = nowSeconds()
    const token = (id: number, sid: string, iat: number) =>
      session.signAccessToken({
        telegramId: String(id),
        sessionId: sid,
        deviceKeyThumbprint: '',
        now: iat,
      })
    const oldAlice = token(ALICE, 's-alice-old', now - 100)
    const bobRevoked = token(BOB, 's-bob-revoked', now - 10)

    // The poll's queries run while the marks are made, and answer from a
    // snapshot taken before them: no cutoff row, no revoked session.
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    let reads = 0
    const snapshotPool = {
      async query() {
        reads += 1
        await gate
        return { rows: [] as any[] }
      },
    }
    const polling = store.pollRevocations(snapshotPool)
    await new Promise(r => setTimeout(r, 10))
    expect(reads, 'the poll did not start reading').toBe(1)

    session.markNotBefore(String(ALICE), now - 50)
    session.revokeNow('s-bob-revoked')
    release()
    await polling

    expect(() => session.verifyAppSession(oldAlice, now)).toThrow(
      /before sign-out everywhere/
    )
    expect(() => session.verifyAppSession(bobRevoked, now)).toThrow(/revoked/)
    expect(auth.verifyTelegramInitData(launchAt(ALICE, now - 100)).ok).toBe(
      false
    )

    // A poll that starts after the marks has read their rows. These rows say
    // nothing any more, so the marks are retired rather than kept forever.
    await store.pollRevocations({ query: async () => ({ rows: [] }) })
    expect(() => session.verifyAppSession(oldAlice, now)).not.toThrow()
    expect(() => session.verifyAppSession(bobRevoked, now)).not.toThrow()
  })

  it('refuses initData launched before the cutoff at every initData door', async () => {
    const now = nowSeconds()
    const stale = launchAt(ALICE, now - 100)
    const fresh = launchAt(ALICE, now - 10)
    const neighbour = launchAt(BOB, now - 100)
    session.setRevokedSessions([], [[String(ALICE), now - 50]])

    // The verifier every door shares.
    const v = auth.verifyTelegramInitData(stale)
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/before sign-out everywhere/)
    expect(auth.verifyTelegramInitData(fresh).ok).toBe(true)
    expect(auth.verifyTelegramInitData(neighbour).ok).toBe(true)

    // The global guard's initData branch, on a guarded path.
    const guarded = (initData: string) =>
      auth.authenticate({
        url: '/render',
        method: 'POST',
        headers: { 'x-telegram-init-data': initData },
      } as any)
    expect(guarded(stale).allowed).toBe(false)
    expect(guarded(stale).reason).toMatch(/before sign-out everywhere/)
    expect(guarded(fresh).allowed).toBe(true)

    // verifiedTelegramId, behind chatIdentity / resolveIdentity.
    const idOf = (initData: string) =>
      auth.verifiedTelegramId({
        headers: { 'x-telegram-init-data': initData },
      } as any)
    expect(idOf(stale)).toBeNull()
    expect(idOf(fresh)).toBe(String(ALICE))

    // The two doors that mint: a session, and a pairing code.
    const door = async (url: string, initData: string) => {
      const res = response()
      const req =
        url === '/api/auth/telegram'
          ? request(url, {}, { init_data: initData })
          : request(url, { 'x-telegram-init-data': initData })
      await handleAuthRoute(req, res, () => emptyPool() as any)
      return res
    }
    for (const url of ['/api/auth/telegram', '/api/auth/pair/start']) {
      const refused = await door(url, stale)
      expect(refused.status, `${url} ${JSON.stringify(refused.body)}`).toBe(401)
      expect(String(refused.body.detail)).toMatch(/before sign-out everywhere/)
      const admitted = await door(url, fresh)
      expect(admitted.status, `${url} ${JSON.stringify(admitted.body)}`).toBe(
        200
      )
    }
  })

  it('fails closed for initData when the cutoff state goes stale', () => {
    const now = nowSeconds()
    const fresh = launchAt(ALICE, now)
    expect(auth.verifyTelegramInitData(fresh).ok).toBe(true)

    const realNow = Date.now
    const frozen = realNow()
    Date.now = () => frozen + 16_000
    try {
      const v = auth.verifyTelegramInitData(fresh)
      expect(v.ok).toBe(false)
      expect(v.reason).toMatch(/sign-out state is unavailable/)
    } finally {
      Date.now = realNow
    }
  })

  it('a process whose poller never ran enforces no cutoff on initData', async () => {
    /*
     * Pinned on purpose. The poller runs before listen on every deployed
     * instance (session-revocation-runtime.test.ts), and a deployed instance
     * without SESSION_SIGNING_KEY refuses to start. A process that never synced
     * is a laptop or a test without sessions, where logout-all cannot run and
     * no cutoff exists; refusing all initData there would break the Mini App
     * locally and every initData test that does not set up sessions.
     */
    vi.resetModules()
    const coldAuth = await import('./auth')
    expect(
      coldAuth.verifyTelegramInitData(launchAt(ALICE, nowSeconds())).ok
    ).toBe(true)
  })
})
