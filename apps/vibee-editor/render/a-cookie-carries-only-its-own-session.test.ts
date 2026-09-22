import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Readable } from 'node:stream'

/**
 * THE COOKIE CARRIES ONLY ITS OWN SESSION.
 *
 * Review of the auth.t27.ai cookie, 2026-09-22, before it was switched on. The
 * first version of /api/auth/refresh set the cookie for any token a cookie
 * client sent and cleared it on any refusal, and /logout cleared the cookie
 * while revoking only the Bearer's family. Each is a way for the browser's one
 * cookie to end up holding, or losing, a session it was never given:
 *
 *   - a Mini App launch token (initData, which can arrive in any browser from
 *     a link) rotated into the 60-day cookie -- a stranger's link signs this
 *     browser in as the stranger;
 *   - one tab's own token replaced another tab's healthy cookie;
 *   - one tab's dead token cleared another tab's healthy cookie;
 *   - a failure after the rotation answered 503 without the successor;
 *   - logout took the cookie out of the jar and left its family live.
 *
 * These drive the real route against an in-memory database that answers the
 * queries it is sent, and read what the browser would be told.
 */

const KEY = 'cookie-own-session-test-signing-key-0123456789abcdef'
const DAY_MS = 86_400_000
const COOKIE = '__Host-t27_refresh'

type Token = {
  family_id: string
  session_id: string
  used_at: string | null
  revoked_at: string | null
  expires_at: string
  replaced_by?: string | null
  created_at?: string
  to_jar?: boolean
}
type Session = {
  id: string
  telegram_id: string
  device_pubkey: string
  kind: string
  family_id: string
  created_at: string
  revoked_at: string | null
}

describe('the refresh cookie holds only the session it was given', () => {
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

  /** A database holding the named sessions, each with one live token. */
  function db(
    sessions: Array<{
      token: string
      id: string
      kind: string
      who: string
      /** Handed over through the jar (to_jar); a token named jar-* is. */
      jar?: boolean
    }>,
    failures: { profiles?: boolean; lastSeen?: boolean } = {}
  ) {
    const tokens = new Map<string, Token>()
    const rows = new Map<string, Session>()
    const sent: string[] = []
    for (const s of sessions) {
      const family = `fam-${s.id}`
      rows.set(s.id, {
        id: s.id,
        telegram_id: s.who,
        device_pubkey: '',
        kind: s.kind,
        family_id: family,
        created_at: new Date(Date.now() - DAY_MS).toISOString(),
        revoked_at: null,
      })
      tokens.set(session.digest(s.token), {
        family_id: family,
        session_id: s.id,
        used_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
        to_jar: s.jar ?? s.token.startsWith('jar-'),
      })
    }
    const client = {
      async query(sql: string, params: unknown[] = []) {
        const q = sql.replace(/\s+/g, ' ').trim()
        sent.push(q)
        if (/^(CREATE|ALTER)\b/.test(q)) return { rows: [] }
        const t = tokens.get(String(params[0]))
        if (/s\.created_at AS family_created_at/.test(q)) {
          if (!t) return { rows: [] }
          const s = rows.get(t.session_id)!
          const n = t.replaced_by ? tokens.get(t.replaced_by) : undefined
          return {
            rows: [
              {
                ...t,
                family_created_at: s.created_at,
                successor_hash: t.replaced_by ?? null,
                successor_unused: n ? !n.used_at && !n.revoked_at : null,
                successor_created_at: n?.created_at ?? null,
                displaced: !!t.revoked_at && !t.used_at && !!t.replaced_by,
              },
            ],
          }
        }
        if (q.startsWith('WITH dropped AS')) {
          const n = tokens.get(String(params[1]))
          if (
            !t ||
            t.replaced_by !== params[1] ||
            !n ||
            n.used_at ||
            n.revoked_at
          )
            return { rows: [] }
          n.revoked_at = new Date().toISOString()
          n.replaced_by = String(params[2])
          t.replaced_by = String(params[2])
          tokens.set(String(params[2]), {
            family_id: t.family_id,
            session_id: t.session_id,
            used_at: null,
            revoked_at: null,
            expires_at: String(params[3]),
            created_at: new Date().toISOString(),
            to_jar: true,
          })
          return { rows: [{ token_hash: params[2] }] }
        }
        if (q.startsWith('WITH consumed AS')) {
          if (!t || t.used_at || t.revoked_at) return { rows: [] }
          t.used_at = new Date().toISOString()
          t.replaced_by = String(params[1])
          tokens.set(String(params[1]), {
            family_id: t.family_id,
            session_id: t.session_id,
            used_at: null,
            revoked_at: null,
            expires_at: String(params[2]),
            created_at: new Date().toISOString(),
            // As the SQL: asked for, and a Login Widget session.
            to_jar:
              params[3] === true && rows.get(t.session_id)?.kind === 'web',
          })
          return { rows: [{ token_hash: params[1] }] }
        }
        if (q.startsWith('SELECT s.id, s.telegram_id, s.device_pubkey')) {
          const s = t ? rows.get(t.session_id) : undefined
          return { rows: s && !s.revoked_at ? [s] : [] }
        }
        if (q.startsWith('UPDATE app_sessions SET last_seen_at')) {
          if (failures.lastSeen) throw new Error('pool timeout')
          return { rows: [] }
        }
        if (q.startsWith('SELECT username, display_name')) {
          if (failures.profiles) throw new Error('connection reset')
          return {
            rows: [
              {
                username: 'person',
                display_name: 'Person',
                avatar_url: null,
                telegram_auth_date: 1,
              },
            ],
          }
        }
        if (
          q.startsWith('SELECT family_id, session_id FROM app_refresh_tokens')
        ) {
          return {
            rows:
              t && !t.revoked_at
                ? [{ family_id: t.family_id, session_id: t.session_id }]
                : [],
          }
        }
        if (q.startsWith('SELECT family_id FROM app_refresh_tokens')) {
          // Every condition the real query states, so the double cannot
          // answer where Postgres would not (fourth review, 2026-09-22).
          const ok =
            !!t &&
            !t.revoked_at &&
            (!/\bused_at IS NULL\b/.test(q) || !t.used_at) &&
            (!/\bAND to_jar\b/.test(q) || t.to_jar === true)
          return { rows: ok ? [{ family_id: t!.family_id }] : [] }
        }
        if (q.startsWith('SELECT family_id FROM app_sessions WHERE id')) {
          const s = rows.get(String(params[0]))
          return { rows: s ? [{ family_id: s.family_id }] : [] }
        }
        if (q.startsWith('SELECT telegram_id FROM app_sessions WHERE id')) {
          const s = rows.get(String(params[0]))
          return { rows: s ? [{ telegram_id: s.telegram_id }] : [] }
        }
        if (/app_user_game_not_before/.test(q)) return { rows: [] }
        if (
          q.startsWith(
            'UPDATE app_sessions SET revoked_at = now() WHERE family_id'
          )
        ) {
          for (const s of rows.values())
            if (s.family_id === params[0]) s.revoked_at = 'now'
          return { rows: [] }
        }
        if (
          q.startsWith(
            'UPDATE app_refresh_tokens SET revoked_at = now() WHERE family_id'
          )
        ) {
          const out: Array<{ session_id: string }> = []
          for (const tok of tokens.values())
            if (tok.family_id === params[0] && !tok.revoked_at) {
              tok.revoked_at = 'now'
              out.push({ session_id: tok.session_id })
            }
          return { rows: out }
        }
        throw new Error(`fake db does not know: ${q.slice(0, 140)}`)
      },
      release() {},
    }
    const familyRevoked = (id: string) =>
      rows.get(id)?.revoked_at !== null &&
      [...tokens.values()]
        .filter(x => x.session_id === id)
        .every(x => x.revoked_at !== null)
    /** Move a rotation into the past, as the clock would. */
    const age = (plain: string, seconds: number) => {
      const spent = tokens.get(session.digest(plain))!
      const past = new Date(Date.now() - seconds * 1000).toISOString()
      spent.used_at = past
      const next = spent.replaced_by ? tokens.get(spent.replaced_by) : null
      if (next) next.created_at = past
    }
    return {
      sent,
      familyRevoked,
      age,
      pool: { ...client, connect: async () => client },
    }
  }

  let source = 0
  async function call(
    path: string,
    d: ReturnType<typeof db>,
    opts: {
      body?: object
      jar?: string
      bearer?: string
      cookieClient?: boolean
    }
  ) {
    const r = Readable.from([
      Buffer.from(JSON.stringify(opts.body ?? {})),
    ]) as any
    r.url = path
    r.method = 'POST'
    r.headers = {
      'x-forwarded-proto': 'https',
      origin: 'https://app.t27.ai',
      ...(opts.cookieClient === false
        ? {}
        : { 'x-session-transport': 'cookie' }),
      ...(opts.jar
        ? { cookie: `${COOKIE}=${encodeURIComponent(opts.jar)}` }
        : {}),
      ...(opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    }
    r.socket = { remoteAddress: `10.27.0.${++source}` }
    const res: any = {
      status: 0,
      body: null,
      headers: {} as Record<string, string>,
    }
    res.setHeader = (name: string, value: string) => {
      res.headers[name.toLowerCase()] = String(value)
    }
    res.writeHead = (code: number, extra?: Record<string, string>) => {
      res.status = code
      for (const [k, v] of Object.entries(extra ?? {}))
        res.headers[k.toLowerCase()] = String(v)
      return res
    }
    res.end = (s: string) => {
      res.body = s ? JSON.parse(s) : null
    }
    await handleAuthRoute(r, res, () => d.pool as any)
    return res as {
      status: number
      body: Record<string, unknown>
      headers: Record<string, string>
    }
  }

  const setsCookie = (res: { headers: Record<string, string> }) =>
    String(res.headers['set-cookie'] ?? '')

  it('rotates a token read from the jar back into the jar, and names the person', async () => {
    const d = db([
      { token: 'jar-web', id: 's-web', kind: 'web', who: '7300001' },
    ])
    const res = await call('/api/auth/refresh', d, { jar: 'jar-web' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.refresh_transport).toBe('cookie')
    expect(res.body).not.toHaveProperty('refresh_token')
    expect(setsCookie(res)).toMatch(new RegExp(`^${COOKIE}=[^;]+;`))
    expect(setsCookie(res)).not.toContain('Max-Age=0')
    expect(res.body.telegram_user).toMatchObject({ id: 7300001 })
  })

  it('never puts a Mini App launch token into the cookie', async () => {
    const d = db([
      { token: 'launch-tok', id: 's-launch', kind: 'launch', who: '7300002' },
    ])
    const res = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'launch-tok' },
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(typeof res.body.refresh_token).toBe('string')
    expect(res.body).not.toHaveProperty('refresh_transport')
    expect(setsCookie(res)).toBe('')
  })

  it('never puts a pairing token or a session from before kinds into the cookie', async () => {
    for (const kind of ['app', 'legacy']) {
      const d = db([
        { token: `t-${kind}`, id: `s-${kind}`, kind, who: '7300003' },
      ])
      const res = await call('/api/auth/refresh', d, {
        body: { refresh_token: `t-${kind}` },
      })
      expect(res.status, kind).toBe(200)
      expect(setsCookie(res), kind).toBe('')
      expect(typeof res.body.refresh_token, kind).toBe('string')
    }
  })

  it("moves a tab's own Login Widget token into an empty jar", async () => {
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300004' },
    ])
    const res = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' },
    })
    expect(res.status).toBe(200)
    expect(res.body.refresh_transport).toBe('cookie')
    expect(setsCookie(res)).toMatch(new RegExp(`^${COOKIE}=`))
  })

  it("does not replace a jar that already holds another tab's session", async () => {
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300005' },
      { token: 'jar-web', id: 's-jar', kind: 'web', who: '7300006' },
    ])
    const res = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' },
      jar: 'jar-web',
    })
    expect(res.status).toBe(200)
    expect(setsCookie(res)).toBe('')
    expect(typeof res.body.refresh_token).toBe('string')
    expect(d.familyRevoked('s-jar')).toBe(false)
  })

  it("a tab's dead token does not clear another tab's healthy cookie", async () => {
    const d = db([
      { token: 'jar-web', id: 's-jar', kind: 'web', who: '7300007' },
    ])
    const res = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'nobody-knows-this-token' }, // secret-guard-ok: invented test value
      jar: 'jar-web',
    })
    expect(res.status).toBe(401)
    expect(setsCookie(res)).toBe('')
  })

  it('a dead cookie is taken out of the jar', async () => {
    const d = db([])
    const res = await call('/api/auth/refresh', d, {
      jar: 'nobody-knows-this-token',
    })
    expect(res.status).toBe(401)
    expect(setsCookie(res)).toContain('Max-Age=0')
  })

  it('answers with the successor even when the profile cannot be read', async () => {
    const d = db(
      [{ token: 'jar-web', id: 's-web', kind: 'web', who: '7300008' }],
      {
        profiles: true,
      }
    )
    const res = await call('/api/auth/refresh', d, { jar: 'jar-web' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(setsCookie(res)).toMatch(new RegExp(`^${COOKIE}=[^;]+;`))
    expect(res.body.telegram_user).toMatchObject({ id: 7300008 })
  })

  it('answers with the successor even when last_seen_at cannot be written', async () => {
    const d = db(
      [{ token: 'jar-web', id: 's-web', kind: 'web', who: '7300009' }],
      {
        lastSeen: true,
      }
    )
    const res = await call('/api/auth/refresh', d, { jar: 'jar-web' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(setsCookie(res)).toMatch(new RegExp(`^${COOKIE}=[^;]+;`))
  })

  it("a client that did not ask for the cookie gets yesterday's reply", async () => {
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300010' },
    ])
    const res = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' },
      cookieClient: false,
    })
    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual([
      'access_token',
      'expires_in',
      'refresh_token',
    ])
    expect(setsCookie(res)).toBe('')
  })

  it("logout revokes the cookie's family as well as the Bearer's, and clears the cookie", async () => {
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300011' },
      { token: 'jar-web', id: 's-jar', kind: 'web', who: '7300011' },
    ])
    const bearer = session.signAccessToken({
      telegramId: '7300011',
      sessionId: 's-tab',
      deviceKeyThumbprint: '',
    })
    const res = await call('/api/auth/logout', d, { bearer, jar: 'jar-web' })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(d.familyRevoked('s-tab')).toBe(true)
    expect(d.familyRevoked('s-jar')).toBe(true)
    expect(setsCookie(res)).toContain('Max-Age=0')
  })

  const jarOf = (res: { headers: Record<string, string> }) =>
    decodeURIComponent(
      (setsCookie(res).match(new RegExp(`^${COOKIE}=([^;]*)`)) ?? [])[1] ?? ''
    )

  it('a reply lost after the rotation: the same jar token later gets a new successor, not a revoked family', async () => {
    const d = db([
      { token: 'jar-web', id: 's-web', kind: 'web', who: '7300012' },
    ])
    const first = await call('/api/auth/refresh', d, { jar: 'jar-web' })
    expect(first.status).toBe(200)
    // The Set-Cookie never reached the jar: the tab closed, the line dropped.
    d.age('jar-web', 30)
    const retry = await call('/api/auth/refresh', d, { jar: 'jar-web' })
    expect(retry.status, JSON.stringify(retry.body)).toBe(200)
    expect(jarOf(retry)).not.toBe('')
    expect(d.familyRevoked('s-web')).toBe(false)
    // And the new successor rides on.
    const next = await call('/api/auth/refresh', d, { jar: jarOf(retry) })
    expect(next.status).toBe(200)
  })

  it('the same replay from a body is still a theft', async () => {
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300013' },
    ])
    const first = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
      cookieClient: false,
    })
    expect(first.status).toBe(200)
    d.age('tab-web', 30)
    const replay = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
      cookieClient: false,
    })
    expect(replay.status).toBe(401)
    expect(replay.body.error).toBe('auth_reuse_detected')
    expect(d.familyRevoked('s-tab')).toBe(true)
  })

  it("a tab's stale copy sent beside the cookie that holds its successor is a race", async () => {
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300014' },
    ])
    // One tab moved the family into the empty jar...
    const moved = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
    })
    expect(moved.body.refresh_transport).toBe('cookie')
    d.age('tab-web', 30)
    // ...its duplicate still holds the old token, and sends it with the jar.
    const stale = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
      jar: jarOf(moved),
    })
    expect(stale.status).toBe(409)
    expect(stale.body.reason).toBe('successor_in_jar')
    expect(setsCookie(stale)).toBe('')
    expect(d.familyRevoked('s-tab')).toBe(false)
  })

  it('a session that is not a Login Widget one leaves the jar, its successor in the body', async () => {
    const d = db([
      { token: 'jar-app', id: 's-app', kind: 'app', who: '7300015' },
    ])
    const res = await call('/api/auth/refresh', d, { jar: 'jar-app' })
    expect(res.status).toBe(200)
    expect(setsCookie(res)).toContain('Max-Age=0')
    expect(typeof res.body.refresh_token).toBe('string')
  })

  it('a copied body token sent as a cookie is not forgiven: the family ends', async () => {
    // The render never wrote this token into a jar, so a Cookie header
    // carrying it is somebody's copy (third review, 2026-09-22).
    const d = db([
      {
        token: 'tab-web',
        id: 's-tab',
        kind: 'web',
        who: '7300016',
        jar: false,
      },
    ])
    const first = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
      cookieClient: false,
    })
    expect(first.status).toBe(200)
    d.age('tab-web', 30)
    const forged = await call('/api/auth/refresh', d, { jar: 'tab-web' })
    expect(forged.status).toBe(401)
    expect(forged.body.error).toBe('auth_reuse_detected')
    expect(d.familyRevoked('s-tab')).toBe(true)
  })

  it('a token the route itself wrote into the jar is forgiven a lost reply later', async () => {
    // Not only the sign-in's token: every successor the refresh door writes
    // into the jar is recorded as handed over there (markToJar).
    const d = db([
      { token: 'jar-web', id: 's-web', kind: 'web', who: '7300017' },
    ])
    const first = await call('/api/auth/refresh', d, { jar: 'jar-web' })
    const inJar = jarOf(first)
    expect(inJar).not.toBe('')
    const second = await call('/api/auth/refresh', d, { jar: inJar })
    expect(second.status).toBe(200)
    // The second reply was lost; the jar still holds the first successor.
    d.age(inJar, 30)
    const retry = await call('/api/auth/refresh', d, { jar: inJar })
    expect(retry.status, JSON.stringify(retry.body)).toBe(200)
    expect(d.familyRevoked('s-web')).toBe(false)
  })

  it("a stale tab copy beside a jar token that has just rotated is still this browser's race", async () => {
    // Another tab's jar rotation is in flight (or its reply was lost): the
    // jar token is used, and it still names this browser's family.
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300018' },
    ])
    const moved = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
    })
    const n1 = jarOf(moved)
    expect(n1).not.toBe('')
    const rotated = await call('/api/auth/refresh', d, { jar: n1 })
    expect(rotated.status).toBe(200) // its Set-Cookie has not landed yet
    d.age('tab-web', 30)
    const stale = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
      jar: n1,
    })
    expect(stale.status).toBe(409)
    expect(stale.body.reason).toBe('successor_in_jar')
    expect(d.familyRevoked('s-tab')).toBe(false)
  })

  it('a duplicate in the usual timing, milliseconds after its twin, is told the family is in the jar', async () => {
    const d = db([
      { token: 'tab-web', id: 's-tab', kind: 'web', who: '7300019' },
    ])
    const moved = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
    })
    const twin = await call('/api/auth/refresh', d, {
      body: { refresh_token: 'tab-web' }, // secret-guard-ok: invented test value
      jar: jarOf(moved),
    })
    expect(twin.status).toBe(409)
    expect(twin.body.reason).toBe('successor_in_jar')
  })
})
