import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

/**
 * SIGN OUT EVERYWHERE -- EVERY FAMILY OF THE CALLER, AND ONLY THE CALLER.
 *
 * /api/auth/logout revokes the family that presented the token. After a token
 * theft that is not enough: the thief holds a different family. logout-all
 * revokes every live family of the person, however it was minted.
 *
 * The families below are minted through the real routes (initData, pairing
 * code, Login Widget) against a pool that remembers rows, so "however it was
 * minted" is shown rather than argued. The pool's revocation UPDATEs obey
 * their own WHERE clause: a condition dropped from the real SQL widens what
 * the fake revokes, the way Postgres would, and the neighbour test goes red.
 *
 * Only a live Bearer may ask. initData, agent keys and the service key pass
 * the global guard on a non-public route, so the handler's own refusal is the
 * check that matters, and it is the one exercised here.
 */

const TOKEN = '4440001:TestTokenForLogoutAllOnlyNotARealBot1'
const ALICE = 1001
const BOB = 2002
const AGENT_KEY = 'agent-key-for-logout-all-tests'
const SERVER_KEY = 'service-key-for-logout-all-tests'

interface SessionRow {
  id: string
  telegramId: string
  familyId: string
  kind: string
  revoked: boolean
}
interface TokenRow {
  hash: string
  familyId: string
  sessionId: string
  revoked: boolean
}

function memoryPool() {
  const sessions: SessionRow[] = []
  const tokens: TokenRow[] = []
  const events: unknown[][] = []
  const codes = new Map<
    string,
    { telegramId: string; consumed: boolean; createdAt: number }
  >()
  const assertions = new Set<string>()
  const notBefore = new Map<string, number>()
  const gameNotBefore = new Map<string, number>()

  const client = {
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      const p0 = String(params[0] ?? '')
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] }
      if (/^(CREATE|ALTER)\b/.test(s)) return { rows: [] }
      if (s.startsWith('INSERT INTO hive_events')) {
        events.push(params)
        return { rows: [] }
      }

      // mintSession. Every launch string in this file is fresh, so no launch
      // family is ever reused.
      if (s.startsWith('SELECT f.family_id, f.session_id')) return { rows: [] }
      if (s.startsWith('INSERT INTO app_launch_families')) return { rows: [] }
      if (s.startsWith('INSERT INTO app_sessions')) {
        sessions.push({
          id: p0,
          telegramId: String(params[1]),
          familyId: String(params[4]),
          kind: String(params[5]),
          revoked: false,
        })
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO app_refresh_tokens')) {
        tokens.push({
          hash: p0,
          familyId: String(params[1]),
          sessionId: String(params[2]),
          revoked: false,
        })
        return { rows: [] }
      }

      // Pairing code.
      if (
        s.startsWith(
          'UPDATE app_pairing_codes SET consumed_at = now() WHERE telegram_id = $1'
        )
      ) {
        for (const c of codes.values())
          if (c.telegramId === p0) c.consumed = true
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO app_pairing_codes')) {
        codes.set(p0, {
          telegramId: String(params[1]),
          consumed: false,
          createdAt: Date.now() / 1000,
        })
        return { rows: [] }
      }
      if (
        s.startsWith(
          'SELECT telegram_id, expires_at, consumed_at, attempts FROM app_pairing_codes'
        )
      ) {
        const c = codes.get(p0)
        return {
          rows: c
            ? [
                {
                  telegram_id: c.telegramId,
                  expires_at: new Date(Date.now() + 60_000).toISOString(),
                  consumed_at: c.consumed ? new Date().toISOString() : null,
                  attempts: 0,
                },
              ]
            : [],
        }
      }
      if (
        s.startsWith(
          'UPDATE app_pairing_codes SET consumed_at = now() WHERE code_hash = $1'
        )
      ) {
        const c = codes.get(p0)
        if (!c || c.consumed) return { rows: [] }
        c.consumed = true
        return { rows: [{ telegram_id: c.telegramId }] }
      }

      // Login Widget assertion and profile sync.
      if (s.startsWith('INSERT INTO app_widget_assertions')) {
        if (assertions.has(p0)) return { rows: [] }
        assertions.add(p0)
        return { rows: [{ assertion_hash: p0 }] }
      }
      if (
        /^(DELETE FROM profiles|WITH ranked AS|SELECT pg_advisory_xact_lock|UPDATE profiles SET username = NULL|UPDATE users SET username)/.test(
          s
        )
      )
        return { rows: [] }
      if (
        s.startsWith(
          'SELECT telegram_id, username, telegram_auth_date FROM profiles'
        )
      )
        return { rows: [] }
      if (s.startsWith('INSERT INTO users')) return { rows: [] }
      if (s.startsWith('INSERT INTO profiles'))
        return { rows: [{ telegram_id: p0 }] }

      // Logout (the existing route) looks up the presenting family.
      if (s.startsWith('SELECT family_id FROM app_sessions WHERE id = $1')) {
        const own = sessions.find(r => r.id === p0)
        return { rows: own ? [{ family_id: own.familyId }] : [] }
      }

      // Revocation: obey the WHERE clause that was actually sent.
      if (s.startsWith('UPDATE app_sessions SET revoked_at = now()')) {
        const where = s.slice(s.indexOf(' WHERE ') + 7)
        const hit = sessions.filter(
          r =>
            (!/\btelegram_id = \$1\b/.test(where) || r.telegramId === p0) &&
            (!/\bfamily_id = \$1\b/.test(where) || r.familyId === p0) &&
            (!/\bid = \$1\b/.test(where) || r.id === p0) &&
            (!/\brevoked_at IS NULL\b/.test(where) || !r.revoked)
        )
        for (const r of hit) r.revoked = true
        return {
          rows: /RETURNING id\b/.test(s) ? hit.map(r => ({ id: r.id })) : [],
        }
      }
      if (s.startsWith('UPDATE app_refresh_tokens SET revoked_at = now()')) {
        const where = s.slice(s.indexOf(' WHERE ') + 7)
        const ofOwner =
          /family_id IN \(SELECT family_id FROM app_sessions WHERE telegram_id = \$1\)/.test(
            where
          )
        const outer = where.replace(/\(SELECT [^)]*\)/g, '(subquery)')
        const hit = tokens.filter(
          t =>
            (!ofOwner ||
              sessions.some(
                x => x.telegramId === p0 && x.familyId === t.familyId
              )) &&
            (!/\bfamily_id = \$1\b/.test(outer) || t.familyId === p0) &&
            (!/\bsession_id = \$1\b/.test(outer) || t.sessionId === p0) &&
            (!/\brevoked_at IS NULL\b/.test(outer) || !t.revoked)
        )
        for (const t of hit) t.revoked = true
        return {
          rows: /RETURNING session_id\b/.test(s)
            ? hit.map(t => ({ session_id: t.sessionId }))
            : [],
        }
      }

      // The per-person cutoff, and the poll that carries it to other replicas.
      if (s.startsWith('INSERT INTO app_user_not_before')) {
        notBefore.set(p0, Number(params[1]))
        return { rows: [] }
      }
      // A plain sign-out's game-token cutoff, and the poll's read of it.
      if (s.startsWith('INSERT INTO app_user_game_not_before')) {
        gameNotBefore.set(p0, Number(params[1]))
        return { rows: [] }
      }
      if (
        s.startsWith(
          'SELECT telegram_id, EXTRACT(EPOCH FROM not_before) AS not_before FROM app_user_game_not_before'
        )
      ) {
        return {
          rows: [...gameNotBefore].map(([telegram_id, at]) => ({
            telegram_id,
            not_before: `${at}.000000`,
          })),
        }
      }
      if (
        s.startsWith(
          'SELECT telegram_id, EXTRACT(EPOCH FROM not_before) AS not_before FROM app_user_not_before'
        )
      ) {
        return {
          rows: [...notBefore].map(([telegram_id, at]) => ({
            telegram_id,
            not_before: `${at}.000000`,
          })),
        }
      }
      // The cutoff read by the minting routes. Seconds on both sides, as
      // to_timestamp($2) and the stored timestamptz compare in Postgres.
      if (
        s ===
        'SELECT 1 FROM app_user_not_before WHERE telegram_id = $1 AND not_before > to_timestamp($2) LIMIT 1'
      ) {
        const at = notBefore.get(p0)
        return { rows: at !== undefined && at > Number(params[1]) ? [{}] : [] }
      }
      if (
        s ===
        'SELECT 1 FROM app_pairing_codes c JOIN app_user_not_before n ON n.telegram_id = c.telegram_id WHERE c.code_hash = $1 AND n.not_before > c.created_at LIMIT 1'
      ) {
        const c = codes.get(p0)
        const at = c ? notBefore.get(c.telegramId) : undefined
        return { rows: c && at !== undefined && at > c.createdAt ? [{}] : [] }
      }
      if (
        s.startsWith('SELECT id FROM app_sessions WHERE revoked_at IS NOT NULL')
      )
        return {
          rows: sessions.filter(r => r.revoked).map(r => ({ id: r.id })),
        }
      if (s.startsWith('DELETE FROM app_launch_families')) return { rows: [] }

      // A silent zero rows on an unknown query turns a broken test green.
      throw new Error(`memory pool does not know: ${s.slice(0, 120)}`)
    },
    release() {},
  }
  return {
    sessions,
    tokens,
    events,
    notBefore,
    codes,
    pool: { ...client, connect: async () => client },
  }
}

let source = 0
function request(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = 'POST'
) {
  const r = Readable.from([Buffer.from(JSON.stringify(body))]) as any
  r.url = url
  r.method = method
  r.headers = headers
  r.socket = { remoteAddress: `10.8.0.${++source}` }
  return r
}

function response() {
  const o: any = { status: 0, body: null, head: null }
  o.setHeader = () => undefined
  o.writeHead = (code: number, head?: Record<string, string>) => {
    o.status = code
    o.head = head ?? null
    return o
  }
  o.end = (s: string) => {
    o.body = s ? JSON.parse(s) : null
  }
  return o
}

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

const launch = (id: number, salt: string) =>
  launchAt(id, salt, Math.floor(Date.now() / 1000))

const launchAt = (id: number, salt: string, authDate: number) =>
  signInitData({
    user: JSON.stringify({ id, first_name: 'Test' }),
    auth_date: String(authDate),
    query_id: salt,
  })

function widgetPayload(id: number, authDate = Math.floor(Date.now() / 1000)) {
  const fields = {
    id: String(id),
    first_name: 'Test',
    auth_date: String(authDate),
  }
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  const secret = crypto.createHash('sha256').update(TOKEN).digest()
  return {
    ...fields,
    hash: crypto.createHmac('sha256', secret).update(checkString).digest('hex'),
  }
}

const ENV = [
  'TELEGRAM_BOT_TOKEN',
  'BOT_TOKEN_12',
  'AGENT_KEYS',
  'RENDER_API_KEY',
  'SESSION_SIGNING_KEY',
] as const
const saved: Record<string, string | undefined> = {}

describe('POST /api/auth/logout-all', () => {
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute
  let session: typeof import('./session')
  let db: ReturnType<typeof memoryPool>

  beforeEach(async () => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.TELEGRAM_BOT_TOKEN = TOKEN
    process.env.BOT_TOKEN_12 = TOKEN
    process.env.AGENT_KEYS = `${AGENT_KEY}:${ALICE}`
    process.env.RENDER_API_KEY = SERVER_KEY
    process.env.SESSION_SIGNING_KEY ||= 'x'.repeat(48)
    // pair/claim tells Telegram about the new device; keep that off the network.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      }))
    )
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.resetModules()
    session = await import('./session')
    session.setRevokedSessions([])
    handleAuthRoute = (await import('./session-routes')).handleAuthRoute
    db = memoryPool()
  })

  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function call(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
    method = 'POST'
  ) {
    const res = response()
    await handleAuthRoute(
      request(url, body, headers, method),
      res,
      () => db.pool as any
    )
    return res
  }

  async function signInWithInitData(id: number, salt: string) {
    const res = await call('/api/auth/telegram', {
      init_data: launch(id, salt),
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    return res.body as { access_token: string; refresh_token: string }
  }

  async function signInByPairing(id: number) {
    const started = await call(
      '/api/auth/pair/start',
      {},
      {
        'x-telegram-init-data': launch(id, `pair-${id}`),
      }
    )
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    const claimed = await call('/api/auth/pair/claim', {
      code: started.body.code,
    })
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(200)
    return claimed.body as { access_token: string; refresh_token: string }
  }

  async function signInWithWidget(id: number) {
    const res = await call('/api/auth/widget', widgetPayload(id))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    return res.body as { access_token: string; refresh_token: string }
  }

  const live = (id: number) => ({
    sessions: db.sessions.filter(r => r.telegramId === String(id) && !r.revoked)
      .length,
    tokens: db.tokens.filter(
      t =>
        !t.revoked &&
        db.sessions.some(
          r => r.telegramId === String(id) && r.familyId === t.familyId
        )
    ).length,
  })

  it('revokes every family of the caller, however minted, and nobody else', async () => {
    const fromLaunch = await signInWithInitData(ALICE, 'launch-a')
    const fromPairing = await signInByPairing(ALICE)
    const fromWidget = await signInWithWidget(ALICE)
    const bob = await signInWithInitData(BOB, 'launch-b')
    expect(new Set(db.sessions.map(r => r.familyId)).size).toBe(4)
    expect(live(ALICE)).toEqual({ sessions: 3, tokens: 3 })
    // Each way in records how the person proved who they are; game-token
    // accepts only 'web' as a Bearer parent.
    expect(
      db.sessions.filter(r => r.telegramId === String(ALICE)).map(r => r.kind)
    ).toEqual(['launch', 'app', 'web'])

    const res = await call(
      '/api/auth/logout-all',
      {},
      {
        authorization: `Bearer ${fromWidget.access_token}`,
      }
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body).toEqual({ logged_out: 3 })

    expect(live(ALICE)).toEqual({ sessions: 0, tokens: 0 })
    expect(live(BOB), 'a third party lost a session').toEqual({
      sessions: 1,
      tokens: 1,
    })

    // In this process every one of the caller's access tokens dies at once,
    // not on the next revocation poll. The neighbour's keeps working.
    for (const t of [fromLaunch, fromPairing, fromWidget]) {
      expect(() => session.verifyAppSession(t.access_token)).toThrow(/revoked/)
    }
    expect(() => session.verifyAppSession(bob.access_token)).not.toThrow()

    const signOut = db.events.filter(e => e[0] === 'sign-out')
    expect(signOut).toHaveLength(1)
    expect(signOut[0][1]).toBe(String(ALICE))
    expect(String(signOut[0][4])).toContain('3')
  })

  it('a pairing code issued before sign-out-everywhere cannot be claimed after it', async () => {
    const fromWidget = await signInWithWidget(ALICE)
    const started = await call(
      '/api/auth/pair/start',
      {},
      { 'x-telegram-init-data': launch(ALICE, 'pair-before-logout-all') }
    )
    expect(started.status, JSON.stringify(started.body)).toBe(200)

    const out = await call(
      '/api/auth/logout-all',
      {},
      { authorization: `Bearer ${fromWidget.access_token}` }
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)

    const claimed = await call('/api/auth/pair/claim', {
      code: started.body.code,
    })
    expect(claimed.status, JSON.stringify(claimed.body)).toBe(401)
    expect(claimed.body).toMatchObject({
      error: 'pairing_failed',
      reason: 'expired',
    })
    expect(live(ALICE), 'the code minted a family after logout-all').toEqual({
      sessions: 0,
      tokens: 0,
    })
  })

  /*
   * A LAUNCH STRING SEEN BEFORE SIGN-OUT EVERYWHERE MUST NOT MINT AFTER IT.
   *
   * Without the cutoff, logout-all revoked every family and a thief holding the
   * person's initData (valid 24 hours) simply signed in again: mintSession
   * starts a new family when the launch's family is revoked. The person
   * relaunching the Mini App gets a fresh auth_date and is not affected.
   */
  it('initData launched before sign-out everywhere cannot mint after it', async () => {
    const now = Math.floor(Date.now() / 1000)
    const seenBefore = launchAt(ALICE, 'seen-before', now - 5)
    const neighbourBefore = launchAt(BOB, 'neighbour-before', now - 5)
    const fromWidget = await signInWithWidget(ALICE)

    const out = await call(
      '/api/auth/logout-all',
      {},
      { authorization: `Bearer ${fromWidget.access_token}` }
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)

    const again = await call('/api/auth/telegram', { init_data: seenBefore })
    expect(again.status, JSON.stringify(again.body)).toBe(401)
    expect(String(again.body.detail)).toMatch(/before sign-out everywhere/)
    const code = await call(
      '/api/auth/pair/start',
      {},
      { 'x-telegram-init-data': seenBefore }
    )
    expect(code.status, JSON.stringify(code.body)).toBe(401)
    expect(live(ALICE), 'the old launch minted a family').toEqual({
      sessions: 0,
      tokens: 0,
    })

    // A relaunch after the call works, and a neighbour's launch is untouched.
    await signInWithInitData(ALICE, 'relaunch')
    await signInWithInitData(BOB, 'neighbour-now')
    const neighbour = await call('/api/auth/telegram', {
      init_data: neighbourBefore,
    })
    expect(neighbour.status, JSON.stringify(neighbour.body)).toBe(200)
  })

  it('another replica learns the cutoff from the revocation poll', async () => {
    const now = Math.floor(Date.now() / 1000)
    const seenBefore = launchAt(ALICE, 'replica-before', now - 5)
    const fromWidget = await signInWithWidget(ALICE)
    const out = await call(
      '/api/auth/logout-all',
      {},
      { authorization: `Bearer ${fromWidget.access_token}` }
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    expect(
      db.notBefore.get(String(ALICE)),
      'cutoff not written'
    ).toBeGreaterThanOrEqual(now)

    // A replica that did not handle the call starts with empty memory ...
    session.setRevokedSessions([])
    const { verifyTelegramInitData } = await import('./auth')
    expect(verifyTelegramInitData(seenBefore).ok).toBe(true)
    // ... and the poll hands it the cutoff.
    const { pollRevocations } = await import('./session-store')
    await pollRevocations(db.pool)
    expect(verifyTelegramInitData(seenBefore).reason).toMatch(
      /before sign-out everywhere/
    )

    // The same poll admits what was issued at or after the cutoff: a unit slip
    // in the upsert or the poll would refuse these for good.
    const cutoff = db.notBefore.get(String(ALICE))!
    const atCutoff = session.signAccessToken({
      telegramId: String(ALICE),
      sessionId: 'issued-at-the-cutoff',
      deviceKeyThumbprint: '',
      now: cutoff,
    })
    expect(() => session.verifyAppSession(atCutoff)).not.toThrow()
    expect(verifyTelegramInitData(launch(ALICE, 'after-poll')).ok).toBe(true)
    await signInWithInitData(ALICE, 'signs-in-after-poll')
    expect(live(ALICE)).toEqual({ sessions: 1, tokens: 1 })
  })

  /*
   * REVIEW-1: A REPLICA THAT HAS NOT POLLED YET MINTS NOTHING THAT SURVIVES.
   *
   * The in-memory cutoff reaches other replicas on their next poll, up to 5 s
   * later. A thief replaying the victim's launch string there used to get a
   * brand-new family whose tokens carry iat >= cutoff and whose refresh token
   * rotated for 60 days: the poll that followed refused the launch string but
   * not what it had minted. Minting routes now read the cutoff from the
   * database after their row is committed.
   */
  it('REVIEW-1: a replica that has not polled yet mints no session and no code from an old launch', async () => {
    const now = Math.floor(Date.now() / 1000)
    const captured = launchAt(ALICE, 'thief-launch', now - 3600)
    const fromWidget = await signInWithWidget(ALICE)
    const out = await call(
      '/api/auth/logout-all',
      {},
      { authorization: `Bearer ${fromWidget.access_token}` }
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)

    // Replica B last polled before the call: nothing about ALICE in memory.
    session.setRevokedSessions([])
    const minted = await call('/api/auth/telegram', { init_data: captured })
    expect(minted.status, JSON.stringify(minted.body)).toBe(401)
    expect(minted.body.error).toBe('auth_signed_out_everywhere')
    expect(minted.body).not.toHaveProperty('refresh_token')
    expect(live(ALICE), 'the replay kept a family').toEqual({
      sessions: 0,
      tokens: 0,
    })

    const code = await call(
      '/api/auth/pair/start',
      {},
      { 'x-telegram-init-data': captured }
    )
    expect(code.status, JSON.stringify(code.body)).toBe(401)
    expect(code.body).not.toHaveProperty('code')
    const aliceCodes = [...db.codes.values()].filter(
      c => c.telegramId === String(ALICE)
    )
    expect(aliceCodes.length).toBeGreaterThan(0)
    expect(
      aliceCodes.every(c => c.consumed),
      'a live code was left'
    ).toBe(true)

    // A Login Widget assertion signed before the call and never used.
    const oldWidget = await call(
      '/api/auth/widget',
      widgetPayload(ALICE, now - 3600)
    )
    expect(oldWidget.status, JSON.stringify(oldWidget.body)).toBe(401)
    expect(oldWidget.body.error).toBe('auth_signed_out_everywhere')
    expect(live(ALICE), 'the old widget assertion kept a family').toEqual({
      sessions: 0,
      tokens: 0,
    })

    // On the same replica, a launch issued after the cutoff still signs in.
    await signInWithInitData(ALICE, 'fresh-after-logout-all')
    expect(live(ALICE)).toEqual({ sessions: 1, tokens: 1 })
  })

  /** A pool that holds the first `INSERT INTO app_sessions` until released. */
  function holdFirstSessionInsert() {
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const state = { held: false }
    const pool = {
      async query(sql: string, params?: unknown[]) {
        const s = sql.replace(/\s+/g, ' ').trim()
        if (s.startsWith('INSERT INTO app_sessions') && !state.held) {
          state.held = true
          await gate
        }
        return db.pool.query(sql, params)
      },
      connect: db.pool.connect,
    }
    const reached = async () => {
      for (let i = 0; i < 100 && !state.held; i++)
        await new Promise(r => setTimeout(r, 5))
      expect(state.held, 'the sign-in never reached its insert').toBe(true)
    }
    return { pool, release, reached }
  }

  it('a launch sign-in that passed its checks before logout-all and inserts after it keeps nothing', async () => {
    const now = Math.floor(Date.now() / 1000)
    const launchedBefore = launchAt(ALICE, 'racing-launch', now - 5)
    const fromWidget = await signInWithWidget(ALICE)

    const hold = holdFirstSessionInsert()
    const res = response()
    const signingIn = handleAuthRoute(
      request('/api/auth/telegram', { init_data: launchedBefore }),
      res,
      () => hold.pool as any
    )
    await hold.reached()

    const out = await call(
      '/api/auth/logout-all',
      {},
      { authorization: `Bearer ${fromWidget.access_token}` }
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    hold.release()
    await signingIn

    expect(res.status, JSON.stringify(res.body)).toBe(401)
    expect(live(ALICE), 'the raced sign-in kept a family').toEqual({
      sessions: 0,
      tokens: 0,
    })
  })

  it('a claim that spent its code before logout-all and inserts after it keeps nothing', async () => {
    const fromWidget = await signInWithWidget(ALICE)
    const started = await call(
      '/api/auth/pair/start',
      {},
      { 'x-telegram-init-data': launch(ALICE, 'pair-race') }
    )
    expect(started.status, JSON.stringify(started.body)).toBe(200)
    // Issued two seconds before the call. The cutoff is whole seconds, so a
    // code created in the same second as the call is not told apart.
    for (const c of db.codes.values())
      if (c.telegramId === String(ALICE)) c.createdAt -= 2

    const hold = holdFirstSessionInsert()
    const res = response()
    const claiming = handleAuthRoute(
      request('/api/auth/pair/claim', { code: started.body.code }),
      res,
      () => hold.pool as any
    )
    await hold.reached()

    const out = await call(
      '/api/auth/logout-all',
      {},
      { authorization: `Bearer ${fromWidget.access_token}` }
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    hold.release()
    await claiming

    expect(res.status, JSON.stringify(res.body)).toBe(401)
    expect(res.body.error).toBe('auth_signed_out_everywhere')
    expect(live(ALICE), 'the raced claim kept a family').toEqual({
      sessions: 0,
      tokens: 0,
    })
  })

  /*
   * REVIEW-2: THE REPLICA THAT HANDLED THE CALL KEEPS REFUSING WHILE A POLL
   * THAT STARTED BEFORE IT LANDS.
   *
   * The poll runs every 5 s. Its cutoff SELECT can take its snapshot before
   * logout-all's upsert commits and return after markNotBefore ran. Replacing
   * the in-memory state with that result erased the cutoff and the revoked ids
   * on this very replica, and the captured launch minted again.
   */
  it('a poll in flight during logout-all does not erase the cutoff on this replica', async () => {
    const now = Math.floor(Date.now() / 1000)
    const captured = launchAt(ALICE, 'thief-launch-2', now - 3600)
    const fromWidget = await signInWithWidget(ALICE)

    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    let held = false
    const slowPool = {
      async query(sql: string, params?: unknown[]) {
        const s = sql.replace(/\s+/g, ' ').trim()
        if (s.startsWith('SELECT telegram_id, EXTRACT')) {
          // Read now, answer later: the snapshot predates the logout-all call.
          const snapshot = await db.pool.query(sql, params)
          held = true
          await gate
          return snapshot
        }
        return db.pool.query(sql, params)
      },
    }
    const { pollRevocations } = await import('./session-store')
    const polling = pollRevocations(slowPool as any)
    for (let i = 0; i < 50 && !held; i++)
      await new Promise(r => setTimeout(r, 5))
    expect(held, 'the poll never reached its cutoff read').toBe(true)

    const out = await call(
      '/api/auth/logout-all',
      {},
      { authorization: `Bearer ${fromWidget.access_token}` }
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    const { verifyTelegramInitData } = await import('./auth')
    expect(verifyTelegramInitData(captured).ok).toBe(false)

    release()
    await polling

    expect(verifyTelegramInitData(captured).ok).toBe(false)
    expect(() => session.verifyAppSession(fromWidget.access_token)).toThrow(
      /revoked/
    )
    const minted = await call('/api/auth/telegram', { init_data: captured })
    expect(minted.status, JSON.stringify(minted.body)).toBe(401)
    expect(live(ALICE)).toEqual({ sessions: 0, tokens: 0 })
  })

  const refused = async (headers: Record<string, string>) => {
    await signInWithInitData(ALICE, 'launch-a')
    await signInWithInitData(ALICE, 'launch-a2')
    const before = live(ALICE)
    const res = await call('/api/auth/logout-all', {}, headers)
    expect(res.status, JSON.stringify(res.body)).toBe(401)
    expect(live(ALICE), 'a refused call revoked something').toEqual(before)
    expect(db.events.filter(e => e[0] === 'sign-out')).toHaveLength(0)
    return res
  }

  it('refuses a caller holding only initData', async () => {
    await refused({ 'x-telegram-init-data': launch(ALICE, 'launch-only') })
  })

  it('refuses a valid agent key', async () => {
    await refused({ 'x-agent-key': AGENT_KEY })
  })

  it('refuses the service key', async () => {
    await refused({ 'x-api-key': SERVER_KEY })
  })

  it('refuses an expired Bearer', async () => {
    const hourAgo = Math.floor(Date.now() / 1000) - 3600
    const expired = session.signAccessToken({
      telegramId: String(ALICE),
      sessionId: 'any-session',
      deviceKeyThumbprint: '',
      now: hourAgo,
    })
    const res = await refused({ authorization: `Bearer ${expired}` })
    expect(String(res.body.detail)).toContain('expired')
  })

  it('refuses a Bearer whose family was already logged out', async () => {
    const first = await signInWithInitData(ALICE, 'launch-first')
    await signInWithInitData(ALICE, 'launch-second')
    const out = await call(
      '/api/auth/logout',
      {},
      {
        authorization: `Bearer ${first.access_token}`,
      }
    )
    expect(out.status).toBe(200)
    expect(live(ALICE)).toEqual({ sessions: 1, tokens: 1 })

    const res = await call(
      '/api/auth/logout-all',
      {},
      {
        authorization: `Bearer ${first.access_token}`,
      }
    )
    expect(res.status, JSON.stringify(res.body)).toBe(401)
    expect(String(res.body.detail)).toContain('revoked')
    expect(live(ALICE), 'a dead token signed the person out').toEqual({
      sessions: 1,
      tokens: 1,
    })
  })

  it('answers 405 with Allow: POST to any other verb', async () => {
    const res = await call('/api/auth/logout-all', {}, {}, 'GET')
    expect(res.status).toBe(405)
    expect(res.head?.Allow).toBe('POST')
  })

  it('a CORS preflight is answered before the guard, as for every auth route', () => {
    const server = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const preflight = server.indexOf("if (req.method === 'OPTIONS') {")
    const guard = server.indexOf('const auth = authenticate(req)')
    const mount = server.indexOf(
      'await handleAuthRouteSafely(req, res, getPool)'
    )
    for (const [name, at] of Object.entries({ preflight, guard, mount })) {
      expect(
        at,
        `${name} anchor not found in render-server.ts`
      ).toBeGreaterThan(-1)
    }
    expect(preflight).toBeLessThan(guard)
    expect(guard).toBeLessThan(mount)
    expect(server).toMatch(
      /'Access-Control-Allow-Headers',\s*'[^']*\bAuthorization\b/
    )
  })
})
