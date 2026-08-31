/**
 * THE AUTOPILOT'S MEMORY, MOVED OFF A DISK THAT DOES NOT SURVIVE A DEPLOY.
 *
 * The factory kept its whole memory in loop/state.json inside the container.
 * This Railway project has NO volumes, so every merge to main wiped it: the
 * queue cursor went back to 0, the daily counter went back to 0, and the
 * spacing timestamp vanished. The daily cap was already rescued by counting the
 * feed, but the CURSOR has no second source -- the feed only knows titles. So
 * after each wipe the cycle spent one 30-minute tick per already-published
 * topic just to walk the cursor forward one step at a time (the dedupe branch
 * in agent-autopilot.ts advances by one and returns). That is the outage this
 * module exists to end.
 *
 * WHY THIS FILE IS IN src/ AND NOT NEXT TO THE SCRIPT. tsconfig include is
 * ["src/**\/*", "render-server.ts"]; `tsc --listFilesOnly` shows ZERO files
 * under scripts/. Nothing in scripts/ has ever been typechecked -- which is how
 * the top-level-await breakage shipped green. New logic put beside the script
 * would be invisible to `npm run typecheck`, so it lives here instead.
 *
 * WHY CREATE TABLE IF NOT EXISTS RATHER THAN A MIGRATION. Same reason stated in
 * session-store.ts: this project has no migration runner, and `agent_keys`
 * (src/agent/routes.ts), `star_payments` and `user_tokens` (src/stars-credit.ts)
 * are all created on first use. A second convention would mean a schema nobody
 * runs.
 *
 * THE FILE IS NOT REPLACED, IT IS DEMOTED. Postgres is the durable copy; the
 * file remains the local floor, correct within one container lifetime and the
 * only state left when the database is unreachable. Every write goes to both.
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * Structural, deliberately not `import type { Pool } from 'pg'`.
 *
 * Same trick as session-store.ts and ToolContext.pool: a test passes a plain
 * object and needs no database, and this module stays loadable if pg is absent.
 */
export type Db = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

export interface AutopilotState {
  date: string
  postsToday: number
  nextTopic: number
  /** Title published at nextTopic-1. See cursorFor: the index alone lies. */
  lastTopic?: string
  /** ISO moment of the last publication; the 3-hour spacing rule reads it. */
  lastPostAt?: string
}

export interface Log {
  (line: string): void
}

export const TABLE = `CREATE TABLE IF NOT EXISTS autopilot_state (
     owner text PRIMARY KEY,
     day date NOT NULL,
     posts_today int NOT NULL DEFAULT 0,
     next_topic int NOT NULL DEFAULT 0,
     last_topic text,
     last_post_at timestamptz,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`

/**
 * The upsert merges instead of overwriting, because two containers can write.
 *
 * The singleton guard in the script is a PID lock file inside LOOP_DIR, i.e.
 * per-container; a rolling Railway deploy briefly runs the old and the new
 * container at once, both with AUTOPILOT_LOOP=1, both writing this one row.
 * posts_today and last_post_at are therefore high-water marks within a day, so
 * a late write from the dying container cannot lower the cap or un-space the
 * posts. GREATEST ignores NULL in Postgres, so the first write is safe.
 */
export const UPSERT = `INSERT INTO autopilot_state
     (owner, day, posts_today, next_topic, last_topic, last_post_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, $6, now())
   ON CONFLICT (owner) DO UPDATE SET
     day = EXCLUDED.day,
     posts_today = CASE WHEN autopilot_state.day = EXCLUDED.day
                        THEN GREATEST(autopilot_state.posts_today, EXCLUDED.posts_today)
                        ELSE EXCLUDED.posts_today END,
     next_topic = GREATEST(autopilot_state.next_topic, EXCLUDED.next_topic),
     -- THE TITLE MUST FOLLOW THE WINNING CURSOR, or the guard above is inert.
     --
     -- This was an unconditional EXCLUDED.last_topic, and cursorFor resolves by
     -- TITLE FIRST. So during a rolling deploy the dying container's title
     -- overwrote the survivor's while GREATEST kept the survivor's index, and
     -- the cursor resolved to the STALE title -- walking the queue backwards
     -- past topics that had already gone out. Reproduced against real Postgres
     -- 17 on 2026-08-29: writer A {8,'t7'}, then late writer B {5,'t4'} left
     -- next_topic=8 with last_topic='t4', and cursorFor answered 5.
     --
     -- Keeping index and title from the same writer is the same rule mergeState
     -- already applies in JS: a title from one source with an index from the
     -- other is a lie.
     last_topic = CASE WHEN EXCLUDED.next_topic >= autopilot_state.next_topic
                       THEN EXCLUDED.last_topic
                       ELSE autopilot_state.last_topic END,
     last_post_at = GREATEST(autopilot_state.last_post_at, EXCLUDED.last_post_at),
     updated_at = now()`

/**
 * day::text is `YYYY-MM-DD`, byte-identical to the `toISOString().slice(0,10)`
 * the script compares it against, and last_post_at comes back as an ISO string
 * so Date.parse and the plain string comparison in the spacing rule keep
 * working unchanged.
 */
export const SELECT = `SELECT day::text AS date, posts_today, next_topic, last_topic,
          to_char(last_post_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_post_at
     FROM autopilot_state WHERE owner = $1`

/**
 * A new day zeroes the COUNTER and nothing else.
 *
 * Exactly the rule that used to be inlined in the script's readState: the queue
 * cursor and the spacing timestamp survive midnight, otherwise the autopilot
 * would open every day by re-walking topics it already published.
 */
export function rollDay(
  raw: Partial<AutopilotState> | null | undefined,
  today: string
): AutopilotState {
  const s: AutopilotState = { date: today, postsToday: 0, nextTopic: 0 }
  if (!raw) return s
  if (Number.isInteger(raw.nextTopic)) s.nextTopic = raw.nextTopic as number
  if (raw.lastTopic) s.lastTopic = String(raw.lastTopic)
  if (raw.lastPostAt) s.lastPostAt = String(raw.lastPostAt)
  if (raw.date === today && Number.isFinite(raw.postsToday))
    s.postsToday = Number(raw.postsToday)
  return s
}

/**
 * Every source is a FLOOR, never an authority -- the rule the feed-derived cap
 * already follows. The cursor takes the larger of the two: a database write can
 * fail after the file write succeeded, and the queue must never walk backwards
 * onto a topic that already went out. lastTopic follows whichever cursor won,
 * because a title from one source with an index from the other is a lie.
 */
export function mergeState(
  file: AutopilotState,
  db: AutopilotState | null
): AutopilotState {
  if (!db) return file
  const ahead = db.nextTopic >= file.nextTopic ? db : file
  const lastPostAt = [file.lastPostAt, db.lastPostAt]
    .filter((v): v is string => !!v)
    .sort()
    .pop()
  return {
    date: file.date,
    postsToday: Math.max(file.postsToday, db.postsToday),
    nextTopic: ahead.nextTopic,
    lastTopic: ahead.lastTopic,
    ...(lastPostAt ? { lastPostAt } : {}),
  }
}

/**
 * MAKING THE CURSOR DURABLE WITHOUT THIS CLAMP WOULD TURN DATA LOSS INTO A
 * CRASH LOOP.
 *
 * loop/topics.json is git-tracked and the Dockerfile does `COPY render/ ./`, so
 * the array is re-seeded to its committed topics on every deploy while the
 * blog top-up appended at runtime is thrown away. A persisted nextTopic of 9
 * against an array of 4 used to be harmless only because the same deploy also
 * reset it to 0. Resolve by TITLE first -- that survives a re-seed -- and never
 * hand back an index past the end; the caller reads `>= length` as "queue
 * exhausted", not as an array index.
 */
export function cursorFor(s: AutopilotState, titles: string[]): number {
  if (s.lastTopic) {
    const at = titles.indexOf(s.lastTopic)
    if (at >= 0) return at + 1
  }
  return Math.max(0, Math.min(s.nextTopic, titles.length))
}

/**
 * DOES THIS POST GET THE ONE PAID MEDALLION SLOT OF THE DAY?
 *
 * WHY IT IS A FUNCTION IN src/ AND NOT AN EXPRESSION IN THE SCRIPT. It was an
 * expression in the script, and it read a DIFFERENT counter from the one the
 * daily cap reads: the cap uses max(local file, live feed), the slot used the
 * local file alone. Those two agree only until a deploy wipes state.json, which
 * happens on every merge in a container with no volumes. After one such loss
 * the feed count runs permanently ahead of the local one -- the cap fires at 4
 * while the local counter is still climbing through 1 -- and an equality test
 * against `max - 1` is stepped straight over. The paid layer then never runs
 * again, and "never runs" is indistinguishable from "switched off".
 *
 * `>=`, not `===`, for the same reason: a counter that can jump must not be
 * gated on landing exactly on a number.
 *
 * Nothing under scripts/ is in any tsconfig include, so an expression there is
 * unreachable by `npm run typecheck` and by any unit test. Here it is both.
 */
export function paidSlotDue(
  postedToday: number,
  maxPerDay: number,
  forced = false
): boolean {
  if (forced) return true
  return postedToday >= maxPerDay - 1
}

/**
 * A short-lived pool, or null when there is no database to talk to.
 *
 * `await import('pg')` INSIDE the function, not at the top: this package is
 * CommonJS and the module must stay loadable with pg absent. Same shape as
 * scripts/morning-summary.ts, which already states the contract this follows --
 * without DATABASE_URL the feature simply does not appear, no crash.
 *
 * NO `ssl` OPTION, unlike getPool() in render-server.ts, and that is measured
 * rather than copied. render-server forces `ssl: { rejectUnauthorized: false }`;
 * with that setting a Postgres that does not offer TLS answers "The server does
 * not support SSL connections" and the cycle degrades to the file -- verified
 * here against the local database on 2026-08-29. The three sibling scripts in
 * this directory (morning-summary, pipeline-retrospective, telegram-autopost)
 * run in the same container with the same DATABASE_URL and pass no ssl option
 * at all, and pg negotiates TLS on its own when the DSN asks for it. Following
 * the neighbours therefore works everywhere render-server's setting works AND
 * on a plain local Postgres, where a silent file-fallback would look exactly
 * like a working database.
 */
export async function openDb(): Promise<{
  db: Db
  close(): Promise<void>
} | null> {
  const url = process.env.DATABASE_URL
  if (!url) return null
  try {
    const { Pool } = await import('pg')
    const pool = new Pool({
      connectionString: url,
      // One connection, and a hard ceiling on waiting for it: a dead database
      // must cost the cycle seconds, not the whole 30-minute interval.
      max: 1,
      connectionTimeoutMillis: 5_000,
    })
    /**
     * A POOL WITHOUT THIS LISTENER TAKES THE PROCESS DOWN.
     *
     * pg emits 'error' on the Pool when a connection sitting IDLE in it dies --
     * a database restart, a failover, an administrator terminating the backend.
     * With no listener, EventEmitter turns that into an uncaughtException, and
     * every try/catch in this module is irrelevant because nothing is awaiting.
     * Forced on 2026-08-29: pg_terminate_backend against an idle pooled
     * connection killed the script with exit 7, one second after the query it
     * was supposedly protecting had already succeeded.
     *
     * The module's contract is that a database problem degrades to the file and
     * never throws outward; under the render server's respawn supervisor an
     * escaped error is a 60-second crash loop, not a visible failure. So the
     * event is logged and swallowed here, where the contract lives.
     */
    pool.on('error', err => {
      console.log(
        `[autopilot] соединение с базой оборвалось: ${String((err as Error)?.message || err).slice(0, 120)}`
      )
    })
    return { db: pool as unknown as Db, close: () => pool.end() }
  } catch {
    // pg missing or an unparseable DSN. Nothing to report to the caller but
    // "no database"; the fallback path below says it in the log.
    return null
  }
}

/**
 * Open, use, close. The close is NOT optional and its cost was measured, not
 * assumed: with the finally removed and a reachable Postgres, a one-shot run
 * took 10 099 ms to exit instead of 81 ms -- pg's default idle timeout holding
 * the socket. In production that turns a 30-minute cycle into a process that
 * outlives its own work, and it would break the startability test that waits
 * for the script with spawnSync.
 *
 * `open` is a parameter only so a test can hand in a pool that never touches a
 * database. Nothing in production passes it.
 */
export async function withDb<T>(
  fn: (db: Db | null) => Promise<T>,
  open: typeof openDb = openDb
): Promise<T> {
  const opened = await open()
  if (!opened) return fn(null)
  try {
    return await fn(opened.db)
  } finally {
    await opened.close().catch(() => {
      /* the pool is going away with the process anyway */
    })
  }
}

function readFile(stateFile: string): Partial<AutopilotState> | null {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {
    return null // first run, or the deploy that wiped the container
  }
}

/**
 * The state the cycle should act on: file first, database on top of it.
 *
 * NEVER THROWS. The caller has no branch for a failure, and in one-shot mode an
 * escaped error becomes exit 1 under the render server's respawn supervisor --
 * a 60-second crash loop instead of a degraded cycle. An unreachable database
 * is announced in the log and then ignored: a silent fallback would look
 * exactly like a working one, which is how the original wipe stayed invisible.
 */
export async function loadState(opts: {
  db: Db | null
  owner: string
  stateFile: string
  today: string
  log: Log
}): Promise<AutopilotState> {
  const { db, owner, stateFile, today, log } = opts
  const file = rollDay(readFile(stateFile), today)
  if (!db) {
    // BOTH no-database cases have to speak. The first version only logged the
    // missing-DATABASE_URL one, so a configured URL whose pool could not even be
    // constructed (pg pruned from the image, an unparseable DSN) fell back to
    // the file in complete silence -- indistinguishable from a healthy load,
    // which is precisely how the original state wipe stayed invisible for days.
    log(
      process.env.DATABASE_URL
        ? 'состояние: база не открылась — только файл'
        : 'состояние: без DATABASE_URL — только файл'
    )
    return file
  }
  try {
    await db.query(TABLE)
    const r = await db.query(SELECT, [owner])
    const row = r?.rows?.[0]
    if (!row) return file
    const fromDb = rollDay(
      {
        date: String(row.date),
        postsToday: Number(row.posts_today) || 0,
        nextTopic: Number(row.next_topic) || 0,
        lastTopic: row.last_topic ? String(row.last_topic) : undefined,
        lastPostAt: row.last_post_at ? String(row.last_post_at) : undefined,
      },
      today
    )
    return mergeState(file, fromDb)
  } catch (e) {
    log(
      `состояние: база недоступна (${String(e).slice(0, 120)}) — беру из файла`
    )
    return file
  }
}

/**
 * Write to BOTH, and let neither failure eat the other.
 *
 * The file write is not skipped when the database write succeeds: it is the
 * only state that survives a database outage inside one container lifetime,
 * and it is what a developer opens to see what the factory is doing.
 */
export async function saveState(opts: {
  db: Db | null
  owner: string
  stateFile: string
  state: AutopilotState
  log: Log
}): Promise<void> {
  const { db, owner, stateFile, state, log } = opts
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true })
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
  } catch (e) {
    log(`состояние: файл не записан (${String(e).slice(0, 120)})`)
  }
  if (!db) return
  try {
    await db.query(TABLE)
    await db.query(UPSERT, [
      owner,
      state.date,
      state.postsToday,
      state.nextTopic,
      state.lastTopic ?? null,
      state.lastPostAt ?? null,
    ])
  } catch (e) {
    log(
      `состояние: база не приняла запись (${String(e).slice(0, 120)}) — только файл`
    )
  }
}

/**
 * Which person this autopilot posts as. Same pairing the server uses to resolve
 * an agent key (AGENT_KEYS="key:telegramId"), so the row sits under the same
 * ownership convention as agent_renders and user_tokens. A malformed AGENT_KEYS
 * falls back to a literal rather than producing a NULL primary key.
 */
export function ownerFromEnv(): string {
  const pair = (process.env.AGENT_KEYS || '').split(',')[0] || ''
  return pair.split(':')[1]?.trim() || 'autopilot'
}
