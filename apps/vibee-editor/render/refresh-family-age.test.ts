import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Readable } from 'node:stream'

/**
 * A REFRESH FAMILY HAS AN ABSOLUTE AGE: 60 DAYS FROM ITS SESSION ROW.
 *
 * Every rotation issues a token that lives now + 60 days, so before this a
 * family that kept rotating never ended: a refresh token copied out of the
 * player's sessionStorage and rotated from a server every few days stayed a
 * full-scope web session for as long as the thief liked (RFC 10017 6.3.2.3:
 * rotation must not extend the original lifetime).
 *
 * The age is counted from app_sessions.created_at, which rotation never
 * changes. The per-token TTL is untouched. A family past the limit is refused
 * with 401 auth_refresh_failed, reason family_expired, and its token is not
 * spent. The price: a web user signs in again every 60 days.
 */

const KEY = 'refresh-age-test-signing-key-long-enough-0123456789'
const DAY_MS = 86_400_000

describe('rotateRefreshToken caps the family age', () => {
  let session: typeof import('./session')

  beforeEach(async () => {
    vi.resetModules()
    session = await import('./session')
  })

  const storeOf = (familyCreatedAt: Date | undefined) => {
    const consumed: Date[] = []
    let revoked = false
    const store = {
      async find() {
        return {
          familyId: 'fam-age',
          usedAt: null,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 30 * DAY_MS),
          familyCreatedAt: familyCreatedAt as Date,
        }
      },
      async consumeAndInsert(_h: string, _n: string, expiresAt: Date) {
        consumed.push(expiresAt)
        return true
      },
      async revokeFamily() {
        revoked = true
        return [] as string[]
      },
    }
    return { store, consumed, revoked: () => revoked }
  }

  it('refuses a family created 61 days ago and does not spend its token', async () => {
    const s = storeOf(new Date(Date.now() - 61 * DAY_MS))
    const r = await session.rotateRefreshToken('presented', s.store)
    expect(r).toEqual({ ok: false, reason: 'family_expired' })
    expect(s.consumed, 'the token was spent').toEqual([])
    expect(s.revoked()).toBe(false)
  })

  it('rotates a family created 59 days ago, and the new token keeps the full per-token TTL', async () => {
    const s = storeOf(new Date(Date.now() - 59 * DAY_MS))
    const now = new Date()
    const r = await session.rotateRefreshToken('presented', s.store, now)
    expect(r.ok, JSON.stringify(r)).toBe(true)
    const next = (r as { ok: true; next: { expiresAt: Date } }).next
    expect(next.expiresAt.getTime() - now.getTime()).toBe(
      session.SESSION_TUNING.REFRESH_TTL_SECONDS * 1000
    )
    expect(s.consumed).toEqual([next.expiresAt])
  })

  it('the limit is exactly 60 days, counted in seconds', async () => {
    const now = new Date()
    const edge = (ms: number) =>
      session.rotateRefreshToken(
        'presented',
        storeOf(new Date(now.getTime() - ms)).store,
        now
      )
    expect(session.SESSION_TUNING.FAMILY_MAX_AGE_SECONDS).toBe(60 * 24 * 3600)
    expect((await edge(60 * DAY_MS - 1000)).ok).toBe(true)
    expect(await edge(60 * DAY_MS)).toEqual({
      ok: false,
      reason: 'family_expired',
    })
  })

  it('a store that cannot say when the family began is refused, not waved through', async () => {
    const s = storeOf(undefined)
    expect(await session.rotateRefreshToken('presented', s.store)).toEqual({
      ok: false,
      reason: 'family_expired',
    })
    expect(s.consumed).toEqual([])
  })
})

describe('POST /api/auth/refresh answers family_expired', () => {
  let session: typeof import('./session')
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute
  let savedKey: string | undefined

  beforeEach(async () => {
    savedKey = process.env.SESSION_SIGNING_KEY
    process.env.SESSION_SIGNING_KEY = KEY
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.resetModules()
    session = await import('./session')
    handleAuthRoute = (await import('./session-routes')).handleAuthRoute
    session.setRevokedSessions([])
  })

  afterEach(() => {
    if (savedKey === undefined) delete process.env.SESSION_SIGNING_KEY
    else process.env.SESSION_SIGNING_KEY = savedKey
    vi.restoreAllMocks()
  })

  const PRESENTED = 'refresh-token-presented-in-this-test'

  /**
   * One refresh row whose session was created `ageDays` ago. The family's age
   * is visible only to a lookup that joins app_sessions on the token's session;
   * the lookup without the join gets the token row alone, as Postgres would.
   */
  function refreshDb(ageDays: number) {
    const hash = session.digest(PRESENTED)
    const sent: string[] = []
    const token = {
      family_id: 'fam-route',
      used_at: null,
      revoked_at: null,
      expires_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    }
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const s = sql.replace(/\s+/g, ' ').trim()
        sent.push(s)
        if (/^(CREATE|ALTER)\b/.test(s)) return { rows: [] }
        if (
          /FROM app_refresh_tokens t JOIN app_sessions s ON s\.id = t\.session_id WHERE t\.token_hash = \$1/.test(
            s
          ) &&
          /s\.created_at AS family_created_at/.test(s)
        )
          return {
            rows:
              params[0] === hash
                ? [
                    {
                      ...token,
                      family_created_at: new Date(
                        Date.now() - ageDays * DAY_MS
                      ).toISOString(),
                    },
                  ]
                : [],
          }
        if (s.startsWith('SELECT family_id, used_at, revoked_at, expires_at'))
          return { rows: params[0] === hash ? [token] : [] }
        if (s.startsWith('WITH consumed AS'))
          return { rows: [{ token_hash: params[1] }] }
        if (s.startsWith('SELECT s.id, s.telegram_id, s.device_pubkey'))
          return {
            rows: [
              { id: 's-route', telegram_id: '7201001', device_pubkey: '' },
            ],
          }
        if (s.startsWith('UPDATE app_sessions SET last_seen_at'))
          return { rows: [] }
        throw new Error(`fake db does not know: ${s.slice(0, 120)}`)
      },
      release() {},
    }
    return { sent, pool: { ...client, connect: async () => client } }
  }

  let source = 0
  async function refresh(db: ReturnType<typeof refreshDb>) {
    const r = Readable.from([
      Buffer.from(JSON.stringify({ refresh_token: PRESENTED })),
    ]) as any
    r.url = '/api/auth/refresh'
    r.method = 'POST'
    r.headers = {}
    r.socket = { remoteAddress: `10.12.0.${++source}` }
    const res: any = { status: 0, body: null }
    res.setHeader = () => undefined
    res.writeHead = (code: number) => {
      res.status = code
      return res
    }
    res.end = (s: string) => {
      res.body = s ? JSON.parse(s) : null
    }
    await handleAuthRoute(r, res, () => db.pool as any)
    return res
  }

  it('a family created 61 days ago gets 401 auth_refresh_failed, reason family_expired, and keeps its token unspent', async () => {
    const db = refreshDb(61)
    const res = await refresh(db)
    expect(res.status, JSON.stringify(res.body)).toBe(401)
    expect(res.body).toMatchObject({
      error: 'auth_refresh_failed',
      reason: 'family_expired',
    })
    expect(res.body).not.toHaveProperty('access_token')
    expect(res.body).not.toHaveProperty('refresh_token')
    expect(
      db.sent.filter(s => s.startsWith('WITH consumed AS')),
      'the refresh token was spent'
    ).toEqual([])
  })

  it('a family created 59 days ago rotates as before', async () => {
    const db = refreshDb(59)
    const res = await refresh(db)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual([
      'access_token',
      'expires_in',
      'refresh_token',
    ])
  })
})
