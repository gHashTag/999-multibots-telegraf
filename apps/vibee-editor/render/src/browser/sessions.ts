/**
 * ONE ROW PER PERSON, AND THAT IS THE POINT.
 *
 * `telegram_id` is the PRIMARY KEY, so "one client = one pod = one profile"
 * is a fact the database enforces rather than a rule the code is trusted to
 * remember. A second pod for the same person would be a second set of cookies
 * for the same accounts; a shared pod would be one person's cookies in
 * somebody else's hands. Both are the same accident, and the schema refuses
 * both.
 *
 * WHAT IS DELIBERATELY NOT HERE. No credentials, ever. The person signs in
 * themselves inside the stream -- their keystrokes go to the browser in the
 * pod and only video comes back -- so there is nothing to store and nothing
 * for us to lose. What we do hold is the profile, and a profile is somebody's
 * live sessions: see docs/architecture/remote-browser-per-user.md §4.4.
 *
 * `admin_token` stays server-side. It is the key to the room's own settings,
 * the client is given `view_token` instead, and the difference is why a
 * client cannot reconfigure a browser we are answerable for.
 */

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export type SessionState = 'starting' | 'live' | 'stopped'

export interface BrowserSession {
  telegramId: string
  sessionId: string
  podId: string | null
  /**
   * host:port where the pod answers, INSIDE our network. The proxy needs it
   * on every request, so it is stored rather than asked of the driver each
   * time. It is never serialised to a client -- see `publicView` in routes.ts
   * and the test that searches the response for it.
   */
  endpoint: string | null
  /** Where an agent drives this pod. Server-side only, like `endpoint`. */
  cdpEndpoint: string | null
  /**
   * When the person last granted permission for this session, in ms. The
   * place-based guard (guard.ts) reads it; a yes goes stale on purpose, so
   * one permission never opens the door for a whole session.
   */
  allowedAtMs: number | null
  state: SessionState
  viewToken: string
  adminToken: string
}

let tableReady = false

export async function ensureBrowserSessions(q: Queryable): Promise<void> {
  if (tableReady) return
  await q.query(
    `CREATE TABLE IF NOT EXISTS browser_sessions (
       telegram_id  text PRIMARY KEY,
       session_id   text NOT NULL,
       pod_id       text,
       endpoint     text,
       cdp_endpoint text,
       allowed_at   timestamptz,
       state        text NOT NULL CHECK (state IN ('starting','live','stopped')),
       view_token   text NOT NULL,
       admin_token  text NOT NULL,
       created_at   timestamptz NOT NULL DEFAULT now(),
       last_seen_at timestamptz NOT NULL DEFAULT now()
     )`,
    []
  )
  /*
   * The proxy is handed a session id and nothing else -- it has no idea whose
   * browser it is until it looks. UNIQUE does double duty: it makes that
   * lookup an index hit, and it makes two people sharing a session id
   * impossible rather than unlikely.
   */
  await q.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS browser_sessions_session_id
       ON browser_sessions (session_id)`,
    []
  )
  /* Deployed before `endpoint` existed, so the column is added in place. */
  await q.query(
    `ALTER TABLE browser_sessions ADD COLUMN IF NOT EXISTS endpoint text`,
    []
  )
  await q.query(
    `ALTER TABLE browser_sessions ADD COLUMN IF NOT EXISTS cdp_endpoint text`,
    []
  )
  await q.query(
    `ALTER TABLE browser_sessions ADD COLUMN IF NOT EXISTS allowed_at timestamptz`,
    []
  )
  tableReady = true
}

/** Test seam: the cached flag would otherwise leak between test cases. */
export function resetBrowserSessionsCache(): void {
  tableReady = false
}

export async function readSession(
  q: Queryable,
  telegramId: string
): Promise<BrowserSession | null> {
  const { rows } = await q.query(
    `SELECT telegram_id, session_id, pod_id, endpoint, cdp_endpoint,
            extract(epoch from allowed_at) * 1000 AS allowed_ms,
            state, view_token, admin_token
       FROM browser_sessions WHERE telegram_id = $1`,
    [telegramId]
  )
  const row = rows[0]
  return row ? rowToSession(row) : null
}

function nullable(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v)
}

function rowToSession(row: Record<string, unknown>): BrowserSession {
  return {
    telegramId: String(row.telegram_id),
    sessionId: String(row.session_id),
    podId: nullable(row.pod_id),
    endpoint: nullable(row.endpoint),
    cdpEndpoint: nullable(row.cdp_endpoint),
    allowedAtMs: row.allowed_ms ? Number(row.allowed_ms) : null,
    state: String(row.state) as SessionState,
    viewToken: String(row.view_token),
    adminToken: String(row.admin_token),
  }
}

/**
 * The proxy's lookup: it knows the session id from the URL and must find out
 * whose browser that is, and whether it is running, before letting anyone
 * near it.
 */
export async function readSessionById(
  q: Queryable,
  sessionId: string
): Promise<BrowserSession | null> {
  const { rows } = await q.query(
    `SELECT telegram_id, session_id, pod_id, endpoint, cdp_endpoint,
            extract(epoch from allowed_at) * 1000 AS allowed_ms,
            state, view_token, admin_token
       FROM browser_sessions WHERE session_id = $1`,
    [sessionId]
  )
  return rows[0] ? rowToSession(rows[0]) : null
}

/**
 * Upsert, because a person restarting their browser is the ordinary case and
 * must not depend on whether a previous row happened to be cleaned up.
 */
export async function writeSession(
  q: Queryable,
  s: BrowserSession
): Promise<void> {
  await q.query(
    `INSERT INTO browser_sessions
       (telegram_id, session_id, pod_id, endpoint, cdp_endpoint, state, view_token, admin_token, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (telegram_id) DO UPDATE SET
       session_id   = EXCLUDED.session_id,
       pod_id       = EXCLUDED.pod_id,
       endpoint     = EXCLUDED.endpoint,
       cdp_endpoint = EXCLUDED.cdp_endpoint,
       state        = EXCLUDED.state,
       view_token   = EXCLUDED.view_token,
       admin_token  = EXCLUDED.admin_token,
       last_seen_at = now()`,
    [
      s.telegramId,
      s.sessionId,
      s.podId,
      s.endpoint,
      s.cdpEndpoint,
      s.state,
      s.viewToken,
      s.adminToken,
    ]
  )
}

/**
 * The viewer's socket is open, so this browser is being watched. Keyed by
 * session id because the proxy knows the session, never the person.
 */
export async function touchSessionById(
  q: Queryable,
  sessionId: string
): Promise<void> {
  await q.query(
    `UPDATE browser_sessions SET last_seen_at = now() WHERE session_id = $1`,
    [sessionId]
  )
}

/**
 * The person just said yes. The moment is recorded on the SESSION, not on the
 * approval, because that is what the guard asks about: "may this browser act
 * here, now" -- one question, one place to read it.
 */
export async function markAllowed(
  q: Queryable,
  telegramId: string
): Promise<void> {
  await q.query(
    `UPDATE browser_sessions SET allowed_at = now() WHERE telegram_id = $1`,
    [telegramId]
  )
}

export async function touchSession(
  q: Queryable,
  telegramId: string
): Promise<void> {
  await q.query(
    `UPDATE browser_sessions SET last_seen_at = now() WHERE telegram_id = $1`,
    [telegramId]
  )
}

/**
 * The row goes away with the pod. A stopped session that keeps its row would
 * hand the next reader a view token for a browser that no longer exists, and
 * worse, would make "does this person have a browser" answer yes forever.
 */
export async function dropSession(
  q: Queryable,
  telegramId: string
): Promise<void> {
  await q.query(`DELETE FROM browser_sessions WHERE telegram_id = $1`, [
    telegramId,
  ])
}
