import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Readable } from 'node:stream'

/**
 * A PLAIN SIGN-OUT ENDS THE GAME TOKENS OF THE PERSON WHO SIGNED OUT.
 *
 * A game token carries no sid (session.ts GameClaims), so revoking the family
 * that signed out does not reach it: before this, a token minted a second before
 * "Sign out" kept answering whoami on t27.ai for up to 300 s. Only logout-all's
 * not-before cutoff refused it.
 *
 * /api/auth/logout now leaves a per-person GAME-token cutoff. verifyGameToken
 * refuses a token issued before it, the revocation poll carries it to other
 * replicas with the same merge-with-local-marks rule as the not-before cutoff,
 * and stale revocation state still refuses every game token.
 *
 * Only game tokens: the person's other sessions (another browser) keep working
 * and may mint a new game token at once.
 */

const KEY = 'game-logout-test-signing-key-long-enough-0123456789'
const GAME = 'https://t27.ai'
const PLAYER = 'https://app.t27.ai'
const ALICE = '7101001'
const BOB = '7102002'

interface SessionRow {
  telegramId: string
  familyId: string
  kind: string
  revoked: boolean
}

/**
 * The tables these routes touch. Revocation UPDATEs obey the key in their WHERE
 * clause; an unknown query throws, so a new statement cannot pass as zero rows.
 */
function fakeDb() {
  const sessions = new Map<string, SessionRow>()
  const refresh = new Map<
    string,
    { familyId: string; sessionId: string; revoked: boolean }
  >()
  const gameCutoffs = new Map<string, number>()
  const client = {
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      const p0 = String(params[0] ?? '')
      if (/^(CREATE|ALTER)\b/.test(s)) return { rows: [] }

      if (s.startsWith('SELECT kind FROM app_sessions WHERE id = $1')) {
        const r = sessions.get(p0)
        const liveOnly = s.includes('revoked_at IS NULL')
        return {
          rows: r && !(liveOnly && r.revoked) ? [{ kind: r.kind }] : [],
        }
      }
      if (s.startsWith('SELECT family_id FROM app_sessions WHERE id = $1')) {
        const r = sessions.get(p0)
        return { rows: r ? [{ family_id: r.familyId }] : [] }
      }
      if (s.startsWith('SELECT telegram_id FROM app_sessions WHERE id = $1')) {
        const r = sessions.get(p0)
        return { rows: r ? [{ telegram_id: r.telegramId }] : [] }
      }
      if (
        s.startsWith('SELECT family_id, session_id FROM app_refresh_tokens')
      ) {
        const t = refresh.get(p0)
        return {
          rows:
            t && !t.revoked
              ? [{ family_id: t.familyId, session_id: t.sessionId }]
              : [],
        }
      }
      if (s.startsWith('UPDATE app_sessions SET revoked_at = now()')) {
        const byFamily = /WHERE family_id = \$1/.test(s)
        for (const [id, r] of sessions)
          if ((byFamily ? r.familyId : id) === p0) r.revoked = true
        return { rows: [] }
      }
      if (s.startsWith('UPDATE app_refresh_tokens SET revoked_at = now()')) {
        const byFamily = /WHERE family_id = \$1/.test(s)
        const hit = [...refresh.values()].filter(
          t => (byFamily ? t.familyId : t.sessionId) === p0 && !t.revoked
        )
        for (const t of hit) t.revoked = true
        return {
          rows: /RETURNING session_id/.test(s)
            ? hit.map(t => ({ session_id: t.sessionId }))
            : [],
        }
      }
      if (s.startsWith('INSERT INTO app_user_game_not_before')) {
        const at = Number(params[1])
        gameCutoffs.set(p0, Math.max(gameCutoffs.get(p0) ?? 0, at))
        return { rows: [] }
      }

      // The revocation poll.
      if (
        s.startsWith('SELECT id FROM app_sessions WHERE revoked_at IS NOT NULL')
      )
        return {
          rows: [...sessions]
            .filter(([, r]) => r.revoked)
            .map(([id]) => ({ id })),
        }
      if (/FROM app_user_not_before WHERE not_before > now\(\)/.test(s))
        return { rows: [] }
      if (/FROM app_user_game_not_before WHERE not_before > now\(\)/.test(s))
        return {
          rows: [...gameCutoffs].map(([telegram_id, at]) => ({
            telegram_id,
            not_before: `${at}.000000`,
          })),
        }
      if (s.startsWith('DELETE FROM app_launch_families')) return { rows: [] }
      if (s.startsWith('INSERT INTO app_initdata_bot_daily'))
        return { rows: [] }

      throw new Error(`fake db does not know: ${s.slice(0, 120)}`)
    },
    release() {},
  }
  return {
    sessions,
    refresh,
    gameCutoffs,
    pool: { ...client, connect: async () => client },
  }
}

let source = 0
function request(url: string, headers: Record<string, string>, body: unknown) {
  const r = Readable.from([
    Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  ]) as any
  r.url = url
  r.method = 'POST'
  r.headers = headers
  r.socket = { remoteAddress: `10.11.0.${++source}` }
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

describe('POST /api/auth/logout ends the game tokens of that person', () => {
  let session: typeof import('./session')
  let store: typeof import('./session-store')
  let handleAuthRoute: typeof import('./session-routes').handleAuthRoute
  let db: ReturnType<typeof fakeDb>
  let clock: number
  let savedKey: string | undefined

  beforeEach(async () => {
    savedKey = process.env.SESSION_SIGNING_KEY
    process.env.SESSION_SIGNING_KEY = KEY
    clock = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => clock)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.resetModules()
    session = await import('./session')
    store = await import('./session-store')
    handleAuthRoute = (await import('./session-routes')).handleAuthRoute
    session.setRevokedSessions([])
    db = fakeDb()
  })

  afterEach(() => {
    if (savedKey === undefined) delete process.env.SESSION_SIGNING_KEY
    else process.env.SESSION_SIGNING_KEY = savedKey
    vi.restoreAllMocks()
  })

  const seconds = () => Math.floor(clock / 1000)

  /** A live Login Widget session row and its access token. */
  const webSession = (telegramId: string, sessionId: string) => {
    db.sessions.set(sessionId, {
      telegramId,
      familyId: `fam-${sessionId}`,
      kind: 'web',
      revoked: false,
    })
    return session.signAccessToken({
      telegramId,
      sessionId,
      deviceKeyThumbprint: '',
    })
  }

  async function call(
    url: string,
    headers: Record<string, string>,
    body: unknown = {}
  ) {
    const res = response()
    await handleAuthRoute(
      request(url, headers, body),
      res,
      () => db.pool as any
    )
    return res
  }

  const mint = async (access: string) => {
    const res = await call(
      '/api/auth/game-token',
      { origin: PLAYER, authorization: `Bearer ${access}` },
      { aud: GAME }
    )
    return res
  }

  const codeOf = (token: string) => {
    try {
      session.verifyGameToken(token, GAME)
      return 'accepted'
    } catch (e: any) {
      return e.code ?? String(e)
    }
  }

  /** Mint for ALICE and BOB, move the clock two seconds, ALICE signs out. */
  async function mintThenAliceSignsOut() {
    const alice = webSession(ALICE, 's-alice')
    const aliceOtherBrowser = webSession(ALICE, 's-alice-other')
    const bob = webSession(BOB, 's-bob')
    const aliceGame = await mint(alice)
    const bobGame = await mint(bob)
    expect(aliceGame.status, JSON.stringify(aliceGame.body)).toBe(200)
    expect(bobGame.status, JSON.stringify(bobGame.body)).toBe(200)
    expect(codeOf(aliceGame.body.game_token)).toBe('accepted')

    clock += 2000
    const out = await call('/api/auth/logout', {
      authorization: `Bearer ${alice}`,
    })
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    return {
      alice,
      aliceOtherBrowser,
      aliceToken: String(aliceGame.body.game_token),
      bobToken: String(bobGame.body.game_token),
    }
  }

  it('refuses a game token minted before the sign-out; a neighbour keeps theirs', async () => {
    const t = await mintThenAliceSignsOut()

    expect(codeOf(t.aliceToken), 'the game token outlived sign-out').toBe(
      'revoked'
    )
    expect(codeOf(t.bobToken), 'a neighbour lost their game token').toBe(
      'accepted'
    )
    expect(db.gameCutoffs.get(ALICE), 'the cutoff was not stored').toBe(
      seconds()
    )
    expect(db.gameCutoffs.has(BOB)).toBe(false)

    // The person's other browser is still signed in and mints again at once.
    const again = await mint(t.aliceOtherBrowser)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(codeOf(again.body.game_token)).toBe('accepted')
    // The signed-out session mints nothing.
    expect((await mint(t.alice)).status).toBe(401)

    // Stale revocation state still refuses every game token, as before.
    clock += 16_000
    expect(codeOf(t.bobToken)).toBe('revocation_unavailable')
  })

  it('a sign-out that proves itself with the refresh token alone ends game tokens too', async () => {
    const access = webSession(ALICE, 's-refresh-only')
    db.refresh.set(session.digest('refresh-secret-for-this-test'), {
      familyId: 'fam-s-refresh-only',
      sessionId: 's-refresh-only',
      revoked: false,
    })
    const game = await mint(access)
    expect(game.status, JSON.stringify(game.body)).toBe(200)

    clock += 2000
    const out = await call(
      '/api/auth/logout',
      {},
      { refresh_token: 'refresh-secret-for-this-test' } // secret-guard-ok: invented for this test
    )
    expect(out.status, JSON.stringify(out.body)).toBe(200)
    expect(codeOf(game.body.game_token)).toBe('revoked')
    expect(db.gameCutoffs.get(ALICE)).toBe(seconds())
  })

  it('another replica learns the game cutoff from the revocation poll', async () => {
    const t = await mintThenAliceSignsOut()
    const cutoff = db.gameCutoffs.get(ALICE)!

    // A replica that did not handle the sign-out starts with empty memory ...
    session.setRevokedSessions([])
    expect(codeOf(t.aliceToken)).toBe('accepted')
    // ... and the poll hands it the cutoff.
    await store.pollRevocations(db.pool)
    expect(codeOf(t.aliceToken)).toBe('revoked')

    // A unit slip in the upsert or the poll would refuse these for good.
    const at = (now: number) =>
      session.signGameToken({ telegramId: ALICE, audience: GAME, now })
    expect(codeOf(at(cutoff))).toBe('accepted')
    expect(codeOf(at(cutoff - 1))).toBe('revoked')
    expect(codeOf(t.bobToken)).toBe('accepted')
  })

  it('a poll in flight during the sign-out does not erase the game cutoff on this replica', async () => {
    const alice = webSession(ALICE, 's-alice-race')
    const game = await mint(alice)
    expect(game.status).toBe(200)

    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    let held = false
    const slowPool = {
      async query(sql: string, params?: unknown[]) {
        const s = sql.replace(/\s+/g, ' ')
        if (
          /FROM app_user_game_not_before WHERE not_before > now\(\)/.test(s)
        ) {
          // Read now, answer later: the snapshot predates the sign-out.
          const snapshot = await db.pool.query(sql, params)
          held = true
          await gate
          return snapshot
        }
        return db.pool.query(sql, params)
      },
    }
    const polling = store.pollRevocations(slowPool)
    for (let i = 0; i < 50 && !held; i++)
      await new Promise(r => setTimeout(r, 5))
    expect(held, 'the poll never reached its game cutoff read').toBe(true)

    clock += 2000
    const out = await call('/api/auth/logout', {
      authorization: `Bearer ${alice}`,
    })
    expect(out.status).toBe(200)
    expect(codeOf(game.body.game_token)).toBe('revoked')

    release()
    await polling
    expect(
      codeOf(game.body.game_token),
      'the in-flight poll erased the cutoff'
    ).toBe('revoked')

    // A poll that starts after the sign-out has read the row, and still refuses.
    await store.pollRevocations(db.pool)
    expect(codeOf(game.body.game_token)).toBe('revoked')
  })
})
