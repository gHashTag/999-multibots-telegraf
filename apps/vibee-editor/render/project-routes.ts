/**
 * Projects: the timeline a person is working on, stored server side.
 *
 * WHY THIS EXISTS. Until now the editor had no server-side project at all.
 * The web editor keeps everything in `localStorage` (`vibee-project-v15`,
 * `vibee-tracks-v17`) and the native app opened a hardcoded demo composition.
 * Two clients, two private piles of state, nothing shared — so "open my
 * project on the phone" was not a feature that could be built, only faked.
 *
 * A search of `render-server.ts` for `project` returned zero hits, and live
 * probes with a server key answered `404 {"error":"Not found"}` for
 * `/api/projects`, `/api/project` and `/api/timeline`. There was nothing to
 * extend; this is the first version.
 *
 * SHAPE. Three routes and deliberately not five: list mine, read one, write
 * one. There is no POST-create because PUT with a client-chosen id already
 * creates — a second way to make a project is a second place for the two to
 * drift. There is no DELETE yet: nothing in either client asks for it, and a
 * route nobody calls is how dead code gets written on purpose.
 *
 * PRIVACY IS THE WHOLE POINT. Every statement below filters by owner, and the
 * upsert filters by owner too — see `handleProjectRoute`. A project is a
 * person's unpublished work; the feed is the place for things meant to be
 * seen.
 *
 * NOT IN PUBLIC_EXACT, ON PURPOSE. The shared guard in `auth.ts` already lets
 * a valid `Authorization: Bearer` through (its third branch), so these routes
 * are reachable for a signed-in client and closed to everyone else. Listing
 * them as public would remove the one check that is doing useful work.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { verifiedTelegramId } from './auth'
import { verifyAppSession } from './session'

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

let tableReady = false

/**
 * Create the table on first use.
 *
 * Same convention as `ensureAuthTables` and every other table in this service
 * (`user_tokens`, `agent_renders`, `app_sessions`): there is no migration
 * runner here, and inventing one for a single table would give the schema two
 * sources of truth, of which the unused one always drifts.
 *
 * Called per request rather than at boot so that a server which cannot reach
 * Postgres still serves `/health` and the public feed.
 */
export async function ensureProjectsTable(pool: Pool): Promise<void> {
  if (tableReady) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id text PRIMARY KEY,
      telegram_id text NOT NULL,
      name text NOT NULL DEFAULT '',
      composition jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`)

  // The list query is exactly this: one person's projects, newest first.
  await pool.query(
    `CREATE INDEX IF NOT EXISTS projects_owner
       ON projects (telegram_id, updated_at DESC)`
  )

  tableReady = true
}

/** Limits that a caller can hit, kept together so they can be read at once. */
export const PROJECT_LIMITS = {
  /**
   * A composition is a timeline, not a media file: clips carry URLs, never
   * bytes. Two megabytes is thousands of clips and still small enough that a
   * single request cannot become a memory problem.
   */
  BODY_BYTES: 2 * 1024 * 1024,
  /** Enough that a person never meets it; small enough to bound the list. */
  LIST: 100,
  NAME_CHARS: 120,
} as const

/**
 * Project ids are chosen by the client, so they are checked here.
 *
 * A client-chosen id is what makes PUT able to create, which is what removes
 * the need for a separate POST. The cost is that the id arrives from outside
 * and lands in a URL and a primary key, so its alphabet is stated rather than
 * assumed. A UUID passes; a path traversal or a megabyte of text does not.
 */
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/

export function projectIdIsValid(id: string): boolean {
  return ID_OK.test(id)
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > PROJECT_LIMITS.BODY_BYTES) throw new Error('body too large')
    parts.push(chunk as Buffer)
  }
  return Buffer.concat(parts).toString('utf8')
}

/**
 * Whose projects these are.
 *
 * Two proofs, both cryptographic, and NEITHER of them the request body. Taking
 * `telegram_id` from the body is how a private list becomes a public one: the
 * ids are visible inside Telegram, so anyone able to write JSON could read
 * anyone's work.
 *
 * Bearer first, because that is what the native app holds and because an
 * expired one must be reported as expired rather than silently retried as
 * something else. A mini-app signature is accepted too — the web editor has
 * one on every request already, and refusing it would mean building a second
 * way in later.
 *
 * A server key (`X-Api-Key`) is deliberately NOT enough. It authenticates a
 * service, not a person, and there is no honest answer to "whose projects?"
 * for a caller that is nobody in particular.
 *
 * WHY NOT `chatIdentity`, WHICH ALREADY DOES THIS. It lives in
 * `src/agent/routes.ts` and pulls the whole agent stack (tools, chat,
 * provider) in behind it, which would drag that stack into every test of this
 * file. The part that could actually drift — verifying the token — is NOT
 * copied: `verifyAppSession` is the single implementation and all three
 * callers share it. What differs here is only which headers are read.
 *
 * An agent key (`X-Agent-Key`) names a person too, via `AGENT_KEYS`, so it
 * could be a third branch. It is not one yet because no agent tool asks for a
 * project, and a branch with no caller is how dead code gets written on
 * purpose. When a `project_*` tool exists, it goes here.
 */
export function projectOwner(req: IncomingMessage): string | null {
  const bearer = (req.headers['authorization'] as string | undefined) || ''
  if (bearer.startsWith('Bearer ')) {
    try {
      return verifyAppSession(bearer.slice(7).trim()).sub
    } catch {
      // A presented-but-invalid token is not a reason to fall through to the
      // signature branch: the client said how it authenticates, and a quiet
      // downgrade would hide "your session expired" behind "unauthorized".
      return null
    }
  }
  return verifiedTelegramId(req)
}

/**
 * A composition must be a JSON object, and that is all this checks.
 *
 * The tempting next step is validating tracks and clips here. It is the wrong
 * step: the shape is defined by the editors (Swift `Composition`, the player's
 * atoms), and a third copy of it on the server would be a third thing to keep
 * in sync — the same trap as a hand-written list of compositions that drifted
 * from the bundle it claimed to describe.
 *
 * What the server does owe is that this is not a scalar, an array or null
 * pretending to be a project. Anything looser and a client reads back
 * something it cannot decode.
 *
 * WHAT THE STORED COPY PRESERVES, MEASURED RATHER THAN ASSUMED. `composition`
 * is jsonb, not text, so the column is not a byte-for-byte echo: a live
 * round-trip against production showed KEY ORDER is not kept
 * (`{b,a}` came back `{a,b}`). Everything that carries meaning survived
 * unchanged — floats (0.5), whole floats, a 13-digit integer, empty arrays,
 * and Cyrillic with em-dashes and guillemets — and the objects compare equal
 * once keys are sorted.
 *
 * That is fine for every reader we have, and deliberately so: `JSONDecoder` in
 * Swift and the player's atoms both look keys up by name, and
 * `Composition.remotionJSON()` sorts keys before comparing anything. Order
 * would only matter to a client diffing raw bytes, and none does. Saying this
 * out loud so the next person does not spend a cycle on "the JSON changed".
 */
function isComposition(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Handle a project route. Returns false when the path is not ours, so the
 * caller's if-cascade goes on looking — the same shape `handleAuthRoute` uses.
 */
export async function handleProjectRoute(
  req: IncomingMessage,
  res: ServerResponse,
  getPool: () => Pool
): Promise<boolean> {
  const path = req.url?.split('?')[0] ?? ''
  if (path !== '/api/projects' && !path.startsWith('/api/projects/'))
    return false

  /**
   * Identity BEFORE the database.
   *
   * Order matters for what a stranger learns: asking Postgres first would let
   * an unauthenticated caller tell "database is down" from "database is up",
   * and would spend a connection on a request that was never going to be
   * answered.
   */
  const owner = projectOwner(req)
  if (!owner) {
    /**
     * This message is the route's own, and that is not decoration.
     *
     * The shared guard answers 401 with `no X-Api-Key and no Telegram initData`
     * for every path in the service, including paths that do not exist. A
     * route that echoed the same words would be indistinguishable from one
     * that was never deployed — a confusion this repository has paid for more
     * than once. Reading the BODY tells the two apart.
     */
    json(res, 401, {
      error: 'проект не знает, чей он',
      detail:
        'нужна сессия приложения (Authorization: Bearer) или подпись мини-аппа ' +
        '(X-Telegram-Init-Data). Ключ сервера здесь не годится: он не называет человека. ' +
        'Если сессия была — она истекла: обновите её через /api/auth/refresh.',
    })
    return true
  }

  // getPool() throws SYNCHRONOUSLY. Outside a try that escapes an async
  // handler and Node kills the process — a one-request denial of service, and
  // this service has already paid for it once.
  let pool: Pool
  try {
    pool = getPool()
    await ensureProjectsTable(pool)
  } catch (e) {
    json(res, 503, {
      error: 'база недоступна',
      detail: String(e).slice(0, 160),
    })
    return true
  }

  // ─── List: metadata only ───────────────────────────────────────────────
  if (path === '/api/projects' && req.method === 'GET') {
    /**
     * The list does NOT carry compositions.
     *
     * A person with twenty projects would otherwise download twenty timelines
     * to draw a list of twenty names. The client reads one project by id right
     * after, so the second request is not overhead — it is the only request
     * that fetches anything large.
     */
    const r = await pool.query(
      `SELECT id, name, updated_at FROM projects
        WHERE telegram_id = $1
        ORDER BY updated_at DESC
        LIMIT ${PROJECT_LIMITS.LIST}`,
      [owner]
    )
    json(res, 200, {
      projects: r.rows.map((x: any) => ({
        id: String(x.id),
        name: String(x.name ?? ''),
        updated_at: new Date(x.updated_at).toISOString(),
      })),
    })
    return true
  }

  const one = /^\/api\/projects\/([^/]+)$/.exec(path)

  // ─── Read one ──────────────────────────────────────────────────────────
  if (one && req.method === 'GET') {
    const id = decodeURIComponent(one[1])
    if (!projectIdIsValid(id)) {
      json(res, 400, { error: 'идентификатор проекта недопустим' })
      return true
    }

    /**
     * Ownership lives in the WHERE clause, not in an `if` after the read.
     *
     * Fetching by id and comparing afterwards works right up until someone
     * adds an early return above the comparison. In the query it cannot be
     * skipped by accident.
     */
    const r = await pool.query(
      `SELECT id, name, composition::text AS composition, updated_at
         FROM projects WHERE id = $1 AND telegram_id = $2`,
      [id, owner]
    )
    if (!r.rows.length) {
      /**
       * 404 for "not yours" as well as for "does not exist", on purpose.
       *
       * A 403 would confirm that the id names a real project belonging to
       * somebody, which is exactly the fact a private list should not leak.
       */
      json(res, 404, {
        error: 'проект не найден',
        detail: 'нет такого проекта у этого человека',
      })
      return true
    }

    const row = r.rows[0]
    json(res, 200, {
      id: String(row.id),
      name: String(row.name ?? ''),
      updated_at: new Date(row.updated_at).toISOString(),
      composition: JSON.parse(String(row.composition)),
    })
    return true
  }

  // ─── Create or replace ─────────────────────────────────────────────────
  if (one && req.method === 'PUT') {
    const id = decodeURIComponent(one[1])
    if (!projectIdIsValid(id)) {
      json(res, 400, { error: 'идентификатор проекта недопустим' })
      return true
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse((await readBody(req)) || '{}')
    } catch (e) {
      json(res, 400, {
        error: 'тело запроса не разобрано как JSON',
        detail: String(e).slice(0, 160),
      })
      return true
    }

    if (!isComposition(body.composition)) {
      json(res, 400, {
        error: 'нужна композиция',
        detail:
          'поле composition должно быть объектом JSON — таймлайном проекта',
      })
      return true
    }

    const name = String(body.name ?? '').slice(0, PROJECT_LIMITS.NAME_CHARS)

    /**
     * The upsert is guarded BY OWNER, and this is the security of this file.
     *
     * A bare `ON CONFLICT (id) DO UPDATE` would let anyone who guesses an id
     * overwrite a stranger's project — the conflict target is the primary key,
     * which says nothing about who owns the row. With the WHERE, a collision
     * on somebody else's row updates nothing and returns nothing, and the
     * answer below is the same 404 a stranger gets for reading it.
     *
     * `telegram_id` is not in the SET list either, so ownership cannot be
     * transferred by writing to a project you already own.
     */
    const r = await pool.query(
      `INSERT INTO projects (id, telegram_id, name, composition, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              composition = EXCLUDED.composition,
              updated_at = now()
        WHERE projects.telegram_id = $2
       RETURNING id, name, updated_at`,
      [id, owner, name, JSON.stringify(body.composition)]
    )

    if (!r.rows.length) {
      json(res, 404, {
        error: 'проект не найден',
        detail: 'этот идентификатор занят другим человеком',
      })
      return true
    }

    const row = r.rows[0]
    json(res, 200, {
      id: String(row.id),
      name: String(row.name ?? ''),
      updated_at: new Date(row.updated_at).toISOString(),
    })
    return true
  }

  /**
   * Anything else under /api/projects answers here rather than falling through.
   *
   * Returning false would send the request onward into a cascade full of
   * `startsWith` matchers, and this service has already answered a wrong 200
   * that way — a profile card served for a templates path, so nobody's videos
   * ever appeared on their profile. Owning the whole prefix keeps that
   * impossible, and naming what IS served saves the next caller a guess.
   */
  json(res, 404, {
    error: 'нет такого маршрута проектов',
    detail:
      `Путь «${path}» ${req.method} не обслуживается. Есть GET /api/projects, ` +
      'GET /api/projects/:id и PUT /api/projects/:id.',
  })
  return true
}
