/**
 * Jobs for generation, so a dropped connection cannot lose a paid result.
 *
 * WHAT WAS WRONG. POST /api/generate/video answers synchronously after ~54
 * seconds, measured on production. The client waits in a single fetch with no
 * timeout and no way to ask again. Any interruption in that window — a phone
 * locking, a train tunnel, a proxy's 30-second cap — loses a generation that
 * has already been paid for at the provider. The money is spent, the file
 * exists in storage, and nobody can find it.
 *
 * WHAT THIS CHANGES. The result is recorded the moment it exists, under an id
 * the caller was handed before the work started. The slow response stays for
 * clients that want it, because changing that is a client migration and this
 * is not. What is new is that the answer survives the caller going away.
 *
 * MEMORY FIRST, TABLE BEHIND IT. The map answers the hot path so a database
 * outage cannot break generation itself — the thing people paid for must not
 * depend on the index that merely finds it later. The table is written
 * through, best effort, and read only when memory does not have the answer.
 *
 * That ordering is the whole design. The previous version was memory only and
 * said so honestly, but a rescue that a deploy forgets is not a rescue: the
 * window where someone loses a connection and the window where we restart are
 * the same window.
 */

import crypto from 'node:crypto'

export type JobState = 'running' | 'done' | 'failed'

export interface GenerateJob {
  id: string
  kind: 'image' | 'video' | 'audio' | 'lipsync'
  /** Whose job it is. Empty when the caller authenticated server-to-server. */
  owner: string
  state: JobState
  startedAt: number
  finishedAt?: number
  url?: string
  provider?: string
  error?: string
  /** Echoed back so a recovered job is recognisable without a second lookup. */
  prompt?: string
}

const jobs = new Map<string, GenerateJob>()

type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

/**
 * The pool is handed in rather than imported.
 *
 * `getPool()` throws SYNCHRONOUSLY when DATABASE_URL is unset — already paid
 * for once in this repo, where it escaped an async handler and Node killed the
 * process on a single request. Taking it as a parameter means this module
 * never calls it, and a server without a database simply runs memory-only.
 */
let pool: Pool | null = null
let schemaReady = false

export function attachStore(p: Pool | null): void {
  pool = p
  schemaReady = false
}

async function ensureSchema(): Promise<boolean> {
  if (!pool) return false
  if (schemaReady) return true
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS generate_jobs (
        id text PRIMARY KEY,
        kind text NOT NULL,
        owner_id text NOT NULL DEFAULT '',
        state text NOT NULL,
        started_at timestamptz NOT NULL,
        finished_at timestamptz,
        url text,
        provider text,
        error text,
        prompt text
      )`)
    await pool.query(
      `CREATE INDEX IF NOT EXISTS generate_jobs_owner
         ON generate_jobs (owner_id, started_at DESC)`
    )
    schemaReady = true
    return true
  } catch {
    // A schema failure must not take down generation. We lose durability for
    // this process, not the ability to generate.
    return false
  }
}

/**
 * Write-through, and deliberately not awaited by callers.
 *
 * `startJob` is on the path to a provider that will take a minute; making it
 * wait on a database round trip to hand back an id would add latency to the
 * one operation that must not fail. Failures are swallowed for the same
 * reason: an index that cannot be written is worth less than a generation
 * that cannot start.
 */
function persist(job: GenerateJob): void {
  void (async () => {
    if (!(await ensureSchema()) || !pool) return
    try {
      await pool.query(
        `INSERT INTO generate_jobs
           (id, kind, owner_id, state, started_at, finished_at, url, provider, error, prompt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state,
           finished_at = EXCLUDED.finished_at,
           url = EXCLUDED.url,
           provider = EXCLUDED.provider,
           error = EXCLUDED.error`,
        [
          job.id, job.kind, job.owner, job.state,
          new Date(job.startedAt).toISOString(),
          job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
          job.url ?? null, job.provider ?? null, job.error ?? null, job.prompt ?? null,
        ]
      )
    } catch {
      // Same reasoning as above.
    }
  })()
}

function fromRow(r: any): GenerateJob {
  return {
    id: String(r.id),
    kind: r.kind,
    owner: String(r.owner_id ?? ''),
    state: r.state,
    startedAt: new Date(r.started_at).getTime(),
    finishedAt: r.finished_at ? new Date(r.finished_at).getTime() : undefined,
    url: r.url ?? undefined,
    provider: r.provider ?? undefined,
    error: r.error ?? undefined,
    prompt: r.prompt ?? undefined,
  }
}

/**
 * An hour, matching renderJobs.
 *
 * Long enough that someone who lost the connection can still find the result
 * after re-opening the app; short enough that the map cannot grow without
 * bound on a long-lived process.
 */
const TTL_MS = 60 * 60 * 1000

const sweeper = setInterval(() => {
  const cutoff = Date.now() - TTL_MS
  for (const [id, job] of jobs) {
    if ((job.finishedAt ?? job.startedAt) < cutoff) jobs.delete(id)
  }
}, 5 * 60 * 1000)
// A bare setInterval keeps the event loop alive and makes tests hang on exit.
sweeper.unref?.()

export function startJob(
  kind: GenerateJob['kind'],
  owner: string,
  prompt?: string
): GenerateJob {
  const job: GenerateJob = {
    id: crypto.randomUUID(),
    kind,
    owner: owner || '',
    state: 'running',
    startedAt: Date.now(),
    prompt: prompt?.slice(0, 200),
  }
  jobs.set(job.id, job)
  persist(job)
  return job
}

export function finishJob(id: string, url: string, provider?: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.state = 'done'
  job.url = url
  job.provider = provider
  job.finishedAt = Date.now()
  persist(job)
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id)
  if (!job) return
  job.state = 'failed'
  // Truncated: provider errors can carry whole HTML pages, and this is read
  // by a person on a phone screen.
  job.error = error.slice(0, 400)
  job.finishedAt = Date.now()
  persist(job)
}

export function getJob(id: string): GenerateJob | undefined {
  return jobs.get(id)
}

/**
 * Recent jobs for one person, newest first.
 *
 * OWNERSHIP IS ENFORCED HERE, not by the caller. A generation prompt is
 * personal — it says what someone was trying to make — and the url points at
 * a file they paid for. Returning another account's list would be a leak, so
 * an empty owner matches NOTHING rather than matching everything, which is
 * what a naive `job.owner === owner` would do for a server-to-server caller.
 */
export function listJobs(owner: string, limit = 20): GenerateJob[] {
  if (!owner) return []
  return [...jobs.values()]
    .filter(j => j.owner === owner)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
}

/** Test seam: the sweeper is time-based and tests must not wait an hour. */
export function _resetJobs(): void {
  jobs.clear()
}

/**
 * Record whatever this route ends up answering, whichever branch produces it.
 *
 * The video handler has several success points — the primary provider, a
 * fallback, and two error paths — and hooking each one means editing tangled
 * provider logic four times and missing the fifth when someone adds it.
 * Wrapping `end` once catches every branch by construction, including
 * branches that do not exist yet.
 *
 * `end` is wrapped, not replaced: the original still runs, so the slow
 * synchronous answer is untouched for clients that are waiting for it.
 */
export function recordInto(job: GenerateJob, res: {
  end: (chunk?: any, ...rest: any[]) => any
}): void {
  const original = res.end.bind(res)
  res.end = ((chunk?: any, ...rest: any[]) => {
    try {
      const text = typeof chunk === 'string' ? chunk : chunk?.toString?.('utf8')
      if (text) {
        const parsed = JSON.parse(text)
        if (parsed?.success && parsed?.url) {
          finishJob(job.id, String(parsed.url), parsed.provider)
        } else if (parsed?.error) {
          failJob(job.id, String(parsed.error))
        }
      }
    } catch {
      // A non-JSON body is not a reason to fail the request. The job simply
      // stays 'running' and is swept — losing the index entry, never the
      // response the caller is about to receive.
    }
    return original(chunk, ...rest)
  }) as typeof res.end
}

/**
 * Read with a fallback to the table.
 *
 * Kept separate from the synchronous `getJob`/`listJobs` rather than replacing
 * them: those are what `recordInto` and the tests use on the hot path, where a
 * database round trip would be wasted — the job was created microseconds ago
 * and is certainly in memory. The async pair exists for the one caller that
 * genuinely might be asking after a restart: a person looking for a
 * generation they paid for.
 */
export async function getJobDurable(id: string): Promise<GenerateJob | undefined> {
  const hit = jobs.get(id)
  if (hit) return hit
  if (!(await ensureSchema()) || !pool) return undefined
  try {
    const r = await pool.query(`SELECT * FROM generate_jobs WHERE id = $1`, [id])
    return r.rows.length ? fromRow(r.rows[0]) : undefined
  } catch {
    return undefined
  }
}

export async function listJobsDurable(owner: string, limit = 20): Promise<GenerateJob[]> {
  // The same refusal as the synchronous version, and stated first so it cannot
  // be reached around: an empty owner matches nothing, never everything.
  if (!owner) return []

  const inMemory = listJobs(owner, limit)
  if (!(await ensureSchema()) || !pool) return inMemory

  try {
    const r = await pool.query(
      `SELECT * FROM generate_jobs
        WHERE owner_id = $1
        ORDER BY started_at DESC
        LIMIT $2`,
      [owner, limit]
    )
    /**
     * Memory wins on conflict, because it is newer.
     *
     * A job that finished a moment ago is already correct in memory while the
     * write-through may still be in flight. Taking the row instead would show
     * "running" for something that is done — the exact wrong answer for
     * someone checking whether their generation survived.
     */
    const merged = new Map(r.rows.map((row: any) => [String(row.id), fromRow(row)]))
    for (const j of inMemory) merged.set(j.id, j)
    return [...merged.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit)
  } catch {
    return inMemory
  }
}
