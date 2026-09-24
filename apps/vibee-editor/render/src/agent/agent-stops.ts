/**
 * A STOP THAT SURVIVES THE ABSENCE OF A SOCKET.
 *
 * Issue #2721 asks for `stop_requested_at` checked at step boundaries, and the
 * reason is narrow and real: most turns are stopped by the caller hanging up
 * -- the bot aborts its fetch, the socket closes, and `runAgent` sees its
 * signal. A turn with NO caller on a socket has nothing to close: the duet
 * writes into a chat of its own, an a2a call arrives over one request and
 * leaves the run behind it.
 *
 * So the stop is written down instead of signalled, and the run asks between
 * steps whether one has been written since it began.
 *
 * ── WHY "SINCE IT BEGAN" IS THE WHOLE DESIGN ───────────────────────────────
 *
 * A flag that merely says "stopped" would stop the NEXT run too, and the one
 * after that: a person presses Stop once and the seller goes quiet for good,
 * which is the failure this shape exists to avoid. The row holds a TIME, and a
 * run compares it with its own start. A stop pressed before the run started is
 * about a different run and means nothing here.
 *
 * ── WHAT IT COSTS ──────────────────────────────────────────────────────────
 *
 * One indexed read per step, at most eight per turn, against a table with one
 * row per owner. Next to a model call that takes seconds, it does not show.
 *
 * ── AND WHAT IT MUST NEVER DO ──────────────────────────────────────────────
 *
 * Never throw. A database that is slow or down must not end turns: an
 * unreadable flag means "no stop was written", because the alternative is a
 * hiccup in Postgres silently cancelling everybody's work.
 */

export interface StopPool {
  query(sql: string, params?: unknown[]): Promise<{ rows?: any[] }>
}

export const STOPS_TABLE = `CREATE TABLE IF NOT EXISTS agent_stops (
   owner_id text PRIMARY KEY,
   at       timestamptz NOT NULL DEFAULT now()
 )`

/** One row per owner: the latest stop wins, older ones are of no interest. */
export const STOP_WRITE = `INSERT INTO agent_stops (owner_id, at)
   VALUES ($1, now())
   ON CONFLICT (owner_id) DO UPDATE SET at = now()`

/** Was a stop written for this owner AFTER the moment the run began? */
export const STOP_READ = `SELECT 1 FROM agent_stops
   WHERE owner_id = $1 AND at > to_timestamp($2 / 1000.0)
   LIMIT 1`

let ready: Promise<void> | null = null

async function ensure(pool: StopPool): Promise<void> {
  ready ??= pool.query(STOPS_TABLE).then(() => undefined)
  await ready
}

/** For tests: the one-per-process latch must not leak between them. */
export function forgetStopsTableForTests(): void {
  ready = null
}

/** Write "this owner asked to stop", now. Never throws. */
export async function requestStop(
  pool: StopPool,
  owner: string
): Promise<'written' | 'not written'> {
  const id = String(owner ?? '').trim()
  if (!id) return 'not written'
  try {
    await ensure(pool)
    await pool.query(STOP_WRITE, [id])
    return 'written'
  } catch {
    return 'not written'
  }
}

/**
 * Has this owner asked to stop since `startedMs`?
 *
 * False on any failure, deliberately: see the header. A run must not end
 * because a query did.
 */
export async function stopRequested(
  pool: StopPool | null | undefined,
  owner: string,
  startedMs: number
): Promise<boolean> {
  const id = String(owner ?? '').trim()
  if (!pool || !id || !Number.isFinite(startedMs)) return false
  try {
    await ensure(pool)
    const r = await pool.query(STOP_READ, [id, Math.floor(startedMs)])
    return (r.rows ?? []).length > 0
  } catch {
    return false
  }
}
